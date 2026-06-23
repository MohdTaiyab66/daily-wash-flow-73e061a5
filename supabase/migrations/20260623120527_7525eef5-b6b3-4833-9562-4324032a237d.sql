ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ops_service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_bookings_partner_id ON public.bookings(partner_id);
CREATE INDEX IF NOT EXISTS idx_bookings_ops_service_id ON public.bookings(ops_service_id);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_area_status ON public.bookings(scheduled_date, status);

CREATE OR REPLACE FUNCTION public.ensure_staff_login_role(p_role public.app_role, p_full_name text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_phone text;
  v_expected_domain text;
  v_has_existing_admin boolean := false;
  v_has_same_phone_admin boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT lower(email), COALESCE(raw_user_meta_data->>'phone', regexp_replace(split_part(email, '@', 1), '\D', '', 'g'))
  INTO v_email, v_phone
  FROM auth.users
  WHERE id = v_uid;

  IF p_role = 'admin'::public.app_role THEN
    v_expected_domain := '@admin.urbanwash.app';
  ELSIF p_role = 'partner'::public.app_role THEN
    v_expected_domain := '@partner.urbanwash.app';
  ELSE
    RETURN false;
  END IF;

  IF v_email IS NULL OR right(v_email, length(v_expected_domain)) <> v_expected_domain THEN
    RETURN false;
  END IF;

  IF p_role = 'admin'::public.app_role THEN
    SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin'::public.app_role)
    INTO v_has_existing_admin;

    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN auth.users au ON au.id = ur.user_id
      WHERE ur.role = 'admin'::public.app_role
        AND COALESCE(au.raw_user_meta_data->>'phone', regexp_replace(split_part(au.email, '@', 1), '\D', '', 'g')) = v_phone
    ) INTO v_has_same_phone_admin;

    IF NOT v_has_existing_admin OR v_has_same_phone_admin THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (v_uid, 'admin'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
      RETURN true;
    END IF;

    RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role = 'admin'::public.app_role);
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'partner'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  PERFORM set_config('app.bypass_partner_guard', 'on', true);
  INSERT INTO public.partners (id, full_name, phone, email, status)
  VALUES (v_uid, NULLIF(trim(COALESCE(p_full_name, '')), ''), v_phone, v_email, 'active'::public.partner_status)
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(NULLIF(trim(COALESCE(EXCLUDED.full_name, '')), ''), public.partners.full_name),
    phone = COALESCE(EXCLUDED.phone, public.partners.phone),
    email = COALESCE(EXCLUDED.email, public.partners.email),
    status = CASE WHEN public.partners.status = 'suspended'::public.partner_status THEN public.partners.status ELSE 'active'::public.partner_status END,
    updated_at = now();
  PERFORM set_config('app.bypass_partner_guard', 'off', true);

  RETURN true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ensure_staff_login_role(public.app_role, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_staff_login_role(public.app_role, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_partners_new_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled boolean := true;
  v_area text;
BEGIN
  SELECT COALESCE((value::text)::boolean, true) INTO v_enabled
  FROM public.platform_settings WHERE key = 'auto_notify_partners_on_new_customer';
  IF NOT COALESCE(v_enabled, true) THEN RETURN NEW; END IF;

  v_area := trim(NEW.area);
  IF v_area IS NULL OR length(v_area) = 0 THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' AND lower(coalesce(trim(OLD.area), '')) = lower(v_area) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.partner_notifications (partner_id, type, title, body, link, metadata)
  SELECT p.id,
         'new_customers',
         'New customers available',
         'A new customer is now available in ' || v_area || '. Build your assignment now.',
         '/app/assignments',
         jsonb_build_object('customer_id', NEW.id, 'area', v_area)
  FROM public.partners p
  WHERE p.status IN ('active'::public.partner_status, 'pending_verification'::public.partner_status)
    AND COALESCE(p.notify_when_customers_added, true) = true
    AND lower(trim(p.home_area)) = lower(trim(v_area));

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_partners_new_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_area text;
  v_service_name text;
  v_vehicle text;
BEGIN
  SELECT ca.area, sc.name, concat_ws(' ', cv.make, cv.model)
    INTO v_area, v_service_name, v_vehicle
  FROM public.customer_addresses ca
  JOIN public.service_catalog sc ON sc.id = NEW.service_id
  LEFT JOIN public.customer_vehicles cv ON cv.id = NEW.vehicle_id
  WHERE ca.id = NEW.address_id;

  IF v_area IS NULL OR length(trim(v_area)) = 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.partner_notifications (partner_id, type, title, body, link, metadata)
  SELECT p.id,
         'new_booking',
         'New booking in ' || v_area,
         coalesce(v_service_name, 'Car care service') || ' for ' || coalesce(nullif(v_vehicle, ''), 'customer vehicle') || ' on ' || NEW.scheduled_date::text || coalesce(' · ' || nullif(NEW.preferred_before_time, ''), ''),
         '/app/assignments',
         jsonb_build_object('booking_id', NEW.id, 'area', v_area, 'service_id', NEW.service_id, 'scheduled_date', NEW.scheduled_date)
  FROM public.partners p
  WHERE p.status IN ('active'::public.partner_status, 'pending_verification'::public.partner_status)
    AND COALESCE(p.notify_when_customers_added, true) = true
    AND lower(trim(p.home_area)) = lower(trim(v_area));

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_partner_booking_requests()
RETURNS TABLE(
  booking_id uuid,
  service_name text,
  scheduled_date date,
  scheduled_time text,
  total_amount numeric,
  area text,
  address_line text,
  vehicle_label text,
  registration_number text,
  customer_name text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.id,
    sc.name,
    b.scheduled_date,
    COALESCE(b.scheduled_time, b.preferred_before_time),
    b.total_amount,
    ca.area,
    ca.address_line,
    concat_ws(' ', cv.make, cv.model),
    cv.registration_number,
    COALESCE(cp.full_name, 'Customer'),
    b.created_at
  FROM public.bookings b
  JOIN public.customer_addresses ca ON ca.id = b.address_id
  JOIN public.service_catalog sc ON sc.id = b.service_id
  LEFT JOIN public.customer_vehicles cv ON cv.id = b.vehicle_id
  LEFT JOIN public.customer_profiles cp ON cp.user_id = b.user_id
  JOIN public.partners p ON p.id = auth.uid()
  WHERE b.ops_service_id IS NULL
    AND b.status IN ('pending_payment', 'paid')
    AND b.scheduled_date >= CURRENT_DATE
    AND lower(trim(ca.area)) = lower(trim(p.home_area))
    AND p.status IN ('active'::public.partner_status, 'pending_verification'::public.partner_status)
  ORDER BY b.scheduled_date ASC, b.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.list_partner_booking_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_partner_booking_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_customer_booking(p_booking_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_partner_area text;
  v_booking record;
  v_profile record;
  v_customer_vehicle record;
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_service_id uuid;
  v_rate numeric := 17;
BEGIN
  IF v_partner IS NULL THEN
    RAISE EXCEPTION 'Please sign in again';
  END IF;

  SELECT home_area INTO v_partner_area
  FROM public.partners
  WHERE id = v_partner
    AND status IN ('active'::public.partner_status, 'pending_verification'::public.partner_status);

  IF v_partner_area IS NULL OR length(trim(v_partner_area)) = 0 THEN
    RAISE EXCEPTION 'Choose your work area before accepting bookings';
  END IF;

  SELECT b.*, ca.address_line, ca.area, ca.pincode, ca.latitude, ca.longitude, ca.parking_notes, sc.name AS service_name
    INTO v_booking
  FROM public.bookings b
  JOIN public.customer_addresses ca ON ca.id = b.address_id
  JOIN public.service_catalog sc ON sc.id = b.service_id
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.ops_service_id IS NOT NULL OR v_booking.status NOT IN ('pending_payment', 'paid') THEN
    RAISE EXCEPTION 'This booking is already assigned';
  END IF;

  IF lower(trim(v_booking.area)) <> lower(trim(v_partner_area)) THEN
    RAISE EXCEPTION 'This booking belongs to another area';
  END IF;

  SELECT * INTO v_profile
  FROM public.customer_profiles
  WHERE user_id = v_booking.user_id
  LIMIT 1;

  SELECT * INTO v_customer_vehicle
  FROM public.customer_vehicles
  WHERE id = v_booking.vehicle_id
  LIMIT 1;

  INSERT INTO public.customers (
    full_name, phone, email, address_line, area, pincode, latitude, longitude,
    subscription_plan, subscription_start, subscription_end, is_active,
    preferred_time, service_required_before, payment_status
  ) VALUES (
    COALESCE(NULLIF(v_profile.full_name, ''), 'Customer'),
    COALESCE(NULLIF(v_profile.phone, ''), '0000000000'),
    v_profile.email,
    v_booking.address_line,
    v_booking.area,
    v_booking.pincode,
    v_booking.latitude,
    v_booking.longitude,
    'daily_shine_monthly'::public.subscription_plan,
    CURRENT_DATE,
    GREATEST(COALESCE(v_booking.scheduled_date, CURRENT_DATE), CURRENT_DATE) + 30,
    true,
    COALESCE(v_booking.scheduled_time, v_booking.preferred_before_time, '06:00 - 09:00'),
    COALESCE(v_booking.scheduled_time, v_booking.preferred_before_time),
    CASE WHEN v_booking.payment_status = 'paid' THEN 'paid' ELSE 'pending' END
  ) RETURNING id INTO v_customer_id;

  INSERT INTO public.vehicles (customer_id, make, model, registration_number, color, parking_notes, front_image_path, package_amount)
  VALUES (
    v_customer_id,
    COALESCE(NULLIF(v_customer_vehicle.make, ''), 'Vehicle'),
    COALESCE(NULLIF(v_customer_vehicle.model, ''), 'Car'),
    COALESCE(NULLIF(v_customer_vehicle.registration_number, ''), 'PENDING-' || left(v_customer_id::text, 8)),
    v_customer_vehicle.color,
    COALESCE(v_customer_vehicle.parking_notes, v_booking.parking_notes),
    v_customer_vehicle.image_path,
    v_booking.total_amount::integer
  ) RETURNING id INTO v_vehicle_id;

  SELECT COALESCE((value::text)::numeric, 17) INTO v_rate
  FROM public.platform_settings
  WHERE key = 'rate_per_car';
  v_rate := COALESCE(v_rate, 17);

  INSERT INTO public.services (
    partner_id, customer_id, vehicle_id, scheduled_date, time_slot, sequence_no, rate_per_car, status
  ) VALUES (
    v_partner,
    v_customer_id,
    v_vehicle_id,
    COALESCE(v_booking.scheduled_date, CURRENT_DATE),
    COALESCE(v_booking.scheduled_time, v_booking.preferred_before_time, '06:00 - 09:00'),
    COALESCE((SELECT max(sequence_no) + 1 FROM public.services WHERE partner_id = v_partner AND scheduled_date = COALESCE(v_booking.scheduled_date, CURRENT_DATE)), 1),
    v_rate,
    'pending'::public.service_status
  ) RETURNING id INTO v_service_id;

  UPDATE public.bookings
  SET partner_id = v_partner,
      ops_service_id = v_service_id,
      claimed_at = now(),
      status = 'active',
      updated_at = now()
  WHERE id = p_booking_id;

  INSERT INTO public.partner_notifications (partner_id, type, title, body, link, metadata)
  VALUES (
    v_partner,
    'booking_claimed',
    'Booking added to your route',
    COALESCE(v_booking.service_name, 'Customer service') || ' is now visible in Today''s route.',
    '/app/live',
    jsonb_build_object('booking_id', p_booking_id, 'service_id', v_service_id)
  );

  RETURN v_service_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_customer_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_customer_booking(uuid) TO authenticated;