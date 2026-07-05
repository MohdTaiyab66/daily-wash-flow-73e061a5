-- P0: Daily Shine entitlement-first booking engine

CREATE OR REPLACE FUNCTION public.service_slug_to_benefit(p_slug text)
RETURNS public.benefit_type
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_slug,''))
    WHEN 'daily-shine-interior' THEN 'interior'::public.benefit_type
    WHEN 'interior-wash' THEN 'interior'::public.benefit_type
    WHEN 'premium-interior' THEN 'interior'::public.benefit_type
    WHEN 'deep-clean-interior' THEN 'interior'::public.benefit_type
    WHEN 'daily-shine-exterior' THEN 'exterior_daily'::public.benefit_type
    WHEN 'exterior-wash' THEN 'exterior_daily'::public.benefit_type
    WHEN 'one-time-wash' THEN 'exterior_daily'::public.benefit_type
    WHEN 'one-time-wash-no-polish' THEN 'exterior_daily'::public.benefit_type
    WHEN 'hydrophobic-exterior' THEN 'exterior_hydrophobic'::public.benefit_type
    WHEN 'pressure-wash' THEN 'exterior_hydrophobic'::public.benefit_type
    WHEN 'daily-shine-dusting' THEN 'dusting'::public.benefit_type
    WHEN 'dusting' THEN 'dusting'::public.benefit_type
    WHEN 'tyre-polish' THEN 'tyre_polish'::public.benefit_type
    WHEN 'paper-mats' THEN 'paper_mats'::public.benefit_type
    WHEN 'fragrance' THEN 'fragrance'::public.benefit_type
    ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.addon_price_for_benefit(
  p_benefit public.benefit_type,
  p_vehicle_category text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_price numeric;
BEGIN
  SELECT CASE WHEN p_vehicle_category = 'sedan_suv' THEN a.price_sedan_suv ELSE a.price_hatchback END
    INTO v_price
  FROM public.service_addons a
  WHERE a.active = true
    AND ('daily-shine' = ANY(COALESCE(a.applies_to_slugs, ARRAY[]::text[])) OR COALESCE(cardinality(a.applies_to_slugs), 0) = 0)
    AND (
      (p_benefit = 'interior'::public.benefit_type AND lower(a.name) LIKE '%interior%' AND lower(a.name) NOT LIKE '%deep%')
      OR (p_benefit = 'exterior_daily'::public.benefit_type AND lower(a.name) LIKE '%exterior%')
      OR (p_benefit = 'dusting'::public.benefit_type AND lower(a.name) LIKE '%dust%')
      OR (p_benefit = 'exterior_hydrophobic'::public.benefit_type AND (lower(a.name) LIKE '%hydro%' OR lower(a.name) LIKE '%pressure%'))
      OR (p_benefit = 'tyre_polish'::public.benefit_type AND lower(a.name) LIKE '%tyre%')
      OR (p_benefit = 'paper_mats'::public.benefit_type AND lower(a.name) LIKE '%mat%')
      OR (p_benefit = 'fragrance'::public.benefit_type AND lower(a.name) LIKE '%fragrance%')
    )
  ORDER BY a.sort_order, a.created_at
  LIMIT 1;

  RETURN v_price;
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_customer_booking(
  p_service_id uuid,
  p_vehicle_id uuid,
  p_address_id uuid DEFAULT NULL,
  p_scheduled_date date DEFAULT CURRENT_DATE,
  p_scheduled_time text DEFAULT NULL,
  p_addons jsonb DEFAULT '[]'::jsonb,
  p_coupon_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_service record;
  v_vehicle record;
  v_sub record;
  v_ent record;
  v_benefit public.benefit_type;
  v_base numeric := 0;
  v_addon numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_addon_price numeric;
  v_remaining integer;
  v_remaining_after integer;
  v_coupon text := upper(nullif(trim(coalesce(p_coupon_code, '')), ''));
  v_percent numeric := 0;
  v_min_vehicles int := 0;
  v_vehicle_count int := 0;
  v_first_vehicle_id uuid;
  v_is_first_vehicle boolean := false;
  item record;
  addon_rec record;
  v_qty int;
  v_unit numeric;
  v_remaining_key text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Please sign in again';
  END IF;

  SELECT * INTO v_service FROM public.service_catalog WHERE id = p_service_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service is not available'; END IF;

  SELECT * INTO v_vehicle FROM public.customer_vehicles WHERE id = p_vehicle_id AND user_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vehicle not found'; END IF;

  v_benefit := public.service_slug_to_benefit(v_service.slug);

  IF v_benefit IS NOT NULL THEN
    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE vehicle_id = p_vehicle_id
      AND user_id = v_user
      AND status IN ('active','assigned','awaiting_partner_assignment')
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      PERFORM public.ensure_entitlements_for_subscription(v_sub.id);

      SELECT e.* INTO v_ent
      FROM public.subscription_entitlements e
      WHERE e.subscription_id = v_sub.id
        AND e.vehicle_id = p_vehicle_id
        AND e.benefit_type = v_benefit
      ORDER BY
        CASE WHEN COALESCE(p_scheduled_date, CURRENT_DATE) BETWEEN e.cycle_start AND e.cycle_end THEN 0 ELSE 1 END,
        e.cycle_start DESC
      LIMIT 1;

      IF FOUND THEN
        IF v_ent.total_allocated IS NULL THEN
          v_remaining := NULL;
          v_remaining_after := NULL;
        ELSE
          v_remaining := GREATEST(0, v_ent.total_allocated - v_ent.consumed);
          v_remaining_after := GREATEST(0, v_remaining - 1);
        END IF;

        v_remaining_key := CASE v_benefit
          WHEN 'interior'::public.benefit_type THEN 'interior'
          WHEN 'exterior_daily'::public.benefit_type THEN 'exterior'
          WHEN 'exterior_hydrophobic'::public.benefit_type THEN 'hydrophobic'
          WHEN 'dusting'::public.benefit_type THEN 'dusting'
          ELSE v_benefit::text
        END;

        IF v_ent.total_allocated IS NULL OR v_remaining > 0 THEN
          RETURN jsonb_build_object(
            'payable', 0,
            'used_entitlement', true,
            'subscription_id', v_sub.id,
            'benefit_type', v_benefit,
            'entitlement_id', v_ent.id,
            'remaining_before_booking', v_remaining,
            'remaining_after_booking', jsonb_build_object(v_remaining_key, v_remaining_after),
            'message', 'Included in your Daily Shine Plan'
          );
        END IF;

        v_addon_price := public.addon_price_for_benefit(v_benefit, v_vehicle.category);
        v_total := COALESCE(v_addon_price,
          CASE WHEN v_vehicle.category = 'sedan_suv' THEN v_service.price_sedan_suv ELSE v_service.price_hatchback END
        );
        RETURN jsonb_build_object(
          'payable', v_total,
          'used_entitlement', false,
          'subscription_id', v_sub.id,
          'benefit_type', v_benefit,
          'remaining_before_booking', 0,
          'remaining_after_booking', jsonb_build_object(v_remaining_key, 0),
          'exhausted', true,
          'message', 'You''ve used all ' || replace(v_benefit::text, '_', ' ') || ' washes included in your plan. This booking will be charged as an add-on.'
        );
      END IF;
    END IF;
  END IF;

  v_base := CASE WHEN v_vehicle.category = 'sedan_suv' THEN v_service.price_sedan_suv ELSE v_service.price_hatchback END;

  IF jsonb_typeof(p_addons) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(p_addons) AS e LOOP
      v_qty := LEAST(20, GREATEST(1, COALESCE((item.value->>'quantity')::int, 1)));
      SELECT * INTO addon_rec
      FROM public.service_addons
      WHERE id = (item.value->>'id')::uuid
        AND active = true
        AND (
          applies_to_slugs IS NULL
          OR cardinality(applies_to_slugs) = 0
          OR v_service.slug = ANY(applies_to_slugs)
        );
      IF FOUND THEN
        v_unit := CASE WHEN v_vehicle.category = 'sedan_suv' THEN addon_rec.price_sedan_suv ELSE addon_rec.price_hatchback END;
        v_addon := v_addon + (v_qty * v_unit);
      END IF;
    END LOOP;
  END IF;

  IF v_coupon IS NOT NULL THEN
    IF v_coupon = 'EXTRA10' THEN v_min_vehicles := 2;
    ELSIF v_coupon = 'EXTRA15' THEN v_min_vehicles := 3;
    ELSIF v_coupon = 'MULTI20' THEN v_min_vehicles := 4;
    ELSE RAISE EXCEPTION 'Invalid coupon';
    END IF;

    SELECT percent INTO v_percent FROM public.multi_vehicle_discounts WHERE vehicle_count = v_min_vehicles AND active = true;
    SELECT count(*) INTO v_vehicle_count FROM public.customer_vehicles WHERE user_id = v_user;
    SELECT id INTO v_first_vehicle_id FROM public.customer_vehicles WHERE user_id = v_user ORDER BY created_at ASC, id ASC LIMIT 1;
    v_is_first_vehicle := (v_first_vehicle_id = p_vehicle_id);

    IF v_percent IS NULL THEN RAISE EXCEPTION 'Invalid coupon'; END IF;
    IF v_vehicle_count < v_min_vehicles THEN RAISE EXCEPTION 'Coupon requires at least % vehicles on your account', v_min_vehicles; END IF;
    IF v_is_first_vehicle AND NOT COALESCE(v_vehicle.discount_approved, false) THEN
      RAISE EXCEPTION 'Coupon applies only to an additional vehicle, not your first vehicle.';
    END IF;
    v_discount := round(((v_base + v_addon) * v_percent) / 100.0, 2);
  END IF;

  v_total := GREATEST(0, v_base + v_addon - v_discount);
  RETURN jsonb_build_object(
    'payable', v_total,
    'used_entitlement', false,
    'base_amount', v_base,
    'addon_amount', v_addon,
    'discount_amount', v_discount,
    'total_amount', v_total,
    'message', CASE WHEN v_benefit IS NOT NULL THEN 'No included benefit is available for this vehicle.' ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_customer_booking(uuid, uuid, uuid, date, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_customer_booking(uuid, uuid, uuid, date, text, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.try_consume_entitlement(
  p_vehicle_id uuid, p_benefit public.benefit_type,
  p_booking_id uuid DEFAULT NULL, p_addon_request_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'booking'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  e record;
  v_user uuid := auth.uid();
  v_remaining integer;
  v_last boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('consumed', false, 'reason', 'unauthenticated');
  END IF;

  SELECT e.* INTO e
  FROM public.subscription_entitlements e
  JOIN public.subscriptions s ON s.id = e.subscription_id
  WHERE e.vehicle_id = p_vehicle_id
    AND e.benefit_type = p_benefit
    AND s.status IN ('active','assigned','awaiting_partner_assignment')
    AND (e.user_id = v_user OR public.has_role(v_user, 'admin'))
  ORDER BY
    CASE WHEN CURRENT_DATE BETWEEN e.cycle_start AND e.cycle_end THEN 0 ELSE 1 END,
    e.cycle_start DESC
  LIMIT 1
  FOR UPDATE OF e;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('consumed', false, 'reason', 'no_entitlement');
  END IF;

  IF e.total_allocated IS NOT NULL AND e.consumed >= e.total_allocated THEN
    RETURN jsonb_build_object('consumed', false, 'reason', 'exhausted',
      'entitlement_id', e.id, 'remaining', 0);
  END IF;

  UPDATE public.subscription_entitlements
     SET consumed = consumed + 1, updated_at = now()
   WHERE id = e.id;

  INSERT INTO public.entitlement_ledger
    (entitlement_id, subscription_id, vehicle_id, benefit_type, delta,
     booking_id, addon_request_id, reason, actor_user_id)
  VALUES (e.id, e.subscription_id, e.vehicle_id, e.benefit_type, -1,
     p_booking_id, p_addon_request_id, p_reason, v_user);

  IF e.total_allocated IS NULL THEN
    v_remaining := NULL;
  ELSE
    v_remaining := e.total_allocated - (e.consumed + 1);
    v_last := (v_remaining = 0);
  END IF;

  IF v_last THEN
    BEGIN
      INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata, vehicle_id, category)
      VALUES (e.user_id, 'entitlement_exhausted',
        'Included ' || replace(e.benefit_type::text, '_', ' ') || ' used',
        'You''ve used all included ' || replace(e.benefit_type::text, '_', ' ') ||
          ' washes in your Daily Shine plan for this vehicle.',
        '/c/subscriptions',
        jsonb_build_object('vehicle_id', e.vehicle_id, 'benefit_type', e.benefit_type,
                           'subscription_id', e.subscription_id),
        e.vehicle_id,
        'subscription');
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  RETURN jsonb_build_object(
    'consumed', true, 'entitlement_id', e.id, 'benefit_type', e.benefit_type,
    'remaining', v_remaining, 'unlimited', (e.total_allocated IS NULL), 'last_one', v_last);
END $$;

GRANT EXECUTE ON FUNCTION public.try_consume_entitlement(uuid, public.benefit_type, uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_customer_booking(
  p_service_id uuid,
  p_vehicle_id uuid,
  p_address_id uuid,
  p_scheduled_date date,
  p_scheduled_time text,
  p_notes text DEFAULT NULL::text,
  p_coupon_code text DEFAULT NULL::text,
  p_addons jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_service record;
  v_vehicle record;
  v_address record;
  v_base numeric := 0;
  v_addon numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_booking uuid;
  v_coupon text := upper(nullif(trim(coalesce(p_coupon_code, '')), ''));
  v_percent numeric := 0;
  v_min_vehicles int := 0;
  v_vehicle_count int := 0;
  v_first_vehicle_id uuid;
  v_is_first_vehicle boolean := false;
  v_discount_approved boolean := false;
  item record;
  addon_rec record;
  v_qty int;
  v_unit numeric;
  v_dup_sub_id uuid;
  v_benefit public.benefit_type;
  v_sub record;
  v_consume jsonb := jsonb_build_object('consumed', false, 'reason', 'not_checked');
  v_addon_price numeric;
  v_cust_name text;
  v_cust_phone text;
  v_addr text;
  v_veh_label text;
  v_lead uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Please sign in again';
  END IF;

  IF p_scheduled_date IS NULL OR p_scheduled_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Choose a valid service date';
  END IF;

  SELECT * INTO v_service FROM public.service_catalog WHERE id = p_service_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service is not available'; END IF;

  SELECT * INTO v_vehicle FROM public.customer_vehicles WHERE id = p_vehicle_id AND user_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vehicle not found'; END IF;

  SELECT * INTO v_address FROM public.customer_addresses WHERE id = p_address_id AND user_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Address not found'; END IF;

  v_benefit := public.service_slug_to_benefit(v_service.slug);

  IF v_benefit IS NOT NULL THEN
    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE vehicle_id = p_vehicle_id
      AND user_id = v_user
      AND status IN ('active','assigned','awaiting_partner_assignment')
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      PERFORM public.ensure_entitlements_for_subscription(v_sub.id);
      v_consume := public.try_consume_entitlement(p_vehicle_id, v_benefit, NULL, NULL, 'booking');

      IF (v_consume->>'consumed')::boolean IS TRUE THEN
        v_base := 0;
        v_addon := 0;
        v_discount := 0;
        v_total := 0;

        INSERT INTO public.bookings(
          user_id, service_id, vehicle_id, address_id, scheduled_date, scheduled_time,
          preferred_before_time, notes, coupon_code, base_amount, addon_amount, discount_amount, total_amount,
          status, payment_status
        ) VALUES (
          v_user, p_service_id, p_vehicle_id, p_address_id, p_scheduled_date, p_scheduled_time,
          p_scheduled_time, nullif(trim(coalesce(p_notes, '')), ''), NULL, 0, 0, 0, 0,
          'paid', 'paid'
        ) RETURNING id INTO v_booking;

        UPDATE public.entitlement_ledger
           SET booking_id = v_booking
         WHERE entitlement_id = (v_consume->>'entitlement_id')::uuid
           AND booking_id IS NULL
           AND actor_user_id = v_user
           AND created_at > now() - INTERVAL '10 seconds';

        SELECT cp.full_name, cp.phone INTO v_cust_name, v_cust_phone
          FROM public.customer_profiles cp WHERE cp.user_id = v_user LIMIT 1;
        SELECT concat_ws(', ', address_line, area, pincode) INTO v_addr
          FROM public.customer_addresses WHERE id = p_address_id;
        SELECT concat_ws(' ', make, model, NULLIF(registration_number, '')) INTO v_veh_label
          FROM public.customer_vehicles WHERE id = p_vehicle_id AND user_id = v_user;

        INSERT INTO public.service_leads(
          booking_id,user_id,customer_name,customer_phone,vehicle_id,vehicle_label,
          address_id,address_text,service_id,service_slug,service_name,service_category,
          price,payment_status,scheduled_date,scheduled_time,status,metadata
        ) VALUES (
          v_booking, v_user, v_cust_name, v_cust_phone,
          p_vehicle_id, v_veh_label, p_address_id, v_addr,
          p_service_id, v_service.slug, v_service.name, COALESCE(v_service.category, v_service.service_type),
          0, 'included', p_scheduled_date, COALESCE(p_scheduled_time, v_address.label),
          'new', jsonb_build_object('source', 'entitlement', 'vehicle_id', p_vehicle_id, 'entitlement', v_consume, 'benefit_type', v_benefit)
        ) ON CONFLICT DO NOTHING
        RETURNING id INTO v_lead;

        INSERT INTO public.admin_alerts(kind,title,body,severity,meta)
        VALUES('included_booking', 'Included service booked: ' || v_service.name,
               COALESCE(v_cust_name, 'Customer') || ' booked included ' || v_service.name || ' for ' || COALESCE(v_veh_label, 'vehicle') || ' (₹0)',
               'info', jsonb_build_object('lead_id', v_lead, 'booking_id', v_booking, 'vehicle_id', p_vehicle_id, 'benefit_type', v_benefit, 'entitlement', v_consume));

        INSERT INTO public.customer_notifications(user_id,type,title,body,link,metadata,vehicle_id,category)
        VALUES(v_user, 'booking_confirmed', 'Included service booked',
               'Included in your Daily Shine Plan. No payment is needed.',
               '/c/bookings/' || v_booking,
               jsonb_build_object('booking_id', v_booking, 'lead_id', v_lead, 'vehicle_id', p_vehicle_id, 'benefit_type', v_benefit, 'entitlement', v_consume),
               p_vehicle_id,
               'subscription');

        RETURN v_booking;
      END IF;

      v_addon_price := public.addon_price_for_benefit(v_benefit, v_vehicle.category);
      IF v_addon_price IS NOT NULL THEN
        v_base := v_addon_price;
      END IF;
    END IF;
  END IF;

  IF v_base = 0 THEN
    v_base := CASE WHEN v_vehicle.category = 'sedan_suv' THEN v_service.price_sedan_suv ELSE v_service.price_hatchback END;
  END IF;

  IF v_service.service_type = 'subscription' OR v_service.category = 'subscription' THEN
    IF v_benefit IS NULL THEN
      SELECT id INTO v_dup_sub_id
      FROM public.subscriptions
      WHERE vehicle_id = p_vehicle_id
        AND status IN ('active','awaiting_partner_assignment','assigned')
      LIMIT 1;

      IF v_dup_sub_id IS NOT NULL THEN
        INSERT INTO public.subscription_block_log(
          user_id, vehicle_id, service_id, existing_subscription_id, source, reason, meta
        ) VALUES (
          v_user, p_vehicle_id, p_service_id, v_dup_sub_id, 'rpc',
          'duplicate_active_subscription',
          jsonb_build_object('service_slug', v_service.slug, 'scheduled_date', p_scheduled_date)
        );
        RAISE EXCEPTION 'This vehicle already has an active Daily Shine subscription.'
          USING ERRCODE = 'P0DUP';
      END IF;
    END IF;
  END IF;

  IF jsonb_typeof(p_addons) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(p_addons) AS e LOOP
      v_qty := LEAST(20, GREATEST(1, COALESCE((item.value->>'quantity')::int, 1)));
      SELECT * INTO addon_rec
      FROM public.service_addons
      WHERE id = (item.value->>'id')::uuid
        AND active = true
        AND (
          applies_to_slugs IS NULL
          OR cardinality(applies_to_slugs) = 0
          OR v_service.slug = ANY(applies_to_slugs)
        );
      IF FOUND THEN
        v_unit := CASE WHEN v_vehicle.category = 'sedan_suv' THEN addon_rec.price_sedan_suv ELSE addon_rec.price_hatchback END;
        v_addon := v_addon + (v_qty * v_unit);
      END IF;
    END LOOP;
  END IF;

  IF v_coupon IS NOT NULL THEN
    IF v_coupon = 'EXTRA10' THEN v_min_vehicles := 2;
    ELSIF v_coupon = 'EXTRA15' THEN v_min_vehicles := 3;
    ELSIF v_coupon = 'MULTI20' THEN v_min_vehicles := 4;
    ELSE RAISE EXCEPTION 'Invalid coupon';
    END IF;

    SELECT percent INTO v_percent FROM public.multi_vehicle_discounts WHERE vehicle_count = v_min_vehicles AND active = true;
    IF v_percent IS NULL THEN RAISE EXCEPTION 'Invalid coupon'; END IF;

    SELECT count(*) INTO v_vehicle_count FROM public.customer_vehicles WHERE user_id = v_user;
    IF v_vehicle_count < v_min_vehicles THEN RAISE EXCEPTION 'Coupon requires at least % vehicles on your account', v_min_vehicles; END IF;

    SELECT id INTO v_first_vehicle_id FROM public.customer_vehicles WHERE user_id = v_user ORDER BY created_at ASC, id ASC LIMIT 1;
    v_is_first_vehicle := (v_first_vehicle_id = p_vehicle_id);
    v_discount_approved := COALESCE(v_vehicle.discount_approved, false);
    IF v_is_first_vehicle AND NOT v_discount_approved THEN
      RAISE EXCEPTION 'Coupon applies only to an additional vehicle, not your first vehicle.';
    END IF;
    v_discount := round(((v_base + v_addon) * v_percent) / 100.0, 2);
  END IF;

  v_total := GREATEST(0, v_base + v_addon - v_discount);

  INSERT INTO public.bookings(
    user_id, service_id, vehicle_id, address_id, scheduled_date, scheduled_time,
    preferred_before_time, notes, coupon_code, base_amount, addon_amount, discount_amount, total_amount,
    status, payment_status
  ) VALUES (
    v_user, p_service_id, p_vehicle_id, p_address_id, p_scheduled_date, p_scheduled_time,
    p_scheduled_time, nullif(trim(coalesce(p_notes, '')), ''), v_coupon, v_base, v_addon, v_discount, v_total,
    CASE WHEN v_total = 0 THEN 'paid' ELSE 'pending_payment' END,
    CASE WHEN v_total = 0 THEN 'paid' ELSE 'pending' END
  ) RETURNING id INTO v_booking;

  IF jsonb_typeof(p_addons) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(p_addons) AS e LOOP
      v_qty := LEAST(20, GREATEST(1, COALESCE((item.value->>'quantity')::int, 1)));
      SELECT * INTO addon_rec
      FROM public.service_addons
      WHERE id = (item.value->>'id')::uuid
        AND active = true
        AND (
          applies_to_slugs IS NULL
          OR cardinality(applies_to_slugs) = 0
          OR v_service.slug = ANY(applies_to_slugs)
        );
      IF FOUND THEN
        v_unit := CASE WHEN v_vehicle.category = 'sedan_suv' THEN addon_rec.price_sedan_suv ELSE addon_rec.price_hatchback END;
        INSERT INTO public.booking_addons(booking_id, addon_key, addon_name, price, quantity)
        VALUES (v_booking, addon_rec.id::text, addon_rec.name, v_unit, v_qty);
      END IF;
    END LOOP;
  END IF;

  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_customer_booking(uuid, uuid, uuid, date, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_customer_booking(uuid, uuid, uuid, date, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_customer_booking(uuid, uuid, uuid, date, text, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.create_addon_request(
  p_subscription_id uuid, p_service_id uuid, p_preferred_date date,
  p_preferred_time text, p_notes text, p_vehicle_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_id uuid;
  v_user uuid := auth.uid();
  v_sub record;
  v_svc record;
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

  v_preview := public.preview_customer_booking(p_service_id, v_veh_id, NULL, p_preferred_date, p_preferred_time, '[]'::jsonb, NULL);
  v_payable := COALESCE((v_preview->>'payable')::numeric, 0);
  v_benefit := public.service_slug_to_benefit(v_svc.slug);

  IF v_benefit IS NOT NULL AND COALESCE((v_preview->>'used_entitlement')::boolean, false) THEN
    v_consume := public.try_consume_entitlement(v_veh_id, v_benefit, NULL, NULL, 'addon_request');
    v_paid := NOT COALESCE((v_consume->>'consumed')::boolean, false);
    IF v_paid THEN
      v_preview := public.preview_customer_booking(p_service_id, v_veh_id, NULL, p_preferred_date, p_preferred_time, '[]'::jsonb, NULL);
      v_payable := COALESCE((v_preview->>'payable')::numeric, v_payable);
    ELSE
      v_payable := 0;
    END IF;
  ELSE
    v_paid := v_payable > 0;
  END IF;

  v_meta := jsonb_build_object('entitlement', v_consume, 'paid', v_paid, 'payable', v_payable, 'benefit_type', v_benefit, 'preview', v_preview);

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
    jsonb_build_object('addon_request_id', v_id, 'subscription_id', p_subscription_id,
      'vehicle_id', v_veh_id, 'service_id', p_service_id, 'paid', v_paid, 'payable', v_payable,
      'benefit_type', v_benefit, 'entitlement', v_consume, 'preview', v_preview));

  RETURN jsonb_build_object('addon_request_id', v_id, 'paid', v_paid, 'payable', v_payable,
    'used_entitlement', NOT v_paid, 'benefit_type', v_benefit, 'entitlement', v_consume,
    'remaining_after_booking', v_preview->'remaining_after_booking', 'preview', v_preview);
END $$;

REVOKE ALL ON FUNCTION public.create_addon_request(uuid, uuid, date, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_addon_request(uuid, uuid, date, text, text, uuid) TO authenticated, service_role;