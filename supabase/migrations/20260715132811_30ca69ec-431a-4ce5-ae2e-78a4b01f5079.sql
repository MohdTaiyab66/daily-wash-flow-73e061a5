
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
    'queue_assigned',
    'service_assigned',
    'service_en_route',
    'service_started'
  ) THEN
    RAISE EXCEPTION
      'customer_notifications.type=% is forbidden by product policy. '
      'Customers must not see operational/ETA/route events.', NEW.type;
  END IF;
  RETURN NEW;
END;
$$;

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

  IF NEW.status = 'completed' AND COALESCE(OLD.status::text,'') <> 'completed' THEN
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
