
-- Admin setting
INSERT INTO public.platform_settings (key, value)
VALUES ('auto_notify_partners_on_new_customer', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Partner opt-in
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS notify_when_customers_added boolean NOT NULL DEFAULT true;

-- Notifications table
CREATE TABLE IF NOT EXISTS public.partner_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_notifications_partner_created
  ON public.partner_notifications(partner_id, created_at DESC);

GRANT SELECT, UPDATE ON public.partner_notifications TO authenticated;
GRANT ALL ON public.partner_notifications TO service_role;
ALTER TABLE public.partner_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partners read own notifications" ON public.partner_notifications;
CREATE POLICY "partners read own notifications"
  ON public.partner_notifications FOR SELECT TO authenticated
  USING (partner_id = auth.uid());

DROP POLICY IF EXISTS "partners update own notifications" ON public.partner_notifications;
CREATE POLICY "partners update own notifications"
  ON public.partner_notifications FOR UPDATE TO authenticated
  USING (partner_id = auth.uid()) WITH CHECK (partner_id = auth.uid());

-- Trigger function: notify partners in same area when a new customer is added (or moves area)
CREATE OR REPLACE FUNCTION public.notify_partners_new_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_enabled boolean := true;
  v_area text;
BEGIN
  SELECT COALESCE((value::text)::boolean, true) INTO v_enabled
  FROM public.platform_settings WHERE key = 'auto_notify_partners_on_new_customer';
  IF NOT COALESCE(v_enabled, true) THEN RETURN NEW; END IF;

  v_area := trim(NEW.area);
  IF v_area IS NULL OR length(v_area) = 0 THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' AND lower(coalesce(trim(OLD.area), '')) = lower(v_area) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.partner_notifications (partner_id, type, title, body, link, metadata)
  SELECT p.id,
         'new_customers',
         'New customers available',
         'A new customer is now available in ' || v_area || '. Build your assignment now.',
         '/app/assignments',
         jsonb_build_object('customer_id', NEW.id, 'area', v_area)
  FROM public.partners p
  WHERE p.status = 'approved'
    AND COALESCE(p.notify_when_customers_added, true) = true
    AND lower(trim(p.home_area)) = lower(v_area);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_partners_new_customer_ins ON public.customers;
CREATE TRIGGER trg_notify_partners_new_customer_ins
  AFTER INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.notify_partners_new_customer();

DROP TRIGGER IF EXISTS trg_notify_partners_new_customer_upd ON public.customers;
CREATE TRIGGER trg_notify_partners_new_customer_upd
  AFTER UPDATE OF area ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.notify_partners_new_customer();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_notifications;
