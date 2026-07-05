-- Restore missing coupon storage on bookings.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS coupon_code text;

-- Optional per-vehicle admin override for allowing a first-vehicle discount.
ALTER TABLE public.customer_vehicles
  ADD COLUMN IF NOT EXISTS discount_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discount_approved_by uuid,
  ADD COLUMN IF NOT EXISTS discount_approved_at timestamptz;

-- Keep API permissions explicit for the affected existing tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_addons TO authenticated;
GRANT ALL ON public.booking_addons TO service_role;
GRANT SELECT ON public.service_addons TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_addons TO authenticated;
GRANT ALL ON public.service_addons TO service_role;
GRANT SELECT ON public.multi_vehicle_discounts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.multi_vehicle_discounts TO authenticated;
GRANT ALL ON public.multi_vehicle_discounts TO service_role;

-- Seed the customer-facing multi-car discount ladder used by checkout.
INSERT INTO public.multi_vehicle_discounts (vehicle_count, percent, active)
VALUES (2, 10, true), (3, 15, true), (4, 20, true)
ON CONFLICT (vehicle_count) DO UPDATE SET
  percent = EXCLUDED.percent,
  active = true,
  updated_at = now();

-- Main booking RPC: fixes missing coupon_code insert, add-on persistence,
-- add-on compatibility, and server-side first-vehicle discount enforcement.
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
  v_has_active_sub boolean;
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

  -- Daily Shine inclusions go through subscription_addon_requests, not premium booking.
  IF v_service.slug IN ('daily-shine-interior','daily-shine-exterior','daily-shine-dusting') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.subscriptions WHERE user_id = v_user AND status = 'active'
    ) INTO v_has_active_sub;
    IF v_has_active_sub THEN
      RAISE EXCEPTION 'Use My Plan → Schedule wash for included services (no premium charge).'
        USING ERRCODE = 'P0202', HINT = 'Call create_addon_request instead.';
    END IF;
  END IF;

  -- Vehicle-scoped one-active-subscription rule.
  IF v_service.service_type = 'subscription' OR v_service.category = 'subscription' THEN
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

  v_base := CASE WHEN v_vehicle.category = 'sedan_suv'
                 THEN v_service.price_sedan_suv ELSE v_service.price_hatchback END;

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
        v_unit := CASE WHEN v_vehicle.category = 'sedan_suv'
                       THEN addon_rec.price_sedan_suv ELSE addon_rec.price_hatchback END;
        v_addon := v_addon + (v_qty * v_unit);
      END IF;
    END LOOP;
  END IF;

  IF v_coupon IS NOT NULL THEN
    IF v_coupon = 'EXTRA10' THEN
      v_min_vehicles := 2;
    ELSIF v_coupon = 'EXTRA15' THEN
      v_min_vehicles := 3;
    ELSIF v_coupon = 'MULTI20' THEN
      v_min_vehicles := 4;
    ELSE
      RAISE EXCEPTION 'Invalid coupon';
    END IF;

    SELECT percent INTO v_percent
    FROM public.multi_vehicle_discounts
    WHERE vehicle_count = v_min_vehicles AND active = true;
    IF v_percent IS NULL THEN
      RAISE EXCEPTION 'Invalid coupon';
    END IF;

    SELECT count(*) INTO v_vehicle_count
    FROM public.customer_vehicles
    WHERE user_id = v_user;

    IF v_vehicle_count < v_min_vehicles THEN
      RAISE EXCEPTION 'Coupon requires at least % vehicles on your account', v_min_vehicles;
    END IF;

    SELECT id INTO v_first_vehicle_id
    FROM public.customer_vehicles
    WHERE user_id = v_user
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

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
    'pending_payment', 'pending'
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

REVOKE ALL ON FUNCTION public.confirm_customer_booking(uuid, uuid, uuid, date, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_customer_booking(uuid, uuid, uuid, date, text, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_customer_booking(uuid, uuid, uuid, date, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_customer_booking(uuid, uuid, uuid, date, text, text, text, jsonb) TO service_role;

-- Admin-only helper to approve/remove first-vehicle discount exceptions.
CREATE OR REPLACE FUNCTION public.admin_set_vehicle_discount_approval(
  p_vehicle_id uuid,
  p_approved boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.customer_vehicles
  SET discount_approved = COALESCE(p_approved, false),
      discount_approved_by = CASE WHEN COALESCE(p_approved, false) THEN v_admin ELSE NULL END,
      discount_approved_at = CASE WHEN COALESCE(p_approved, false) THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = p_vehicle_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found';
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_vehicle_discount_approval(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_vehicle_discount_approval(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_vehicle_discount_approval(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_vehicle_discount_approval(uuid, boolean) TO service_role;