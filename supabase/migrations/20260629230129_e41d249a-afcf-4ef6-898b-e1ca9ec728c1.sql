-- P0-DUP-01: Prevent duplicate Daily Shine subscriptions per vehicle
-- Defense layers: (1) unique partial index, (2) pre-payment RPC guard,
-- (3) post-payment race guard with refund alert.

-- ============================================================
-- LAYER 1: Database hard constraint
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_vehicle_open
  ON public.subscriptions(vehicle_id)
  WHERE status IN ('active','awaiting_partner_assignment','assigned')
    AND vehicle_id IS NOT NULL;

-- ============================================================
-- LAYER 2: Pre-payment guard in confirm_customer_booking
-- Block creation of the booking (and therefore the Razorpay order)
-- when the vehicle already has an open subscription.
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_customer_booking(
  p_service_id uuid, p_vehicle_id uuid, p_address_id uuid,
  p_scheduled_date date, p_scheduled_time text,
  p_notes text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text,
  p_addons jsonb DEFAULT '[]'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_service record; v_vehicle record; v_address record;
  v_base numeric := 0; v_addon numeric := 0; v_discount numeric := 0; v_total numeric := 0;
  v_booking uuid;
  v_coupon text := upper(nullif(trim(coalesce(p_coupon_code, '')), ''));
  v_percent int := 0; v_min_vehicles int := 0; v_vehicle_count int := 0;
  item record; addon_rec record; v_qty int;
  v_has_active_sub boolean;
  v_dup_sub_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Please sign in again'; END IF;
  IF p_scheduled_date IS NULL OR p_scheduled_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Choose a valid service date';
  END IF;
  SELECT * INTO v_service FROM public.service_catalog WHERE id = p_service_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service is not available'; END IF;

  -- P0-02 guard: Daily Shine included services must go through subscription_addon_requests
  IF v_service.slug IN ('daily-shine-interior','daily-shine-exterior','daily-shine-dusting') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = v_user AND status = 'active'
    ) INTO v_has_active_sub;
    IF v_has_active_sub THEN
      RAISE EXCEPTION 'Use My Plan → Schedule wash for included services (no premium charge).'
        USING ERRCODE = 'P0202', HINT = 'Call create_addon_request instead.';
    END IF;
  END IF;

  SELECT * INTO v_vehicle FROM public.customer_vehicles WHERE id = p_vehicle_id AND user_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select one of your vehicles'; END IF;
  SELECT * INTO v_address FROM public.customer_addresses WHERE id = p_address_id AND user_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Select one of your addresses'; END IF;

  -- P0-DUP-01 guard: per-vehicle subscription uniqueness (pre-payment).
  IF v_service.service_type = 'subscription' OR v_service.category = 'subscription' THEN
    SELECT id INTO v_dup_sub_id
      FROM public.subscriptions
      WHERE vehicle_id = p_vehicle_id
        AND status IN ('active','awaiting_partner_assignment','assigned')
      LIMIT 1;
    IF v_dup_sub_id IS NOT NULL THEN
      RAISE EXCEPTION 'This vehicle already has an active Daily Shine subscription.'
        USING ERRCODE = 'P0DUP', HINT = 'Add another vehicle, or wait until the current plan expires.';
    END IF;
  END IF;

  v_base := CASE WHEN v_vehicle.category = 'sedan_suv' THEN v_service.price_sedan_suv ELSE v_service.price_hatchback END;

  IF p_addons IS NULL OR jsonb_typeof(p_addons) IS NULL THEN p_addons := '[]'::jsonb; END IF;
  IF jsonb_typeof(p_addons) <> 'array' THEN RAISE EXCEPTION 'Invalid add-ons'; END IF;

  FOR item IN SELECT * FROM jsonb_to_recordset(p_addons) AS x(id uuid, quantity int) LOOP
    v_qty := LEAST(GREATEST(COALESCE(item.quantity, 0), 0), 20);
    IF v_qty = 0 THEN CONTINUE; END IF;
    SELECT * INTO addon_rec FROM public.service_addons
      WHERE id = item.id AND active = true
        AND (cardinality(applies_to_slugs) = 0 OR v_service.slug = ANY(applies_to_slugs));
    IF FOUND THEN
      v_addon := v_addon + (CASE WHEN v_vehicle.category = 'sedan_suv' THEN addon_rec.price_sedan_suv ELSE addon_rec.price_hatchback END) * v_qty;
    END IF;
  END LOOP;

  IF v_coupon IS NOT NULL THEN
    SELECT percent, min_vehicles INTO v_percent, v_min_vehicles
      FROM public.multi_vehicle_discounts WHERE code = v_coupon AND active = true;
    IF v_percent IS NULL THEN RAISE EXCEPTION 'Invalid coupon code'; END IF;
    SELECT count(*) INTO v_vehicle_count FROM public.customer_vehicles WHERE user_id = v_user;
    IF v_vehicle_count < v_min_vehicles THEN
      RAISE EXCEPTION 'Coupon needs % or more vehicles on your account', v_min_vehicles;
    END IF;
    v_discount := round(((v_base + v_addon) * v_percent) / 100);
  END IF;

  v_total := GREATEST(v_base + v_addon - v_discount, 0);

  INSERT INTO public.bookings (
    user_id, service_id, vehicle_id, address_id, scheduled_date, scheduled_time,
    preferred_before_time, notes, base_amount, addon_amount, discount_amount,
    total_amount, status, payment_status
  ) VALUES (
    v_user, p_service_id, p_vehicle_id, p_address_id, p_scheduled_date, p_scheduled_time,
    p_scheduled_time, nullif(trim(coalesce(p_notes, '')), ''), v_base, v_addon, v_discount,
    v_total, 'pending_payment', 'pending'
  ) RETURNING id INTO v_booking;

  FOR item IN SELECT * FROM jsonb_to_recordset(p_addons) AS x(id uuid, quantity int) LOOP
    v_qty := LEAST(GREATEST(COALESCE(item.quantity, 0), 0), 20);
    IF v_qty = 0 THEN CONTINUE; END IF;
    SELECT * INTO addon_rec FROM public.service_addons
      WHERE id = item.id AND active = true
        AND (cardinality(applies_to_slugs) = 0 OR v_service.slug = ANY(applies_to_slugs));
    INSERT INTO public.booking_addons (booking_id, addon_key, addon_name, price, quantity)
    VALUES (v_booking, addon_rec.id::text, addon_rec.name,
      CASE WHEN v_vehicle.category = 'sedan_suv' THEN addon_rec.price_sedan_suv ELSE addon_rec.price_hatchback END, v_qty);
  END LOOP;

  RETURN v_booking;
END;
$function$;

-- ============================================================
-- LAYER 3: Post-payment race guard in activate_paid_booking
-- Two tabs / webhook replay could pass Layer 2; the unique index
-- guarantees only one INSERT wins. The loser must NOT silently fail —
-- record the payment, skip subscription creation, raise a refund alert.
-- ============================================================
CREATE OR REPLACE FUNCTION public.activate_paid_booking(
  p_booking_id uuid,
  p_provider_order_id text DEFAULT NULL::text,
  p_provider_payment_id text DEFAULT NULL::text,
  p_signature text DEFAULT NULL::text,
  p_raw_payload jsonb DEFAULT '{}'::jsonb)
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
  v_lead uuid;
  v_cust_name text;
  v_cust_phone text;
  v_addr text;
  v_veh_label text;
  v_dup_sub_id uuid;
  v_dup_booking uuid;
  v_refund_required boolean := false;
BEGIN
  SELECT bk.*, sc.slug AS service_slug, sc.service_type, sc.name AS service_name, sc.category AS service_category
    INTO v_booking
    FROM public.bookings bk
    JOIN public.service_catalog sc ON sc.id = bk.service_id
    WHERE bk.id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;

  IF v_user IS NOT NULL AND v_booking.user_id <> v_user AND NOT public.has_role(v_user,'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.ensure_ops_customer_for_booking(p_booking_id);

  INSERT INTO public.payments(booking_id,user_id,provider,provider_order_id,provider_payment_id,amount,currency,status,metadata)
  VALUES (p_booking_id, v_booking.user_id,'razorpay',p_provider_order_id,p_provider_payment_id,
          v_booking.total_amount,'INR','captured',
          jsonb_build_object('service_slug',v_booking.service_slug) || COALESCE(p_raw_payload,'{}'::jsonb))
  ON CONFLICT (booking_id, provider) WHERE booking_id IS NOT NULL
  DO UPDATE SET provider_order_id=COALESCE(EXCLUDED.provider_order_id,public.payments.provider_order_id),
                provider_payment_id=COALESCE(EXCLUDED.provider_payment_id,public.payments.provider_payment_id),
                amount=EXCLUDED.amount, status='captured',
                metadata=public.payments.metadata||EXCLUDED.metadata, updated_at=now()
  RETURNING id INTO v_payment;

  INSERT INTO public.payment_transactions(payment_id,booking_id,user_id,provider,event_type,provider_order_id,provider_payment_id,signature,amount,status,raw_payload)
  VALUES(v_payment,p_booking_id,v_booking.user_id,'razorpay','payment.captured',p_provider_order_id,p_provider_payment_id,p_signature,v_booking.total_amount,'success',COALESCE(p_raw_payload,'{}'::jsonb));

  UPDATE public.bookings SET payment_status='paid', status='paid',
    razorpay_order_id=COALESCE(p_provider_order_id,razorpay_order_id),
    razorpay_payment_id=COALESCE(p_provider_payment_id,razorpay_payment_id),
    updated_at=now() WHERE id=p_booking_id;

  IF v_booking.service_category = 'subscription' OR v_booking.service_type='subscription' THEN
    -- P0-DUP-01 race guard: another booking already opened a sub for this vehicle.
    SELECT id, booking_id INTO v_dup_sub_id, v_dup_booking
      FROM public.subscriptions
      WHERE vehicle_id = v_booking.vehicle_id
        AND status IN ('active','awaiting_partner_assignment','assigned')
        AND booking_id <> p_booking_id
      LIMIT 1;

    IF v_dup_sub_id IS NOT NULL THEN
      v_refund_required := true;
      INSERT INTO public.admin_alerts(type,title,body,severity,metadata)
      VALUES('refund_required',
             'Duplicate Daily Shine payment — refund required',
             'Customer paid twice for the same vehicle. Manual refund needed for booking '||p_booking_id::text||'.',
             'high',
             jsonb_build_object(
               'duplicate_of_subscription_id', v_dup_sub_id,
               'duplicate_of_booking_id', v_dup_booking,
               'booking_id', p_booking_id,
               'payment_id', v_payment,
               'vehicle_id', v_booking.vehicle_id,
               'user_id', v_booking.user_id,
               'amount', v_booking.total_amount));

      INSERT INTO public.customer_notifications(user_id,type,title,body,link,metadata)
      VALUES(v_booking.user_id,'refund_processing',
             'Duplicate subscription detected',
             'We received a second payment for a vehicle that already has an active Daily Shine plan. Our team will refund you shortly.',
             '/c/subscriptions',
             jsonb_build_object('booking_id',p_booking_id,'duplicate_of', v_dup_sub_id));
    ELSE
      INSERT INTO public.subscriptions(booking_id,user_id,customer_id,vehicle_id,plan_slug,status,start_date,renewal_date,service_start_date,amount,currency)
      VALUES(p_booking_id,v_booking.user_id,v_booking.user_id,v_booking.vehicle_id,v_booking.service_slug,'awaiting_partner_assignment',
             COALESCE(v_booking.scheduled_date,CURRENT_DATE),COALESCE(v_booking.scheduled_date,CURRENT_DATE)+30,
             COALESCE(v_booking.scheduled_date,CURRENT_DATE),v_booking.total_amount,'INR')
      ON CONFLICT(booking_id) DO UPDATE SET
        status=CASE WHEN public.subscriptions.status='assigned' THEN public.subscriptions.status ELSE 'awaiting_partner_assignment' END,
        start_date=EXCLUDED.start_date, renewal_date=EXCLUDED.renewal_date,
        service_start_date=EXCLUDED.service_start_date, amount=EXCLUDED.amount, updated_at=now()
      RETURNING id INTO v_subscription;

      SELECT public.enqueue_subscription_booking(p_booking_id) INTO v_queue;

      INSERT INTO public.customer_notifications(user_id,type,title,body,link,metadata)
      VALUES(v_booking.user_id,'subscription_paid','Daily Shine subscription active',
             'Your payment is complete. We are assigning your Urban Wash Partner now.','/c/subscriptions',
             jsonb_build_object('booking_id',p_booking_id,'subscription_id',v_subscription,'queue_id',v_queue));
    END IF;
  ELSE
    SELECT cp.full_name, cp.phone INTO v_cust_name, v_cust_phone
      FROM public.customer_profiles cp WHERE cp.user_id = v_booking.user_id LIMIT 1;
    SELECT concat_ws(', ', address_line, area, pincode) INTO v_addr
      FROM public.customer_addresses WHERE id = v_booking.address_id;
    SELECT concat_ws(' ', make, model, '·', registration_number) INTO v_veh_label
      FROM public.customer_vehicles WHERE id = v_booking.vehicle_id;

    INSERT INTO public.service_leads(
      booking_id,user_id,customer_name,customer_phone,vehicle_id,vehicle_label,
      address_id,address_text,service_id,service_slug,service_name,service_category,
      price,payment_id,payment_status,scheduled_date,scheduled_time,status,metadata
    ) VALUES (
      p_booking_id, v_booking.user_id, v_cust_name, v_cust_phone,
      v_booking.vehicle_id, v_veh_label,
      v_booking.address_id, v_addr,
      v_booking.service_id, v_booking.service_slug, v_booking.service_name, v_booking.service_category,
      v_booking.total_amount, v_payment, 'paid',
      v_booking.scheduled_date, COALESCE(v_booking.scheduled_time, v_booking.preferred_before_time),
      'new', jsonb_build_object('source','payment')
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_lead;

    INSERT INTO public.admin_alerts(type,title,body,severity,metadata)
    VALUES('service_lead','New service lead: '||v_booking.service_name,
           COALESCE(v_cust_name,'Customer')||' booked '||v_booking.service_name||' (₹'||v_booking.total_amount||')',
           'info', jsonb_build_object('lead_id',v_lead,'booking_id',p_booking_id));

    INSERT INTO public.customer_notifications(user_id,type,title,body,link,metadata)
    VALUES(v_booking.user_id,'booking_confirmed','Booking Confirmed',
           'Your booking has been successfully confirmed. Our team will contact you shortly.',
           '/c/bookings/'||p_booking_id,
           jsonb_build_object('booking_id',p_booking_id,'lead_id',v_lead));
  END IF;

  RETURN jsonb_build_object('ok',true,'booking_id',p_booking_id,'payment_id',v_payment,
                            'subscription_id',v_subscription,'queue_id',v_queue,'lead_id',v_lead,
                            'refund_required', v_refund_required);
END $function$;