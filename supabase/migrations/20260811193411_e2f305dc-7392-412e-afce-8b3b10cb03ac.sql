-- Fix duplicate subscription check in confirm_customer_booking
-- Only block if the existing subscription is tied to a PAID booking.
-- Also clean up any stale subscriptions that are awaiting partner assignment but haven't been paid.

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
      -- CRITICAL FIX: Only block if the subscription is tied to a PAID booking.
      SELECT s.id INTO v_dup_sub_id
      FROM public.subscriptions s
      JOIN public.bookings b ON b.id = s.booking_id
      WHERE s.vehicle_id = p_vehicle_id
        AND s.status IN ('active','awaiting_partner_assignment','assigned')
        AND b.payment_status = 'paid'
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

  INSERT INTO public.bookings(
    user_id, service_id, vehicle_id, address_id, scheduled_date, scheduled_time,
    preferred_before_time, notes, coupon_code, base_amount, addon_amount, discount_amount, total_amount,
    status, payment_status
  ) VALUES (
    v_user, p_service_id, p_vehicle_id, p_address_id, p_scheduled_date, p_scheduled_time,
    p_scheduled_time, nullif(trim(coalesce(p_notes, '')), ''), v_coupon, v_base, v_addon, v_discount, v_base + v_addon - v_discount,
    'pending', 'unpaid'
  ) RETURNING id INTO v_booking;

  RETURN v_booking;
END;
$$;

-- CLEANUP STALE SUBSCRIPTIONS
-- Any subscription awaiting assignment but whose booking is still unpaid is invalid.
UPDATE public.subscriptions s
SET status = 'cancelled',
    updated_at = now()
FROM public.bookings b
WHERE s.booking_id = b.id
  AND s.status = 'awaiting_partner_assignment'
  AND b.payment_status = 'unpaid'
  AND b.created_at < now() - INTERVAL '30 minutes';
