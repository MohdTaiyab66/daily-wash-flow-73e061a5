
CREATE OR REPLACE FUNCTION public.pipeline_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE public.pipeline_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    uuid,
  stage         text NOT NULL,
  source        text NOT NULL,
  actor         text,
  row_id        uuid,
  status        text NOT NULL DEFAULT 'ok',
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pipeline_events_booking  ON public.pipeline_events(booking_id, occurred_at);
CREATE INDEX idx_pipeline_events_stage    ON public.pipeline_events(stage, source, occurred_at DESC);
CREATE INDEX idx_pipeline_events_source   ON public.pipeline_events(source, occurred_at DESC);

GRANT SELECT ON public.pipeline_events TO authenticated;
GRANT ALL    ON public.pipeline_events TO service_role;
ALTER TABLE public.pipeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read pipeline_events"
  ON public.pipeline_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role manages pipeline_events"
  ON public.pipeline_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE public.pipeline_state (
  booking_id           uuid PRIMARY KEY,
  current_stage        text NOT NULL DEFAULT 'created',
  reached_stages       text[] NOT NULL DEFAULT ARRAY[]::text[],
  legacy_snapshot      jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_snapshot         jsonb NOT NULL DEFAULT '{}'::jsonb,
  divergence_detected  boolean NOT NULL DEFAULT false,
  divergence_reason    text,
  last_compared_at     timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pipeline_state_divergence ON public.pipeline_state(divergence_detected, updated_at DESC);

GRANT SELECT ON public.pipeline_state TO authenticated;
GRANT ALL    ON public.pipeline_state TO service_role;
ALTER TABLE public.pipeline_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read pipeline_state"
  ON public.pipeline_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role manages pipeline_state"
  ON public.pipeline_state FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_pipeline_state_updated_at
  BEFORE UPDATE ON public.pipeline_state
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_touch_updated_at();

CREATE OR REPLACE FUNCTION public.ds_log_event(
  p_booking_id uuid, p_stage text, p_source text, p_actor text,
  p_row_id uuid DEFAULT NULL, p_status text DEFAULT 'ok',
  p_payload jsonb DEFAULT '{}'::jsonb, p_error text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.pipeline_events(booking_id,stage,source,actor,row_id,status,payload,error_message)
  VALUES (p_booking_id,p_stage,p_source,p_actor,p_row_id,p_status,COALESCE(p_payload,'{}'::jsonb),p_error)
  RETURNING id INTO v_id;

  IF p_source = 'new' AND p_booking_id IS NOT NULL THEN
    INSERT INTO public.pipeline_state(booking_id,current_stage,reached_stages)
    VALUES (p_booking_id,p_stage,ARRAY[p_stage])
    ON CONFLICT (booking_id) DO UPDATE
      SET current_stage=EXCLUDED.current_stage,
          reached_stages=(SELECT ARRAY(SELECT DISTINCT unnest(public.pipeline_state.reached_stages || EXCLUDED.reached_stages))),
          updated_at=now();
  END IF;
  RETURN v_id;
END;$$;

CREATE OR REPLACE FUNCTION public.ds_notify(
  p_booking_id uuid, p_recipient text, p_kind text,
  p_partner_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.ds_log_event(
    p_booking_id, 'notification_'||p_recipient, 'new', 'ds_notify', NULL, 'ok',
    jsonb_build_object('recipient',p_recipient,'kind',p_kind,'partner_id',p_partner_id,'user_id',p_user_id,'shadow',true)
      || COALESCE(p_payload,'{}'::jsonb)
  );
END;$$;

CREATE OR REPLACE FUNCTION public.ds_on_payment_verified(p_booking_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.ds_log_event(p_booking_id,'payment_verified','new','ds_on_payment_verified'); END;$$;

CREATE OR REPLACE FUNCTION public.ds_activate_paid_booking(p_booking_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.ds_log_event(p_booking_id,'subscription_activated','new','ds_activate_paid_booking'); END;$$;

CREATE OR REPLACE FUNCTION public.ds_generate_today_service(p_booking_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.ds_log_event(p_booking_id,'service_generated','new','ds_generate_today_service'); END;$$;

CREATE OR REPLACE FUNCTION public.ds_enqueue_assignment(p_booking_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.ds_log_event(p_booking_id,'queue_created','new','ds_enqueue_assignment'); END;$$;

CREATE OR REPLACE FUNCTION public.ds_create_offer(p_booking_id uuid, p_partner_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ds_log_event(p_booking_id,'offer_created','new','ds_create_offer',NULL,'ok',jsonb_build_object('partner_id',p_partner_id));
  PERFORM public.ds_notify(p_booking_id,'partner','daily_shine_offer',p_partner_id);
END;$$;

CREATE OR REPLACE FUNCTION public.ds_partner_accept(p_booking_id uuid, p_partner_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.ds_log_event(p_booking_id,'partner_accepted','new','ds_partner_accept',NULL,'ok',jsonb_build_object('partner_id',p_partner_id)); END;$$;

CREATE OR REPLACE FUNCTION public.ds_create_assignment(p_booking_id uuid, p_partner_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ds_log_event(p_booking_id,'assignment_created','new','ds_create_assignment',NULL,'ok',jsonb_build_object('partner_id',p_partner_id));
  PERFORM public.ds_notify(p_booking_id,'customer','assignment_confirmed');
  PERFORM public.ds_notify(p_booking_id,'admin','assignment_confirmed');
END;$$;

-- Legacy mirror triggers (AFTER only — additive, non-blocking)
CREATE OR REPLACE FUNCTION public.mirror_legacy_booking() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM public.ds_log_event(NEW.id,'booking_created','legacy','trg_mirror_bookings',NEW.id,'ok',
      jsonb_build_object('payment_status',NEW.payment_status,'status',NEW.status));
  ELSIF TG_OP='UPDATE' AND COALESCE(OLD.payment_status,'') IS DISTINCT FROM COALESCE(NEW.payment_status,'') AND NEW.payment_status='paid' THEN
    PERFORM public.ds_log_event(NEW.id,'payment_verified','legacy','trg_mirror_bookings',NEW.id,'ok',
      jsonb_build_object('razorpay_payment_id',NEW.razorpay_payment_id));
  END IF;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_mirror_bookings ON public.bookings;
CREATE TRIGGER trg_mirror_bookings AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.mirror_legacy_booking();

CREATE OR REPLACE FUNCTION public.mirror_legacy_offer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_booking uuid;
BEGIN
  BEGIN v_booking := NEW.booking_id; EXCEPTION WHEN undefined_column THEN v_booking := NULL; END;
  PERFORM public.ds_log_event(v_booking,'offer_created','legacy','trg_mirror_subscription_offers',NEW.id,'ok',to_jsonb(NEW));
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_mirror_subscription_offers ON public.subscription_offers;
CREATE TRIGGER trg_mirror_subscription_offers AFTER INSERT ON public.subscription_offers
  FOR EACH ROW EXECUTE FUNCTION public.mirror_legacy_offer();

CREATE OR REPLACE FUNCTION public.mirror_legacy_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_booking uuid;
BEGIN
  BEGIN v_booking := NEW.booking_id; EXCEPTION WHEN undefined_column THEN v_booking := NULL; END;
  PERFORM public.ds_log_event(v_booking,'assignment_created','legacy','trg_mirror_assignments',NEW.id,'ok',to_jsonb(NEW));
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_mirror_assignments ON public.assignments;
CREATE TRIGGER trg_mirror_assignments AFTER INSERT ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.mirror_legacy_assignment();

CREATE OR REPLACE FUNCTION public.mirror_legacy_partner_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_booking uuid;
BEGIN
  BEGIN v_booking := NEW.booking_id; EXCEPTION WHEN undefined_column THEN v_booking := NULL; END;
  PERFORM public.ds_log_event(v_booking,'notification_partner','legacy','trg_mirror_partner_notifications',NEW.id,'ok',to_jsonb(NEW));
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_mirror_partner_notifications ON public.partner_notifications;
CREATE TRIGGER trg_mirror_partner_notifications AFTER INSERT ON public.partner_notifications
  FOR EACH ROW EXECUTE FUNCTION public.mirror_legacy_partner_notification();

CREATE OR REPLACE VIEW public.v_pipeline_comparison AS
WITH stages AS (
  SELECT booking_id, stage,
    max(occurred_at) FILTER (WHERE source='legacy') AS legacy_at,
    max(occurred_at) FILTER (WHERE source='new')    AS new_at,
    (array_agg(row_id) FILTER (WHERE source='legacy'))[1] AS legacy_row_id,
    (array_agg(row_id) FILTER (WHERE source='new'))[1]    AS new_row_id,
    (array_agg(actor)  FILTER (WHERE source='legacy'))[1] AS legacy_actor,
    (array_agg(actor)  FILTER (WHERE source='new'))[1]    AS new_actor
  FROM public.pipeline_events
  WHERE booking_id IS NOT NULL
  GROUP BY booking_id, stage
)
SELECT s.*,
  CASE
    WHEN legacy_at IS NOT NULL AND new_at IS NULL THEN 'legacy_only'
    WHEN legacy_at IS NULL     AND new_at IS NOT NULL THEN 'new_only'
    WHEN legacy_at IS NOT NULL AND new_at IS NOT NULL THEN 'match'
    ELSE 'none'
  END AS status
FROM stages s;

GRANT SELECT ON public.v_pipeline_comparison TO authenticated;
