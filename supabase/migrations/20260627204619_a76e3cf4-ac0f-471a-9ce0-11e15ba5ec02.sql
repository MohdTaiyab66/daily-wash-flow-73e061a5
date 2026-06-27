
-- Helper: parse "Before HH:MM AM/PM" or "HH:MM" into a timestamptz cutoff for a given date
CREATE OR REPLACE FUNCTION public._customer_window_cutoff(p_text text, p_date date)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s text;
  m text[];
  h int;
  mi int;
  ampm text;
BEGIN
  IF p_text IS NULL OR p_date IS NULL THEN RETURN NULL; END IF;
  s := upper(trim(p_text));
  -- match "HH" or "HH:MM" optionally with AM/PM
  m := regexp_match(s, '([0-9]{1,2})(?::([0-9]{2}))?\s*(AM|PM)?');
  IF m IS NULL THEN RETURN NULL; END IF;
  h := m[1]::int;
  mi := COALESCE(m[2]::int, 0);
  ampm := m[3];
  IF ampm = 'PM' AND h < 12 THEN h := h + 12; END IF;
  IF ampm = 'AM' AND h = 12 THEN h := 0; END IF;
  IF h < 0 OR h > 23 OR mi < 0 OR mi > 59 THEN RETURN NULL; END IF;
  RETURN (p_date::timestamp + make_interval(hours => h, mins => mi)) AT TIME ZONE 'Asia/Kolkata';
END;
$$;

REVOKE EXECUTE ON FUNCTION public._customer_window_cutoff(text, date) FROM PUBLIC, anon, authenticated;

-- Find the booking row (if any) tied to an ops services.id, going via subscriptions first, then bookings.ops_service_id.
CREATE OR REPLACE FUNCTION public._booking_for_service(p_service_id uuid)
RETURNS TABLE(user_id uuid, preferred_before_time text, scheduled_date date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH svc AS (
    SELECT s.customer_id, s.scheduled_date FROM public.services s WHERE s.id = p_service_id
  ),
  via_sub AS (
    SELECT bk.user_id, bk.preferred_before_time, bk.scheduled_date
    FROM svc, public.subscriptions sub
    JOIN public.bookings bk ON bk.id = sub.booking_id
    WHERE sub.customer_id = svc.customer_id
    ORDER BY bk.created_at DESC
    LIMIT 1
  ),
  via_ops AS (
    SELECT bk.user_id, bk.preferred_before_time, bk.scheduled_date
    FROM public.bookings bk
    WHERE bk.ops_service_id = p_service_id
    ORDER BY bk.created_at DESC
    LIMIT 1
  )
  SELECT * FROM via_sub
  UNION ALL
  SELECT * FROM via_ops
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public._booking_for_service(uuid) FROM PUBLIC, anon, authenticated;

-- Trigger: when services.eta_at changes, emit an important_delay notification once per service per day
-- if the new arrival time is after the customer's selected window cutoff.
CREATE OR REPLACE FUNCTION public.tg_notify_window_delay()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bk record;
  v_cutoff timestamptz;
  v_already int;
BEGIN
  IF NEW.eta_at IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IN ('completed','cancelled') THEN RETURN NEW; END IF;
  IF OLD.eta_at IS NOT DISTINCT FROM NEW.eta_at THEN RETURN NEW; END IF;

  SELECT * INTO v_bk FROM public._booking_for_service(NEW.id);
  IF v_bk.user_id IS NULL THEN RETURN NEW; END IF;

  v_cutoff := public._customer_window_cutoff(v_bk.preferred_before_time, COALESCE(v_bk.scheduled_date, NEW.scheduled_date));
  IF v_cutoff IS NULL THEN RETURN NEW; END IF;

  -- Only notify when predicted completion exceeds the window.
  IF NEW.eta_at <= v_cutoff THEN RETURN NEW; END IF;

  -- Idempotency: at most once per service per day.
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
$$;

REVOKE EXECUTE ON FUNCTION public.tg_notify_window_delay() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_window_delay ON public.services;
CREATE TRIGGER trg_notify_window_delay
AFTER UPDATE OF eta_at ON public.services
FOR EACH ROW
EXECUTE FUNCTION public.tg_notify_window_delay();

-- Update activate_paid_booking: send Booking Confirmed for one-time washes.
CREATE OR REPLACE FUNCTION public.activate_paid_booking(p_booking_id uuid, p_provider_order_id text DEFAULT NULL::text, p_provider_payment_id text DEFAULT NULL::text, p_signature text DEFAULT NULL::text, p_raw_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_booking record;
  v_subscription uuid;
  v_payment uuid;
  v_queue uuid;
BEGIN
  SELECT bk.*, sc.slug AS service_slug, sc.service_type, sc.name AS service_name
    INTO v_booking
    FROM public.bookings bk
    JOIN public.service_catalog sc ON sc.id = bk.service_id
    WHERE bk.id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_user IS NOT NULL
     AND v_booking.user_id <> v_user
     AND NOT public.has_role(v_user, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.ensure_ops_customer_for_booking(p_booking_id);

  INSERT INTO public.payments (
    booking_id, user_id, provider, provider_order_id, provider_payment_id,
    amount, currency, status, metadata
  ) VALUES (
    p_booking_id, v_booking.user_id, 'razorpay', p_provider_order_id, p_provider_payment_id,
    v_booking.total_amount, 'INR', 'captured',
    jsonb_build_object('service_slug', v_booking.service_slug) || COALESCE(p_raw_payload, '{}'::jsonb)
  )
  ON CONFLICT (booking_id, provider) WHERE booking_id IS NOT NULL
  DO UPDATE SET
    provider_order_id = COALESCE(EXCLUDED.provider_order_id, public.payments.provider_order_id),
    provider_payment_id = COALESCE(EXCLUDED.provider_payment_id, public.payments.provider_payment_id),
    amount = EXCLUDED.amount,
    status = 'captured',
    metadata = public.payments.metadata || EXCLUDED.metadata,
    updated_at = now()
  RETURNING id INTO v_payment;

  INSERT INTO public.payment_transactions (
    payment_id, booking_id, user_id, provider, event_type,
    provider_order_id, provider_payment_id, signature, amount, status, raw_payload
  ) VALUES (
    v_payment, p_booking_id, v_booking.user_id, 'razorpay', 'payment.captured',
    p_provider_order_id, p_provider_payment_id, p_signature,
    v_booking.total_amount, 'success', COALESCE(p_raw_payload, '{}'::jsonb)
  );

  UPDATE public.bookings
    SET payment_status = 'paid',
        status = 'paid',
        razorpay_order_id = COALESCE(p_provider_order_id, razorpay_order_id),
        razorpay_payment_id = COALESCE(p_provider_payment_id, razorpay_payment_id),
        updated_at = now()
    WHERE id = p_booking_id;

  IF v_booking.service_type = 'subscription' THEN
    INSERT INTO public.subscriptions (
      booking_id, user_id, customer_id, vehicle_id, plan_slug, status,
      start_date, renewal_date, service_start_date, amount, currency
    ) VALUES (
      p_booking_id, v_booking.user_id, v_booking.user_id, v_booking.vehicle_id,
      v_booking.service_slug, 'awaiting_partner_assignment',
      COALESCE(v_booking.scheduled_date, CURRENT_DATE),
      COALESCE(v_booking.scheduled_date, CURRENT_DATE) + 30,
      COALESCE(v_booking.scheduled_date, CURRENT_DATE),
      v_booking.total_amount, 'INR'
    )
    ON CONFLICT (booking_id) DO UPDATE SET
      status = CASE
        WHEN public.subscriptions.status = 'assigned' THEN public.subscriptions.status
        ELSE 'awaiting_partner_assignment'
      END,
      start_date = EXCLUDED.start_date,
      renewal_date = EXCLUDED.renewal_date,
      service_start_date = EXCLUDED.service_start_date,
      amount = EXCLUDED.amount,
      updated_at = now()
    RETURNING id INTO v_subscription;

    SELECT public.enqueue_subscription_booking(p_booking_id) INTO v_queue;

    INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
    VALUES (
      v_booking.user_id,
      'subscription_paid',
      'Daily Shine subscription active',
      'Your payment is complete. We are assigning your Urban Wash Partner now.',
      '/c/subscriptions',
      jsonb_build_object('booking_id', p_booking_id, 'subscription_id', v_subscription, 'queue_id', v_queue)
    );
  ELSE
    -- One-time wash: Booking Confirmed
    INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
    VALUES (
      v_booking.user_id,
      'booking_confirmed',
      'Booking Confirmed',
      'Your booking has been successfully confirmed.' ||
        E'\nService Date: ' || COALESCE(to_char(v_booking.scheduled_date, 'DD Mon YYYY'), 'TBD') ||
        E'\nService Window: ' || COALESCE(v_booking.preferred_before_time, 'TBD') ||
        E'\nOrder ID: ' || substring(p_booking_id::text, 1, 8),
      '/c/bookings/' || p_booking_id::text,
      jsonb_build_object(
        'booking_id', p_booking_id,
        'service_date', v_booking.scheduled_date,
        'service_window', v_booking.preferred_before_time,
        'service_name', v_booking.service_name
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', p_booking_id,
    'payment_id', v_payment,
    'subscription_id', v_subscription,
    'queue_id', v_queue
  );
END;
$function$;
