-- Fix column names: admin_alerts uses (kind, meta), not (type, metadata).
CREATE OR REPLACE FUNCTION public.tg_enqueue_subscription_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_type text; v_slug text; v_dup_sub uuid; v_dup_booking uuid;
BEGIN
  IF NEW.payment_status = 'paid'
     AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
    SELECT service_type, slug INTO v_type, v_slug FROM public.service_catalog WHERE id = NEW.service_id;
    IF v_type = 'subscription' THEN
      PERFORM public.ensure_ops_customer_for_booking(NEW.id);

      SELECT id, booking_id INTO v_dup_sub, v_dup_booking
        FROM public.subscriptions
        WHERE vehicle_id = NEW.vehicle_id
          AND status IN ('active','awaiting_partner_assignment','assigned')
          AND booking_id <> NEW.id
        LIMIT 1;

      IF v_dup_sub IS NOT NULL THEN
        INSERT INTO public.admin_alerts(kind,title,body,severity,meta)
        VALUES('refund_required',
               'Duplicate Daily Shine payment — refund required',
               'A second paid booking ('||NEW.id::text||') landed for a vehicle that already has an active subscription. Refund manually.',
               'high',
               jsonb_build_object('duplicate_of_subscription_id', v_dup_sub,
                                  'duplicate_of_booking_id', v_dup_booking,
                                  'booking_id', NEW.id,
                                  'vehicle_id', NEW.vehicle_id,
                                  'user_id', NEW.user_id,
                                  'amount', NEW.total_amount));
        RETURN NEW;
      END IF;

      INSERT INTO public.subscriptions (
        booking_id, user_id, customer_id, vehicle_id, plan_slug, status, start_date, renewal_date, service_start_date, amount, currency
      ) VALUES (
        NEW.id, NEW.user_id, NEW.user_id, NEW.vehicle_id, COALESCE(v_slug, 'daily-shine'), 'awaiting_partner_assignment',
        COALESCE(NEW.scheduled_date, CURRENT_DATE), COALESCE(NEW.scheduled_date, CURRENT_DATE) + 30,
        COALESCE(NEW.scheduled_date, CURRENT_DATE), NEW.total_amount, 'INR'
      )
      ON CONFLICT (booking_id) DO UPDATE SET
        status = CASE WHEN public.subscriptions.status = 'assigned' THEN public.subscriptions.status ELSE 'awaiting_partner_assignment' END,
        start_date = EXCLUDED.start_date,
        renewal_date = EXCLUDED.renewal_date,
        service_start_date = EXCLUDED.service_start_date,
        amount = EXCLUDED.amount,
        updated_at = now();
      PERFORM public.enqueue_subscription_booking(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- Same fix in activate_paid_booking refund alert
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
  v_cust_name text; v_cust_phone text; v_addr text; v_veh_label text;
  v_dup_sub_id uuid; v_dup_booking uuid; v_refund_required boolean := false;
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
    SELECT id, booking_id INTO v_dup_sub_id, v_dup_booking
      FROM public.subscriptions
      WHERE vehicle_id = v_booking.vehicle_id
        AND status IN ('active','awaiting_partner_assignment','assigned')
        AND booking_id <> p_booking_id
      LIMIT 1;

    IF v_dup_sub_id IS NOT NULL THEN
      v_refund_required := true;
      INSERT INTO public.admin_alerts(kind,title,body,severity,meta)
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

    INSERT INTO public.admin_alerts(kind,title,body,severity,meta)
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