
-- ============ 1. RELIABILITY ============
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS reliability_score int NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS reliability_events_count int NOT NULL DEFAULT 0;

DO $$ BEGIN
  CREATE TYPE public.reliability_event_type AS ENUM (
    'assignment_accepted','service_completed','on_time_service',
    'customer_complaint','missed_service','assignment_cancelled','repeated_unavailability'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.partner_reliability_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  event_type public.reliability_event_type NOT NULL,
  delta int NOT NULL,
  service_id uuid,
  assignment_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pre_partner_created ON public.partner_reliability_events(partner_id, created_at DESC);

GRANT SELECT ON public.partner_reliability_events TO authenticated;
GRANT ALL ON public.partner_reliability_events TO service_role;
ALTER TABLE public.partner_reliability_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partners read own reliability events" ON public.partner_reliability_events;
CREATE POLICY "Partners read own reliability events" ON public.partner_reliability_events
  FOR SELECT TO authenticated USING (partner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- Apply delta + clamp on insert
CREATE OR REPLACE FUNCTION public.apply_reliability_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.partners
    SET reliability_score = GREATEST(0, LEAST(100, reliability_score + NEW.delta)),
        reliability_events_count = reliability_events_count + 1,
        updated_at = now()
    WHERE id = NEW.partner_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_apply_reliability_event ON public.partner_reliability_events;
CREATE TRIGGER trg_apply_reliability_event AFTER INSERT ON public.partner_reliability_events
  FOR EACH ROW EXECUTE FUNCTION public.apply_reliability_event();

CREATE OR REPLACE FUNCTION public.log_reliability_event(
  _partner_id uuid, _event_type public.reliability_event_type,
  _service_id uuid DEFAULT NULL, _assignment_id uuid DEFAULT NULL, _note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _delta int;
BEGIN
  _delta := CASE _event_type
    WHEN 'assignment_accepted' THEN 1
    WHEN 'service_completed' THEN 2
    WHEN 'on_time_service' THEN 1
    WHEN 'customer_complaint' THEN -5
    WHEN 'missed_service' THEN -8
    WHEN 'assignment_cancelled' THEN -4
    WHEN 'repeated_unavailability' THEN -3
  END;
  INSERT INTO public.partner_reliability_events(partner_id, event_type, delta, service_id, assignment_id, note)
    VALUES (_partner_id, _event_type, _delta, _service_id, _assignment_id, _note);
END $$;

-- Triggers on existing tables
CREATE OR REPLACE FUNCTION public.trg_offer_accepted_reliability() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.response = 'accepted' AND (OLD.response IS DISTINCT FROM 'accepted') THEN
    PERFORM public.log_reliability_event(NEW.partner_id, 'assignment_accepted', NULL, NULL, 'offer:'||NEW.id::text);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_offer_accepted_reliability ON public.subscription_offers;
CREATE TRIGGER trg_offer_accepted_reliability AFTER UPDATE ON public.subscription_offers
  FOR EACH ROW EXECUTE FUNCTION public.trg_offer_accepted_reliability();

CREATE OR REPLACE FUNCTION public.trg_service_status_reliability() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.partner_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    PERFORM public.log_reliability_event(NEW.partner_id, 'service_completed', NEW.id, NEW.assignment_id, NULL);
  ELSIF NEW.status = 'missed' AND (OLD.status IS DISTINCT FROM 'missed') THEN
    PERFORM public.log_reliability_event(NEW.partner_id, 'missed_service', NEW.id, NEW.assignment_id, NULL);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_service_status_reliability ON public.services;
CREATE TRIGGER trg_service_status_reliability AFTER UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.trg_service_status_reliability();

CREATE OR REPLACE FUNCTION public.trg_complaint_reliability() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pid uuid;
BEGIN
  -- complaints table may reference partner_id or via service; prefer direct partner_id col if present
  BEGIN
    _pid := (NEW).partner_id;
  EXCEPTION WHEN undefined_column THEN _pid := NULL; END;
  IF _pid IS NOT NULL THEN
    PERFORM public.log_reliability_event(_pid, 'customer_complaint', NULL, NULL, 'complaint:'||NEW.id::text);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_complaint_reliability ON public.complaints;
CREATE TRIGGER trg_complaint_reliability AFTER INSERT ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.trg_complaint_reliability();

-- ============ 2. ASSIGNMENT LOCK ============
ALTER TABLE public.subscription_assignment_queue
  ADD COLUMN IF NOT EXISTS locked_partner_id uuid,
  ADD COLUMN IF NOT EXISTS lock_until timestamptz;

INSERT INTO public.platform_settings(key, value, description)
  VALUES ('assignment_lock_days', '15'::jsonb, 'Days a customer stays locked to the accepting partner')
  ON CONFLICT (key) DO NOTHING;

-- On offer accept, set lock on queue
CREATE OR REPLACE FUNCTION public.trg_offer_accepted_lock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _days int;
BEGIN
  IF NEW.response = 'accepted' AND (OLD.response IS DISTINCT FROM 'accepted') THEN
    SELECT COALESCE((value)::text::int, 15) INTO _days FROM public.platform_settings WHERE key = 'assignment_lock_days';
    UPDATE public.subscription_assignment_queue
      SET locked_partner_id = NEW.partner_id,
          lock_until = now() + make_interval(days => COALESCE(_days,15)),
          updated_at = now()
      WHERE id = NEW.queue_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_offer_accepted_lock ON public.subscription_offers;
CREATE TRIGGER trg_offer_accepted_lock AFTER UPDATE ON public.subscription_offers
  FOR EACH ROW EXECUTE FUNCTION public.trg_offer_accepted_lock();

CREATE OR REPLACE FUNCTION public.can_reassign_subscription(_queue_id uuid, _actor_role text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _lu timestamptz;
BEGIN
  IF _actor_role = 'admin' THEN RETURN true; END IF;
  SELECT lock_until INTO _lu FROM public.subscription_assignment_queue WHERE id = _queue_id;
  RETURN _lu IS NULL OR now() > _lu;
END $$;

-- Realtime publication
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_reliability_events;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
