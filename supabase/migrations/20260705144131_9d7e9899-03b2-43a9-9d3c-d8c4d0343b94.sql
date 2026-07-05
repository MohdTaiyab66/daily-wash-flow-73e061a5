
-- 1) Fix broken trigger: cannot reference target table alias `s` inside FROM's JOIN
CREATE OR REPLACE FUNCTION public.tg_booking_cancel_restores_daily_shine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('cancelled','failed') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;

  UPDATE public.services s
     SET status = 'pending',
         delay_reason = NULL,
         rate_per_car = COALESCE(src.rate_per_car, s.rate_per_car),
         updated_at = now()
    FROM (
      SELECT s2.id AS service_id, a.rate_per_car
        FROM public.services s2
        JOIN public.customer_profiles cp
          ON cp.user_id = NEW.user_id
        JOIN public.customers c
          ON (c.phone IS NOT NULL AND cp.phone IS NOT NULL AND c.phone = cp.phone)
          OR (c.email IS NOT NULL AND cp.email IS NOT NULL AND lower(c.email) = lower(cp.email))
        LEFT JOIN public.assignments a ON a.id = s2.assignment_id
       WHERE s2.customer_id = c.id
         AND s2.scheduled_date = NEW.scheduled_date
         AND s2.status = 'covered_by_booking'
    ) src
   WHERE s.id = src.service_id;

  RETURN NEW;
END $function$;

-- 2) Default cancellation window setting
INSERT INTO public.platform_settings (key, value, description)
VALUES ('cancellation_window_minutes', '60'::jsonb, 'Minutes after booking creation during which customers can cancel')
ON CONFLICT (key) DO NOTHING;

-- 3) Secure cancel RPC (enforces the window; admins bypass)
CREATE OR REPLACE FUNCTION public.customer_cancel_booking(
  p_booking_id uuid,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b public.bookings%ROWTYPE;
  win_min int;
  is_admin boolean;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  is_admin := public.has_role(auth.uid(), 'admin'::app_role);

  IF b.user_id <> auth.uid() AND NOT is_admin THEN
    RAISE EXCEPTION 'Not allowed to cancel this booking';
  END IF;

  IF b.status IN ('cancelled','completed','failed') THEN
    RAISE EXCEPTION 'This booking can no longer be cancelled';
  END IF;

  SELECT COALESCE(NULLIF(value::text, 'null')::int, 60)
    INTO win_min
    FROM public.platform_settings
   WHERE key = 'cancellation_window_minutes';
  IF win_min IS NULL THEN win_min := 60; END IF;

  IF NOT is_admin AND now() > b.created_at + make_interval(mins => win_min) THEN
    RAISE EXCEPTION 'Cancellation window of % minutes has passed. Please contact support.', win_min;
  END IF;

  UPDATE public.bookings
     SET status = 'cancelled',
         updated_at = now()
   WHERE id = p_booking_id;
END $$;

GRANT EXECUTE ON FUNCTION public.customer_cancel_booking(uuid, text) TO authenticated;
