DROP FUNCTION IF EXISTS public.create_addon_request(uuid, uuid, date, text, text, uuid);

CREATE OR REPLACE FUNCTION public.create_addon_request(
  p_subscription_id uuid, p_service_id uuid, p_preferred_date date,
  p_preferred_time text, p_notes text, p_vehicle_id uuid DEFAULT NULL,
  p_address_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_id uuid;
  v_booking_id uuid;
  v_user uuid := auth.uid();
  v_sub record;
  v_svc record;
  v_addr record;
  v_name text;
  v_phone text;
  v_veh_id uuid;
  v_veh text;
  v_plan_veh text;
  v_benefit public.benefit_type;
  v_consume jsonb := jsonb_build_object('consumed', false, 'reason', 'no_benefit_type');
  v_paid boolean := true;
  v_preview jsonb;
  v_payable numeric := 0;
  v_meta jsonb := '{}'::jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT * INTO v_sub FROM public.subscriptions
   WHERE id = p_subscription_id AND user_id = v_user
     AND status IN ('active','assigned','awaiting_partner_assignment');
  IF NOT FOUND THEN RAISE EXCEPTION 'Active Daily Shine subscription not found'; END IF;

  SELECT * INTO v_svc FROM public.service_catalog WHERE id = p_service_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service not found'; END IF;

  SELECT full_name, phone INTO v_name, v_phone
    FROM public.customer_profiles WHERE user_id = v_user LIMIT 1;

  v_veh_id := COALESCE(p_vehicle_id, v_sub.vehicle_id);
  IF v_veh_id IS NULL THEN RAISE EXCEPTION 'Select a vehicle'; END IF;

  SELECT concat_ws(' ', make, model, NULLIF(registration_number, ''))
    INTO v_veh FROM public.customer_vehicles
    WHERE id = v_veh_id AND user_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected vehicle does not belong to you'; END IF;

  IF v_sub.vehicle_id IS DISTINCT FROM v_veh_id THEN
    SELECT concat_ws(' ', make, model, NULLIF(registration_number, ''))
      INTO v_plan_veh FROM public.customer_vehicles WHERE id = v_sub.vehicle_id;
    RAISE EXCEPTION 'This Daily Shine plan belongs to %. Switch to that vehicle or subscribe this vehicle first.',
      COALESCE(v_plan_veh, 'another vehicle');
  END IF;

  IF p_address_id IS NOT NULL THEN
    SELECT * INTO v_addr FROM public.customer_addresses WHERE id = p_address_id AND user_id = v_user;
    IF NOT FOUND THEN RAISE EXCEPTION 'Address not found'; END IF;
  END IF;

  v_preview := public.preview_customer_booking(p_service_id, v_veh_id, p_address_id, p_preferred_date, p_preferred_time, '[]'::jsonb, NULL);
  v_payable := COALESCE((v_preview->>'payable')::numeric, 0);
  v_benefit := public.service_slug_to_benefit(v_svc.slug);

  IF v_benefit IS NOT NULL AND COALESCE((v_preview->>'used_entitlement')::boolean, false) THEN
    v_consume := public.try_consume_entitlement(v_veh_id, v_benefit, NULL, NULL, 'addon_request');
    v_paid := NOT COALESCE((v_consume->>'consumed')::boolean, false);
    IF v_paid THEN
      v_preview := public.preview_customer_booking(p_service_id, v_veh_id, p_address_id, p_preferred_date, p_preferred_time, '[]'::jsonb, NULL);
      v_payable := COALESCE((v_preview->>'payable')::numeric, v_payable);
    ELSE
      v_payable := 0;
      IF p_address_id IS NOT NULL THEN
        INSERT INTO public.bookings(
          user_id, service_id, vehicle_id, address_id, scheduled_date, scheduled_time,
          preferred_before_time, notes, coupon_code, base_amount, addon_amount, discount_amount, total_amount,
          status, payment_status
        ) VALUES (
          v_user, p_service_id, v_veh_id, p_address_id, p_preferred_date, p_preferred_time,
          p_preferred_time, nullif(trim(coalesce(p_notes, '')), ''), NULL, 0, 0, 0, 0,
          'paid', 'paid'
        ) RETURNING id INTO v_booking_id;

        UPDATE public.entitlement_ledger
           SET booking_id = v_booking_id
         WHERE entitlement_id = (v_consume->>'entitlement_id')::uuid
           AND booking_id IS NULL
           AND actor_user_id = v_user
           AND created_at > now() - INTERVAL '10 seconds';
      END IF;
    END IF;
  ELSE
    v_paid := v_payable > 0;
  END IF;

  v_meta := jsonb_build_object('entitlement', v_consume, 'paid', v_paid, 'payable', v_payable, 'benefit_type', v_benefit, 'preview', v_preview, 'booking_id', v_booking_id);

  INSERT INTO public.subscription_addon_requests(
    subscription_id, user_id, customer_name, customer_phone,
    vehicle_id, vehicle_label, service_id, service_name, service_slug,
    preferred_date, preferred_time, notes, status, metadata
  ) VALUES (
    p_subscription_id, v_user, v_name, v_phone,
    v_veh_id, v_veh, p_service_id, v_svc.name, v_svc.slug,
    p_preferred_date, p_preferred_time, p_notes, 'new', v_meta
  ) RETURNING id INTO v_id;

  IF COALESCE((v_consume->>'consumed')::boolean, false) THEN
    UPDATE public.entitlement_ledger
       SET addon_request_id = v_id
     WHERE entitlement_id = (v_consume->>'entitlement_id')::uuid
       AND addon_request_id IS NULL
       AND actor_user_id = v_user
       AND created_at > now() - INTERVAL '10 seconds';
  END IF;

  INSERT INTO public.admin_alerts(kind, title, body, severity, meta)
  VALUES (
    'subscription_addon',
    CASE WHEN v_paid THEN 'Paid add-on request' ELSE 'Included benefit consumed' END,
    format('%s for %s on %s (%s)', v_svc.name, COALESCE(v_veh,'vehicle'),
           coalesce(p_preferred_date::text,'TBD'), COALESCE(p_preferred_time,'')),
    'info',
    jsonb_build_object('addon_request_id', v_id, 'booking_id', v_booking_id, 'subscription_id', p_subscription_id,
      'vehicle_id', v_veh_id, 'service_id', p_service_id, 'paid', v_paid, 'payable', v_payable,
      'benefit_type', v_benefit, 'entitlement', v_consume, 'preview', v_preview));

  RETURN jsonb_build_object('addon_request_id', v_id, 'booking_id', v_booking_id, 'paid', v_paid, 'payable', v_payable,
    'used_entitlement', NOT v_paid, 'benefit_type', v_benefit, 'entitlement', v_consume,
    'remaining_after_booking', v_preview->'remaining_after_booking', 'preview', v_preview);
END $$;

REVOKE ALL ON FUNCTION public.create_addon_request(uuid, uuid, date, text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_addon_request(uuid, uuid, date, text, text, uuid, uuid) TO authenticated, service_role;