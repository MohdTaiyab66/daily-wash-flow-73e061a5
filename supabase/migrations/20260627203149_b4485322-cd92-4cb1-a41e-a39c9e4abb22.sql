
-- =====================================================================
-- PASS A: Customer notification policy lockdown
-- =====================================================================

-- 1) Forbidden-type guard on public.customer_notifications
CREATE OR REPLACE FUNCTION public.tg_block_forbidden_customer_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type IN (
    'eta_updated',
    'route_updated',
    'partner_changed',
    'sequence_changed',
    'route_optimized',
    'traffic_update',
    'offer_sent',
    'partner_accepted',
    'queue_assigned'
  ) THEN
    RAISE EXCEPTION
      'customer_notifications.type=% is forbidden by product policy. '
      'Customers must not see operational/ETA/route events.', NEW.type;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_forbidden_customer_notifications
  ON public.customer_notifications;

CREATE TRIGGER trg_block_forbidden_customer_notifications
  BEFORE INSERT ON public.customer_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_block_forbidden_customer_notifications();


-- 2) Resolve customer_id -> auth user_id via the most recent subscription
CREATE OR REPLACE FUNCTION public._resolve_user_id_for_customer(p_customer_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id
  FROM public.subscriptions
  WHERE customer_id = p_customer_id
    AND user_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;
$$;


-- 3) Service started / completed notifications
CREATE OR REPLACE FUNCTION public.tg_notify_customer_service_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  v_user_id := public._resolve_user_id_for_customer(NEW.customer_id);
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.status = 'in_progress' AND COALESCE(OLD.status::text,'') <> 'in_progress' THEN
    INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
    VALUES (
      v_user_id,
      'service_started',
      'Your service has started',
      'Your Urban Wash partner is taking care of your vehicle now.',
      '/c/subscriptions',
      jsonb_build_object('service_id', NEW.id)
    );
  ELSIF NEW.status = 'completed' AND COALESCE(OLD.status::text,'') <> 'completed' THEN
    INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
    VALUES (
      v_user_id,
      'service_completed',
      'Your service is complete',
      'Your vehicle has been serviced. Tap to see today''s photos and details.',
      '/c/subscriptions',
      jsonb_build_object('service_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_customer_service_status ON public.services;
CREATE TRIGGER trg_notify_customer_service_status
  AFTER UPDATE OF status ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_notify_customer_service_status();


-- 4) Dirty vehicle report -> customer notification
CREATE OR REPLACE FUNCTION public.tg_notify_customer_dirty_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_user_id uuid;
BEGIN
  SELECT customer_id INTO v_customer_id FROM public.services WHERE id = NEW.service_id;
  IF v_customer_id IS NULL THEN RETURN NEW; END IF;
  v_user_id := public._resolve_user_id_for_customer(v_customer_id);
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
  VALUES (
    v_user_id,
    'dirty_vehicle_report',
    'Vehicle was extra dirty today',
    'Your partner reported the vehicle needed more attention than usual. Tap to view.',
    '/c/subscriptions',
    jsonb_build_object('service_id', NEW.service_id, 'reason', NEW.reason)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_customer_dirty_report ON public.dirty_vehicle_reports;
CREATE TRIGGER trg_notify_customer_dirty_report
  AFTER INSERT ON public.dirty_vehicle_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_notify_customer_dirty_report();


-- 5) Unavailability report -> customer notification
CREATE OR REPLACE FUNCTION public.tg_notify_customer_unavailable_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := public._resolve_user_id_for_customer(NEW.customer_id);
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
  VALUES (
    v_user_id,
    'unavailable_report',
    'Service could not be completed today',
    'Your vehicle was not available for today''s service. A credit has been added to your subscription.',
    '/c/subscriptions',
    jsonb_build_object('service_id', NEW.service_id, 'reason', NEW.reason, 'credited_amount', NEW.credited_amount)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_customer_unavailable_report ON public.unavailability_reports;
CREATE TRIGGER trg_notify_customer_unavailable_report
  AFTER INSERT ON public.unavailability_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_notify_customer_unavailable_report();


-- 6) Restrict execute on the helper to backend roles only.
REVOKE EXECUTE ON FUNCTION public._resolve_user_id_for_customer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._resolve_user_id_for_customer(uuid) TO authenticated, service_role;
