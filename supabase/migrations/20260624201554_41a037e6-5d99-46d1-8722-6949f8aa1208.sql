CREATE OR REPLACE FUNCTION public.ensure_ops_customer_for_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_booking record;
  p record;
  a record;
  cv record;
  v_name text;
  v_phone text;
BEGIN
  SELECT bk.*, sc.slug AS service_slug, sc.name AS service_name
    INTO v_booking
    FROM public.bookings bk
    JOIN public.service_catalog sc ON sc.id = bk.service_id
    WHERE bk.id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  SELECT * INTO p FROM public.customer_profiles WHERE user_id = v_booking.user_id LIMIT 1;
  SELECT * INTO a FROM public.customer_addresses WHERE id = v_booking.address_id LIMIT 1;
  SELECT * INTO cv FROM public.customer_vehicles WHERE id = v_booking.vehicle_id LIMIT 1;

  v_name := COALESCE(NULLIF(trim(p.full_name), ''), 'Urban Wash Customer');
  v_phone := COALESCE(NULLIF(trim(p.phone), ''), '0000000000');

  IF a.id IS NOT NULL THEN
    INSERT INTO public.customers (
      id, full_name, phone, email, address_line, area, city, pincode,
      latitude, longitude, subscription_plan, subscription_start, subscription_end,
      is_active, preferred_time, service_required_before, payment_status, paid_at, updated_at
    ) VALUES (
      v_booking.user_id, v_name, v_phone, p.email, a.address_line, a.area, 'Lucknow', a.pincode,
      a.latitude, a.longitude, 'daily_shine_monthly'::subscription_plan,
      COALESCE(v_booking.scheduled_date, CURRENT_DATE), COALESCE(v_booking.scheduled_date, CURRENT_DATE) + 30,
      true, COALESCE(v_booking.preferred_before_time, 'Before 8 AM'), COALESCE(v_booking.preferred_before_time, 'Before 8 AM'),
      CASE WHEN v_booking.payment_status = 'paid' THEN 'paid' ELSE 'pending' END,
      CASE WHEN v_booking.payment_status = 'paid' THEN now() ELSE NULL END,
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      phone = EXCLUDED.phone,
      email = EXCLUDED.email,
      address_line = EXCLUDED.address_line,
      area = EXCLUDED.area,
      pincode = EXCLUDED.pincode,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      subscription_start = EXCLUDED.subscription_start,
      subscription_end = EXCLUDED.subscription_end,
      is_active = true,
      preferred_time = EXCLUDED.preferred_time,
      service_required_before = EXCLUDED.service_required_before,
      payment_status = EXCLUDED.payment_status,
      paid_at = COALESCE(public.customers.paid_at, EXCLUDED.paid_at),
      updated_at = now();
  END IF;

  IF cv.id IS NOT NULL THEN
    INSERT INTO public.vehicles (
      id, customer_id, make, model, registration_number, color, parking_notes, front_image_path, package_amount
    ) VALUES (
      cv.id, v_booking.user_id, cv.make, cv.model, cv.registration_number, cv.color, cv.parking_notes, cv.image_path, v_booking.total_amount::int
    )
    ON CONFLICT (id) DO UPDATE SET
      customer_id = EXCLUDED.customer_id,
      make = EXCLUDED.make,
      model = EXCLUDED.model,
      registration_number = EXCLUDED.registration_number,
      color = EXCLUDED.color,
      parking_notes = EXCLUDED.parking_notes,
      front_image_path = EXCLUDED.front_image_path,
      package_amount = EXCLUDED.package_amount;
  END IF;

  RETURN jsonb_build_object('customer_id', v_booking.user_id, 'vehicle_id', v_booking.vehicle_id);
END $$;

CREATE OR REPLACE FUNCTION public.activate_paid_booking(
  p_booking_id uuid,
  p_provider_order_id text DEFAULT NULL,
  p_provider_payment_id text DEFAULT NULL,
  p_signature text DEFAULT NULL,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF v_user IS NOT NULL AND v_booking.user_id <> v_user AND NOT public.has_role(v_user, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.ensure_ops_customer_for_booking(p_booking_id);

  INSERT INTO public.payments (
    booking_id, user_id, provider, provider_order_id, provider_payment_id, amount, currency, status, metadata
  ) VALUES (
    p_booking_id, v_booking.user_id, 'razorpay', p_provider_order_id, p_provider_payment_id, v_booking.total_amount, 'INR', 'captured',
    jsonb_build_object('service_slug', v_booking.service_slug) || COALESCE(p_raw_payload, '{}'::jsonb)
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_payment;

  IF v_payment IS NULL THEN
    SELECT id INTO v_payment FROM public.payments
    WHERE booking_id = p_booking_id
    ORDER BY created_at DESC LIMIT 1;
    UPDATE public.payments
      SET status='captured', provider_order_id=COALESCE(p_provider_order_id, provider_order_id),
          provider_payment_id=COALESCE(p_provider_payment_id, provider_payment_id), updated_at=now()
      WHERE id = v_payment;
  END IF;

  INSERT INTO public.payment_transactions (
    payment_id, booking_id, user_id, provider, event_type, provider_order_id, provider_payment_id, signature, amount, status, raw_payload
  ) VALUES (
    v_payment, p_booking_id, v_booking.user_id, 'razorpay', 'payment.captured', p_provider_order_id, p_provider_payment_id,
    p_signature, v_booking.total_amount, 'success', COALESCE(p_raw_payload, '{}'::jsonb)
  );

  UPDATE public.bookings
    SET payment_status='paid', status=CASE WHEN v_booking.service_type = 'subscription' THEN 'paid' ELSE 'paid' END,
        razorpay_order_id=COALESCE(p_provider_order_id, razorpay_order_id),
        razorpay_payment_id=COALESCE(p_provider_payment_id, razorpay_payment_id),
        updated_at=now()
    WHERE id = p_booking_id;

  IF v_booking.service_type = 'subscription' THEN
    INSERT INTO public.subscriptions (
      booking_id, user_id, customer_id, vehicle_id, plan_slug, status, start_date, renewal_date, service_start_date, amount, currency
    ) VALUES (
      p_booking_id, v_booking.user_id, v_booking.user_id, v_booking.vehicle_id, v_booking.service_slug, 'awaiting_partner_assignment',
      COALESCE(v_booking.scheduled_date, CURRENT_DATE), COALESCE(v_booking.scheduled_date, CURRENT_DATE) + 30,
      COALESCE(v_booking.scheduled_date, CURRENT_DATE), v_booking.total_amount, 'INR'
    )
    ON CONFLICT (booking_id) DO UPDATE SET
      status = CASE WHEN public.subscriptions.status = 'assigned' THEN public.subscriptions.status ELSE 'awaiting_partner_assignment' END,
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

  RETURN jsonb_build_object('ok', true, 'booking_id', p_booking_id, 'payment_id', v_payment, 'subscription_id', v_subscription, 'queue_id', v_queue);
END $$;

REVOKE EXECUTE ON FUNCTION public.activate_paid_booking(uuid, text, text, text, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_paid_booking(uuid, text, text, text, jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ensure_ops_customer_for_booking(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_ops_customer_for_booking(uuid) TO authenticated, service_role;