-- P0-02: Block premium-priced bookings for Daily Shine plan services.
-- These must route through subscription_addon_requests (admin-managed), never confirm_customer_booking.
CREATE OR REPLACE FUNCTION public.confirm_customer_booking(
  p_service_id uuid, p_vehicle_id uuid, p_address_id uuid,
  p_scheduled_date date, p_scheduled_time text,
  p_notes text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text,
  p_addons jsonb DEFAULT '[]'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_service record; v_vehicle record; v_address record;
  v_base numeric := 0; v_addon numeric := 0; v_discount numeric := 0; v_total numeric := 0;
  v_booking uuid;
  v_coupon text := upper(nullif(trim(coalesce(p_coupon_code, '')), ''));
  v_percent int := 0; v_min_vehicles int := 0; v_vehicle_count int := 0;
  item record; addon_rec record; v_qty int;
  v_has_active_sub boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Please sign in again'; END IF;
  IF p_scheduled_date IS NULL OR p_scheduled_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Choose a valid service date';
  END IF;
  SELECT * INTO v_service FROM public.service_catalog WHERE id = p_service_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service is not available'; END IF;

  -- P0-02 guard: Daily Shine plan services must go through subscription_addon_requests
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

  v_base := CASE WHEN v_vehicle.category = 'sedan_suv' THEN v_service.price_sedan_suv ELSE v_service.price_hatchback END;

  IF p_addons IS NULL OR jsonb_typeof(p_addons) IS NULL THEN p_addons := '[]'::jsonb; END IF;
  IF jsonb_typeof(p_addons) <> 'array' THEN RAISE EXCEPTION 'Invalid add-ons'; END IF;

  FOR item IN SELECT * FROM jsonb_to_recordset(p_addons) AS x(id uuid, quantity int) LOOP
    v_qty := LEAST(GREATEST(COALESCE(item.quantity, 0), 0), 20);
    IF v_qty = 0 THEN CONTINUE; END IF;
    SELECT * INTO addon_rec FROM public.service_addons
      WHERE id = item.id AND active = true
        AND (cardinality(applies_to_slugs) = 0 OR v_service.slug = ANY(applies_to_slugs));
    IF NOT FOUND THEN RAISE EXCEPTION 'One selected add-on is no longer available'; END IF;
    v_addon := v_addon + (CASE WHEN v_vehicle.category = 'sedan_suv' THEN addon_rec.price_sedan_suv ELSE addon_rec.price_hatchback END) * v_qty;
  END LOOP;

  IF v_coupon IS NOT NULL THEN
    IF v_coupon = 'EXTRA10' THEN v_percent := 10; v_min_vehicles := 2;
    ELSIF v_coupon = 'EXTRA15' THEN v_percent := 15; v_min_vehicles := 3;
    ELSIF v_coupon = 'MULTI20' THEN v_percent := 20; v_min_vehicles := 4;
    ELSE RAISE EXCEPTION 'Invalid coupon code'; END IF;
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