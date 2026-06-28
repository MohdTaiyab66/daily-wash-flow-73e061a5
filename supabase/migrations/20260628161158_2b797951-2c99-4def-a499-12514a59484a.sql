CREATE OR REPLACE FUNCTION public.tg_notify_window_delay()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bk record;
  v_cutoff timestamptz;
  v_already int;
BEGIN
  IF NEW.eta_at IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IN ('completed','skipped') THEN RETURN NEW; END IF;
  IF OLD.eta_at IS NOT DISTINCT FROM NEW.eta_at THEN RETURN NEW; END IF;

  SELECT * INTO v_bk FROM public._booking_for_service(NEW.id);
  IF v_bk.user_id IS NULL THEN RETURN NEW; END IF;

  v_cutoff := public._customer_window_cutoff(v_bk.preferred_before_time, COALESCE(v_bk.scheduled_date, NEW.scheduled_date));
  IF v_cutoff IS NULL THEN RETURN NEW; END IF;

  IF NEW.eta_at <= v_cutoff THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_already
  FROM public.customer_notifications
  WHERE user_id = v_bk.user_id
    AND type = 'important_delay'
    AND created_at::date = CURRENT_DATE
    AND metadata->>'service_id' = NEW.id::text;
  IF v_already > 0 THEN RETURN NEW; END IF;

  INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
  VALUES (
    v_bk.user_id,
    'important_delay',
    'Service may run late today',
    'We''re experiencing an unexpected delay today. Your service may be completed after your selected service window. Thank you for your patience.',
    '/c/bookings',
    jsonb_build_object('service_id', NEW.id, 'cutoff', v_cutoff, 'predicted_eta', NEW.eta_at)
  );
  RETURN NEW;
END;
$function$;