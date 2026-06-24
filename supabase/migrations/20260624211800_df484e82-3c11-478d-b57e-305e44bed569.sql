CREATE UNIQUE INDEX IF NOT EXISTS payments_one_per_booking_provider
ON public.payments (booking_id, provider)
WHERE booking_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.activate_paid_booking(
  p_booking_id uuid,
  p_provider_order_id text DEFAULT NULL,
  p_provider_payment_id text DEFAULT NULL,
  p_signature text DEFAULT NULL,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    booking_id,
    user_id,
    provider,
    provider_order_id,
    provider_payment_id,
    amount,
    currency,
    status,
    metadata
  ) VALUES (
    p_booking_id,
    v_booking.user_id,
    'razorpay',
    p_provider_order_id,
    p_provider_payment_id,
    v_booking.total_amount,
    'INR',
    'captured',
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
    payment_id,
    booking_id,
    user_id,
    provider,
    event_type,
    provider_order_id,
    provider_payment_id,
    signature,
    amount,
    status,
    raw_payload
  ) VALUES (
    v_payment,
    p_booking_id,
    v_booking.user_id,
    'razorpay',
    'payment.captured',
    p_provider_order_id,
    p_provider_payment_id,
    p_signature,
    v_booking.total_amount,
    'success',
    COALESCE(p_raw_payload, '{}'::jsonb)
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
      booking_id,
      user_id,
      customer_id,
      vehicle_id,
      plan_slug,
      status,
      start_date,
      renewal_date,
      service_start_date,
      amount,
      currency
    ) VALUES (
      p_booking_id,
      v_booking.user_id,
      v_booking.user_id,
      v_booking.vehicle_id,
      v_booking.service_slug,
      'awaiting_partner_assignment',
      COALESCE(v_booking.scheduled_date, CURRENT_DATE),
      COALESCE(v_booking.scheduled_date, CURRENT_DATE) + 30,
      COALESCE(v_booking.scheduled_date, CURRENT_DATE),
      v_booking.total_amount,
      'INR'
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
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', p_booking_id,
    'payment_id', v_payment,
    'subscription_id', v_subscription,
    'queue_id', v_queue
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_paid_booking(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_paid_booking(uuid, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_paid_booking(uuid, text, text, text, jsonb) TO service_role;