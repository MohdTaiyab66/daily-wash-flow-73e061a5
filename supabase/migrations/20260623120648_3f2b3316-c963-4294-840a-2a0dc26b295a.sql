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
  v_customer_name text := 'Customer';
  v_customer_phone text := '0000000000';
  v_customer_email text := null;
  v_make text := 'Vehicle';
  v_model text := 'Car';
  v_registration text;
  v_color text := null;
  v_parking_notes text := null;
  v_image_path text := null;
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

  IF FOUND THEN
    v_customer_name := COALESCE(NULLIF(v_profile.full_name, ''), v_customer_name);
    v_customer_phone := COALESCE(NULLIF(v_profile.phone, ''), v_customer_phone);
    v_customer_email := v_profile.email;
  END IF;

  SELECT * INTO v_customer_vehicle
  FROM public.customer_vehicles
  WHERE id = v_booking.vehicle_id
  LIMIT 1;

  IF FOUND THEN
    v_make := COALESCE(NULLIF(v_customer_vehicle.make, ''), v_make);
    v_model := COALESCE(NULLIF(v_customer_vehicle.model, ''), v_model);
    v_registration := NULLIF(v_customer_vehicle.registration_number, '');
    v_color := v_customer_vehicle.color;
    v_parking_notes := COALESCE(v_customer_vehicle.parking_notes, v_booking.parking_notes);
    v_image_path := v_customer_vehicle.image_path;
  END IF;

  INSERT INTO public.customers (
    full_name, phone, email, address_line, area, pincode, latitude, longitude,
    subscription_plan, subscription_start, subscription_end, is_active,
    preferred_time, service_required_before, payment_status
  ) VALUES (
    v_customer_name,
    v_customer_phone,
    v_customer_email,
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
    v_make,
    v_model,
    COALESCE(v_registration, 'PENDING-' || left(v_customer_id::text, 8)),
    v_color,
    v_parking_notes,
    v_image_path,
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

CREATE OR REPLACE FUNCTION public.sync_booking_from_service_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed'::public.service_status AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.bookings
    SET status = 'completed',
        payment_status = CASE WHEN payment_status = 'pending' THEN 'paid' ELSE payment_status END,
        updated_at = now()
    WHERE ops_service_id = NEW.id;
  ELSIF NEW.status = 'unavailable'::public.service_status AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.bookings
    SET updated_at = now()
    WHERE ops_service_id = NEW.id;
  ELSIF NEW.status = 'in_progress'::public.service_status AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.bookings
    SET status = 'active',
        updated_at = now()
    WHERE ops_service_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_booking_from_service_status ON public.services;
CREATE TRIGGER trg_sync_booking_from_service_status
AFTER UPDATE OF status ON public.services
FOR EACH ROW
EXECUTE FUNCTION public.sync_booking_from_service_status();