-- 1. Normalise legacy notification types so they map to customer-app types
CREATE OR REPLACE FUNCTION public.tg_normalize_customer_notification_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.type := CASE NEW.type
    WHEN 'subscription_paid'          THEN 'payment_success'
    WHEN 'dirty_vehicle'              THEN 'vehicle_dirty'
    WHEN 'dirty_vehicle_report'       THEN 'vehicle_dirty'
    WHEN 'service_unavailable'        THEN 'vehicle_unavailable'
    WHEN 'unavailable_report'         THEN 'vehicle_unavailable'
    WHEN 'completed'                  THEN 'service_completed'
    WHEN 'weekly_wash_reminder'       THEN 'weekly_included_reminder'
    WHEN 'subscription_renewing_soon' THEN 'renewal_reminder'
    WHEN 'subscription_expiring_soon' THEN 'expiry_reminder'
    ELSE NEW.type
  END;
  RETURN NEW;
END;
$$;

-- 2. Collapse duplicate notifications for the same service outcome
CREATE OR REPLACE FUNCTION public.tg_dedupe_customer_notifications()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_service text := NEW.metadata->>'service_id';
BEGIN
  IF v_service IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.customer_notifications n
    WHERE n.user_id = NEW.user_id
      AND n.type = NEW.type
      AND n.metadata->>'service_id' = v_service
      AND n.created_at > now() - INTERVAL '6 hours'
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_b_dedupe_customer_notifications ON public.customer_notifications;
CREATE TRIGGER trg_b_dedupe_customer_notifications
BEFORE INSERT ON public.customer_notifications
FOR EACH ROW EXECUTE FUNCTION public.tg_dedupe_customer_notifications();

-- 3. Guarantee a customer update for every service outcome
CREATE OR REPLACE FUNCTION public.tg_notify_customer_service_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_dirty boolean;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  v_user_id := public._resolve_user_id_for_customer(NEW.customer_id);
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.status = 'in_progress' AND COALESCE(OLD.status::text, '') <> 'in_progress' THEN
    INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
    VALUES (v_user_id, 'service_started', 'Your service has started',
            'Your service has started.', '/c/subscriptions',
            jsonb_build_object('service_id', NEW.id));
  END IF;

  IF NEW.status = 'completed' AND COALESCE(OLD.status::text, '') <> 'completed' THEN
    INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
    VALUES (v_user_id, 'service_completed', 'Your service has been completed',
            'Your service has been completed. Tap to see today''s photos and details.',
            '/c/subscriptions', jsonb_build_object('service_id', NEW.id));
  END IF;

  IF NEW.status = 'unavailable' AND COALESCE(OLD.status::text, '') <> 'unavailable' THEN
    v_dirty := (NEW.unavailable_reason::text = 'dirty_vehicle');
    INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
    VALUES (
      v_user_id,
      CASE WHEN v_dirty THEN 'vehicle_dirty' ELSE 'vehicle_unavailable' END,
      CASE WHEN v_dirty THEN 'Vehicle was extra dirty today'
           ELSE 'Service could not be completed today' END,
      CASE WHEN v_dirty
           THEN 'Your partner reported the vehicle needed more attention than usual. Tap to see the photos.'
           ELSE 'Your vehicle was not available for today''s service. Tap to see the proof photos. No wash was deducted.' END,
      '/c/subscriptions',
      jsonb_build_object('service_id', NEW.id, 'reason', NEW.unavailable_reason)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Legacy per-report notifications are redundant now
DROP TRIGGER IF EXISTS trg_notify_customer_dirty_report ON public.dirty_vehicle_reports;
DROP TRIGGER IF EXISTS trg_notify_customer_unavailable_report ON public.unavailability_reports;

-- 4. Included Wash (interior) covers that vehicle's daily exterior stop
CREATE OR REPLACE FUNCTION public.tg_booking_covers_daily_shine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat text;
  v_slug text;
BEGIN
  IF NEW.status IN ('cancelled','failed') THEN RETURN NEW; END IF;
  SELECT category::text, slug INTO v_cat, v_slug
    FROM public.service_catalog WHERE id = NEW.service_id;

  IF v_cat IN ('one_time','deep_clean','premium') THEN
    UPDATE public.services s
       SET status = 'covered_by_booking',
           rate_per_car = 0,
           delay_reason = 'covered_by_booking',
           updated_at = now()
      FROM public.customer_profiles cp
      JOIN public.customers c
        ON (c.phone IS NOT NULL AND cp.phone IS NOT NULL AND c.phone = cp.phone)
        OR (c.email IS NOT NULL AND cp.email IS NOT NULL AND lower(c.email) = lower(cp.email))
     WHERE cp.user_id = NEW.user_id
       AND s.customer_id = c.id
       AND s.scheduled_date = NEW.scheduled_date
       AND (NEW.vehicle_id IS NULL OR s.vehicle_id IS NULL OR s.vehicle_id = NEW.vehicle_id)
       AND s.status IN ('pending','in_progress');
    RETURN NEW;
  END IF;

  -- Included Wash = one Interior + Exterior visit. It must never leave a
  -- separate Daily Exterior stop for the same vehicle on the same day.
  IF v_slug = 'daily-shine-interior' AND NEW.vehicle_id IS NOT NULL THEN
    UPDATE public.services s
       SET status = 'covered_by_booking',
           rate_per_car = 0,
           delay_reason = 'covered_by_included_wash',
           updated_at = now()
     WHERE s.vehicle_id = NEW.vehicle_id
       AND s.scheduled_date = NEW.scheduled_date
       AND s.status = 'pending';
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Automatic plan extension when Urban Wash misses a scheduled day
CREATE OR REPLACE FUNCTION public.auto_extend_company_failures(p_date date DEFAULT (CURRENT_DATE - 1))
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_prev date;
  v_new date;
  v_user uuid;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT s.id, s.customer_id
    FROM public.services s
    WHERE s.scheduled_date = p_date
      AND s.status = 'pending'
  LOOP
    UPDATE public.services
       SET status = 'skipped',
           delay_reason = 'company_failure',
           updated_at = now()
     WHERE id = r.id;

    IF EXISTS (
      SELECT 1 FROM public.subscription_extensions
      WHERE reason = 'company_failure:' || r.id::text
    ) THEN
      CONTINUE;
    END IF;

    SELECT subscription_end INTO v_prev FROM public.customers WHERE id = r.customer_id;
    IF v_prev IS NULL THEN CONTINUE; END IF;
    v_new := v_prev + 1;

    UPDATE public.customers
       SET subscription_end = v_new,
           is_active = CASE WHEN v_new >= CURRENT_DATE THEN true ELSE is_active END,
           updated_at = now()
     WHERE id = r.customer_id;

    INSERT INTO public.subscription_extensions(customer_id, days, reason, previous_end, new_end)
    VALUES (r.customer_id, 1, 'company_failure:' || r.id::text, v_prev, v_new);

    v_user := public._resolve_user_id_for_customer(r.customer_id);
    IF v_user IS NOT NULL THEN
      INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
      VALUES (v_user, 'extension_applied', 'We missed your wash — plan extended',
              'We could not service your vehicle on ' || to_char(p_date, 'DD Mon') ||
              '. Your plan has been extended by 1 day.',
              '/c/subscriptions',
              jsonb_build_object('service_id', r.id, 'days', 1, 'new_end', v_new));
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'date', p_date, 'extended', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.auto_extend_company_failures(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_extend_company_failures(date) TO service_role;