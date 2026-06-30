
-- A) Let the credit trigger update partners.lifetime_earnings/total_cars_completed
CREATE OR REPLACE FUNCTION public.enforce_partner_self_update_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('app.bypass_partner_guard', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'admin'::app_role) OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;
  NEW.rate_per_car      := OLD.rate_per_car;
  NEW.reliability_score := OLD.reliability_score;
  NEW.lifetime_earnings := OLD.lifetime_earnings;
  NEW.aadhaar_verified  := OLD.aadhaar_verified;
  NEW.pan_verified      := OLD.pan_verified;
  NEW.bank_verified     := OLD.bank_verified;
  NEW.level             := OLD.level;
  NEW.status            := OLD.status;
  RETURN NEW;
END;
$$;

-- B) Always upsert per-day earnings row in the RPC
CREATE OR REPLACE FUNCTION public.partner_complete_service(
  p_service_id uuid,
  p_lat numeric DEFAULT NULL,
  p_lng numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_force_override boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_svc services%ROWTYPE;
  v_radius_m numeric;
  v_rate numeric;
  v_cust_lat numeric; v_cust_lng numeric;
  v_dist_km numeric; v_dist_m numeric;
  v_flag text;
  v_has_before boolean;
  v_missing_after text[] := ARRAY[]::text[];
  v_a record;
  v_now timestamptz := now();
  v_booking_id uuid;
  v_partner_name text;
  v_photo_paths jsonb;
  v_customer_user uuid;
  v_customer_phone text;
  v_complaint_window_h int;
  v_was_already_credited boolean;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_svc FROM public.services WHERE id = p_service_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service not found' USING ERRCODE='P0404'; END IF;
  IF v_svc.partner_id IS DISTINCT FROM v_partner AND NOT p_force_override THEN
    RAISE EXCEPTION 'Not your service' USING ERRCODE='P04AU';
  END IF;

  IF v_svc.status = 'completed' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'service_id', v_svc.id);
  END IF;
  IF v_svc.status NOT IN ('pending','in_progress') THEN
    RAISE EXCEPTION 'Service cannot be completed from status %', v_svc.status USING ERRCODE='P04ST';
  END IF;

  IF NOT p_force_override THEN
    SELECT EXISTS(SELECT 1 FROM public.service_photos WHERE service_id = p_service_id AND stage='before')
      INTO v_has_before;
    FOR v_a IN SELECT unnest(ARRAY['front','rear','left','right']) AS angle LOOP
      IF NOT EXISTS(SELECT 1 FROM public.service_photos
                    WHERE service_id = p_service_id AND stage='after' AND angle::text = v_a.angle) THEN
        v_missing_after := array_append(v_missing_after, v_a.angle);
      END IF;
    END LOOP;
    IF NOT v_has_before OR array_length(v_missing_after,1) IS NOT NULL THEN
      RAISE EXCEPTION 'Missing required photos'
        USING ERRCODE='P04PH',
              DETAIL = jsonb_build_object('missing_before', NOT v_has_before,
                                           'missing_after', v_missing_after)::text;
    END IF;
  END IF;

  SELECT COALESCE((value::text)::numeric, 200) INTO v_radius_m
    FROM public.platform_settings WHERE key='complete_gps_radius_m';
  SELECT c.latitude, c.longitude, c.phone INTO v_cust_lat, v_cust_lng, v_customer_phone
    FROM public.customers c WHERE c.id = v_svc.customer_id;

  IF p_lat IS NULL OR p_lng IS NULL THEN v_flag := 'missing_gps'; v_dist_m := NULL;
  ELSIF v_cust_lat IS NULL OR v_cust_lng IS NULL THEN v_flag := 'missing_customer_gps'; v_dist_m := NULL;
  ELSE
    v_dist_km := public.haversine_km(p_lat, p_lng, v_cust_lat, v_cust_lng);
    v_dist_m := round(v_dist_km * 1000, 1);
    v_flag := CASE WHEN v_dist_m <= v_radius_m THEN 'ok' ELSE 'out_of_range' END;
  END IF;

  IF v_flag = 'out_of_range' AND NOT p_force_override THEN
    UPDATE public.services
      SET gps_flag = v_flag, gps_distance_m = v_dist_m, fraud_review = true,
          complete_lat = p_lat, complete_lng = p_lng, updated_at = v_now
      WHERE id = p_service_id;
    RAISE EXCEPTION 'You are too far from the customer address (% m, allowed %)', v_dist_m, v_radius_m
      USING ERRCODE='P04GP',
            DETAIL = jsonb_build_object('distance_m', v_dist_m, 'radius_m', v_radius_m)::text;
  END IF;

  SELECT COALESCE((value::text)::numeric, 17) INTO v_rate
    FROM public.platform_settings WHERE key='daily_shine_rate_per_car';
  v_rate := COALESCE(NULLIF(v_svc.rate_per_car,0), v_rate, 17);

  -- Idempotency anchor: have we already credited this service?
  SELECT EXISTS(SELECT 1 FROM public.wallet_ledger
                WHERE service_id = p_service_id AND entry_type='earning')
    INTO v_was_already_credited;

  -- Mark service completed — this fires tg_credit_completed_service (wallet + lifetime)
  UPDATE public.services SET
    status = 'completed', completed_at = v_now,
    complete_lat = p_lat, complete_lng = p_lng,
    gps_flag = v_flag, gps_distance_m = v_dist_m,
    fraud_review = (v_flag <> 'ok'),
    updated_at = v_now
  WHERE id = p_service_id;

  -- Per-day earnings aggregate (one row per partner per day; idempotent per service)
  IF NOT v_was_already_credited THEN
    INSERT INTO public.earnings(partner_id, earned_on, cars_completed, base_amount)
    VALUES (v_partner, CURRENT_DATE, 1, v_rate)
    ON CONFLICT (partner_id, earned_on) DO UPDATE SET
      cars_completed = public.earnings.cars_completed + 1,
      base_amount    = public.earnings.base_amount + EXCLUDED.base_amount;
  END IF;

  SELECT id, user_id INTO v_booking_id, v_customer_user
    FROM public.bookings WHERE ops_service_id = p_service_id LIMIT 1;

  IF v_customer_user IS NULL AND v_customer_phone IS NOT NULL THEN
    SELECT user_id INTO v_customer_user
      FROM public.customer_profiles WHERE phone = v_customer_phone LIMIT 1;
  END IF;

  SELECT full_name INTO v_partner_name FROM public.partners WHERE id = v_partner;
  SELECT COALESCE((value::text)::int, 2) INTO v_complaint_window_h
    FROM public.platform_settings WHERE key='complaint_window_hours';
  SELECT jsonb_agg(jsonb_build_object('stage',stage,'angle',angle,'path',storage_path))
    INTO v_photo_paths FROM public.service_photos WHERE service_id = p_service_id;

  -- Enrich the trigger-created customer notification (or insert if trigger didn't fire / customer link was missing)
  IF v_customer_user IS NOT NULL THEN
    UPDATE public.customer_notifications SET
      metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
        'service_id', p_service_id,
        'booking_id', v_booking_id,
        'partner_name', v_partner_name,
        'completed_at', v_now,
        'photos', COALESCE(v_photo_paths, '[]'::jsonb),
        'complaint_until', v_now + (v_complaint_window_h || ' hours')::interval
      ),
      link = COALESCE(link, CASE WHEN v_booking_id IS NOT NULL THEN '/c/bookings/' || v_booking_id::text ELSE NULL END)
    WHERE user_id = v_customer_user
      AND type = 'service_completed'
      AND (metadata->>'service_id') = p_service_id::text;

    IF NOT FOUND THEN
      INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
      VALUES (
        v_customer_user, 'service_completed',
        'Your service is complete',
        'Your vehicle has been serviced. Tap to see today''s photos and details.',
        CASE WHEN v_booking_id IS NOT NULL THEN '/c/bookings/' || v_booking_id::text ELSE NULL END,
        jsonb_build_object(
          'service_id', p_service_id,
          'booking_id', v_booking_id,
          'partner_name', v_partner_name,
          'completed_at', v_now,
          'photos', COALESCE(v_photo_paths, '[]'::jsonb),
          'complaint_until', v_now + (v_complaint_window_h || ' hours')::interval
        )
      );
    END IF;
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.partner_notifications
     WHERE partner_id = v_partner AND type='earnings_posted'
       AND (metadata->>'service_id') = p_service_id::text
  ) THEN
    INSERT INTO public.partner_notifications(partner_id, type, title, body, metadata)
    VALUES (v_partner, 'earnings_posted',
            '₹' || v_rate || ' earned',
            'Service completed. Earnings credited to your wallet.',
            jsonb_build_object('service_id', p_service_id, 'amount', v_rate));
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'already', false,
    'service_id', p_service_id,
    'booking_id', v_booking_id,
    'amount', v_rate,
    'gps_flag', v_flag,
    'distance_m', v_dist_m,
    'customer_notified', v_customer_user IS NOT NULL
  );
END;
$$;
