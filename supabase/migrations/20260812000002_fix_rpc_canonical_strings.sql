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
AS $function$
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
  item record;
  addon_rec record;
  v_qty int;
  v_unit numeric;
  v_dup_sub_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Please sign in again';
  END IF;

  IF p_scheduled_date IS NULL OR p_scheduled_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Choose a valid service date';
  END IF;

  SELECT * INTO v_service
  FROM public.service_catalog
  WHERE id = p_service_id AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service is not available';
  END IF;

  SELECT * INTO v_vehicle
  FROM public.customer_vehicles
  WHERE id = p_vehicle_id AND user_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  SELECT * INTO v_address
  FROM public.customer_addresses
  WHERE id = p_address_id AND user_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Address not found';
  END IF;

  -- Vehicle-scoped one-active-subscription rule.
  -- Only block if there is a subscription linked to a SUCCESSFULLY PAID booking.
  SELECT s.id INTO v_dup_sub_id
  FROM public.subscriptions s
  JOIN public.bookings b ON b.id = s.booking_id
  WHERE s.vehicle_id = p_vehicle_id
    AND s.status IN ('active','awaiting_partner_assignment','assigned')
    AND b.payment_status = 'paid'
  LIMIT 1;

  IF v_dup_sub_id IS NOT NULL THEN
    RAISE EXCEPTION 'This vehicle already has an active Daily Shine subscription.'
      USING ERRCODE = 'P0DUP';
  END IF;

  v_base := CASE WHEN v_vehicle.category = 'sedan_suv'
                 THEN v_service.price_sedan_suv ELSE v_service.price_hatchback END;

  IF jsonb_typeof(p_addons) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(p_addons) AS e LOOP
      v_qty := LEAST(20, GREATEST(1, COALESCE((item.value->>'quantity')::int, 1)));
      SELECT * INTO addon_rec FROM public.service_addons
      WHERE id = (item.value->>'id')::uuid AND active = true;
      IF FOUND THEN
        v_unit := CASE WHEN v_vehicle.category = 'sedan_suv'
                       THEN addon_rec.price_sedan_suv ELSE addon_rec.price_hatchback END;
        v_addon := v_addon + (v_qty * v_unit);
      END IF;
    END LOOP;
  END IF;

  v_total := GREATEST(0, v_base + v_addon - v_discount);

  -- CANONICAL STATES: status='pending_payment', payment_status='pending'
  INSERT INTO public.bookings(
    user_id, service_id, vehicle_id, address_id, scheduled_date, scheduled_time,
    preferred_before_time, notes, coupon_code, base_amount, addon_amount, discount_amount, total_amount,
    status, payment_status
  ) VALUES (
    v_user, p_service_id, p_vehicle_id, p_address_id, p_scheduled_date, p_scheduled_time,
    p_scheduled_time, nullif(trim(coalesce(p_notes, '')), ''), v_coupon, v_base, v_addon, v_discount, v_total,
    'pending_payment', 'pending'
  ) RETURNING id INTO v_booking;

  IF jsonb_typeof(p_addons) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(p_addons) AS e LOOP
      v_qty := LEAST(20, GREATEST(1, COALESCE((item.value->>'quantity')::int, 1)));
      SELECT * INTO addon_rec FROM public.service_addons
      WHERE id = (item.value->>'id')::uuid AND active = true;
      IF FOUND THEN
        v_unit := CASE WHEN v_vehicle.category = 'sedan_suv'
                       THEN addon_rec.price_sedan_suv ELSE addon_rec.price_hatchback END;
        INSERT INTO public.booking_addons(booking_id, addon_key, addon_name, price, quantity)
        VALUES (v_booking, addon_rec.id::text, addon_rec.name, v_unit, v_qty);
      END IF;
    END LOOP;
  END IF;

  RETURN v_booking;
END;
$function$;
