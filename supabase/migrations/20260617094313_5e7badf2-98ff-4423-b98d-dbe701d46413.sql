INSERT INTO public.platform_settings (key, value, description)
VALUES
  ('min_cars_required', '0'::jsonb, 'Minimum cars required to accept an assignment'),
  ('max_cars_allowed', '30'::jsonb, 'Maximum cars selectable by partner')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.preview_assignment(p_cars integer, p_duration integer)
RETURNS TABLE(
  cars integer,
  duration_days integer,
  working_days integer,
  daily_earnings numeric,
  total_earnings numeric,
  estimated_radius_km numeric,
  estimated_hours numeric,
  expected_start_time text,
  expected_end_time text,
  available_customers integer,
  message text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lat numeric; v_lng numeric; v_home_area text;
  v_found int := 0; v_available int := 0; v_max_d numeric := 0;
  v_days int := 0; d date;
  v_min_cars int := 0; v_max_cars int := 30; v_rate numeric := 17;
  v_min_days int := 7; v_max_days int := 30;
BEGIN
  SELECT COALESCE((value::text)::int, 0) INTO v_min_cars FROM public.platform_settings WHERE key = 'min_cars_required';
  SELECT COALESCE((value::text)::int, 30) INTO v_max_cars FROM public.platform_settings WHERE key = 'max_cars_allowed';
  SELECT COALESCE((value::text)::numeric, 17) INTO v_rate FROM public.platform_settings WHERE key = 'rate_per_car';
  SELECT COALESCE((value::text)::int, 7) INTO v_min_days FROM public.platform_settings WHERE key = 'min_assignment_days';
  SELECT COALESCE((value::text)::int, 30) INTO v_max_days FROM public.platform_settings WHERE key = 'max_assignment_days';

  v_min_cars := GREATEST(COALESCE(v_min_cars, 0), 0);
  v_max_cars := GREATEST(COALESCE(v_max_cars, 30), GREATEST(v_min_cars, 1));
  p_cars := GREATEST(COALESCE(p_cars, GREATEST(v_min_cars, 1)), 1);

  IF p_cars > v_max_cars THEN RAISE EXCEPTION 'Cars must be at most %', v_max_cars; END IF;
  IF p_duration < v_min_days OR p_duration > v_max_days THEN RAISE EXCEPTION 'Duration must be %-% days', v_min_days, v_max_days; END IF;

  SELECT home_lat, home_lng, trim(home_area)
    INTO v_lat, v_lng, v_home_area
  FROM public.partners
  WHERE id = auth.uid();

  FOR d IN SELECT generate_series(CURRENT_DATE, CURRENT_DATE + (p_duration - 1), interval '1 day')::date LOOP
    IF extract(dow FROM d) <> 1 THEN v_days := v_days + 1; END IF;
  END LOOP;

  IF v_home_area IS NULL OR length(v_home_area) = 0 THEN
    RETURN QUERY SELECT 0, p_duration, v_days, 0::numeric, 0::numeric, 0::numeric, 0::numeric, '07:00', '10:00', 0, 'Select your work area first.';
    RETURN;
  END IF;

  IF v_lat IS NULL OR v_lng IS NULL THEN
    SELECT lat, lng INTO v_lat, v_lng
    FROM (VALUES
      ('Indira Nagar', 26.8783::numeric, 80.9989::numeric),
      ('Gomti Nagar', 26.8467::numeric, 81.0023::numeric),
      ('Gomti Nagar Extension', 26.8889::numeric, 81.0234::numeric),
      ('Aliganj', 26.8956::numeric, 80.9456::numeric),
      ('Jankipuram', 26.9234::numeric, 80.9189::numeric),
      ('Hazratganj', 26.8489::numeric, 80.945::numeric),
      ('Vikas Nagar', 26.9012::numeric, 80.9012::numeric),
      ('Ashiyana', 26.7989::numeric, 80.9089::numeric),
      ('Rajajipuram', 26.8312::numeric, 80.8723::numeric),
      ('Alambagh', 26.8089::numeric, 80.8889::numeric),
      ('Mahanagar', 26.8856::numeric, 80.9523::numeric),
      ('Kalyanpur', 26.9089::numeric, 80.9356::numeric),
      ('Khurram Nagar', 26.8978::numeric, 80.9712::numeric)
    ) AS areas(name, lat, lng)
    WHERE lower(name) = lower(v_home_area)
    LIMIT 1;
  END IF;
  IF v_lat IS NULL THEN v_lat := 26.8467; v_lng := 80.9462; END IF;

  WITH available AS (
    SELECT DISTINCT ON (c.id)
      c.id,
      COALESCE(public.haversine_km(v_lat, v_lng, c.latitude, c.longitude), 0) AS d
    FROM public.customers c
    JOIN public.vehicles v ON v.customer_id = c.id
    WHERE c.is_active = true
      AND lower(trim(c.area)) = lower(v_home_area)
      AND NOT EXISTS (
        SELECT 1
        FROM public.assignments a2
        JOIN public.services s2 ON s2.assignment_id = a2.id AND s2.customer_id = c.id
        WHERE a2.status = 'active' AND a2.end_date >= CURRENT_DATE
      )
    ORDER BY c.id, COALESCE(public.haversine_km(v_lat, v_lng, c.latitude, c.longitude), 999999), v.created_at DESC
  )
  SELECT count(*)::int, LEAST(count(*)::int, p_cars), COALESCE(max(d) FILTER (WHERE rn <= p_cars), 0)
    INTO v_available, v_found, v_max_d
  FROM (
    SELECT available.*, row_number() OVER (ORDER BY d ASC) AS rn FROM available
  ) ranked;

  RETURN QUERY SELECT
    v_found,
    p_duration,
    v_days,
    (v_found * v_rate)::numeric,
    (v_found * v_rate * v_days)::numeric,
    round(v_max_d, 1)::numeric,
    GREATEST(round((v_found * 0.15)::numeric, 1), CASE WHEN v_found > 0 THEN 1.0 ELSE 0 END),
    CASE
      WHEN COALESCE(NULLIF(v_found, 0), p_cars) <= 19 THEN '07:00'
      WHEN COALESCE(NULLIF(v_found, 0), p_cars) <= 24 THEN '06:30'
      WHEN COALESCE(NULLIF(v_found, 0), p_cars) <= 29 THEN '06:00'
      ELSE '05:30'
    END,
    '10:00',
    v_available,
    CASE
      WHEN v_available = 0 THEN 'No customers available in this area.'
      WHEN v_available < p_cars THEN 'Only ' || v_available || ' customers available.'
      WHEN v_found < GREATEST(v_min_cars, 1) THEN 'Minimum ' || v_min_cars || ' customers required.'
      ELSE NULL
    END;
END
$$;

CREATE OR REPLACE FUNCTION public.accept_assignment_v2(p_cars integer, p_duration integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_lat numeric; v_lng numeric; v_home_area text; v_first_done boolean;
  v_found int := 0;
  v_assignment uuid; v_existing int;
  v_start date := CURRENT_DATE; v_end date;
  v_start_time text; v_total_d numeric := 0; v_radius numeric := 0;
  r record; work_day date; seq int;
  v_min_new int; v_min_days int; v_max_days int;
  v_min_cars int := 0; v_max_cars int := 30; v_rate numeric := 17;
  v_working_days int := 0;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT COALESCE((value::text)::int, 15) INTO v_min_new FROM public.platform_settings WHERE key = 'min_assignment_days_new';
  SELECT COALESCE((value::text)::int, 7) INTO v_min_days FROM public.platform_settings WHERE key = 'min_assignment_days';
  SELECT COALESCE((value::text)::int, 30) INTO v_max_days FROM public.platform_settings WHERE key = 'max_assignment_days';
  SELECT COALESCE((value::text)::int, 0) INTO v_min_cars FROM public.platform_settings WHERE key = 'min_cars_required';
  SELECT COALESCE((value::text)::int, 30) INTO v_max_cars FROM public.platform_settings WHERE key = 'max_cars_allowed';
  SELECT COALESCE((value::text)::numeric, 17) INTO v_rate FROM public.platform_settings WHERE key = 'rate_per_car';

  v_min_cars := GREATEST(COALESCE(v_min_cars, 0), 0);
  v_max_cars := GREATEST(COALESCE(v_max_cars, 30), GREATEST(v_min_cars, 1));
  p_cars := GREATEST(COALESCE(p_cars, GREATEST(v_min_cars, 1)), 1);

  IF p_cars > v_max_cars THEN RAISE EXCEPTION 'Cars must be at most %', v_max_cars; END IF;

  SELECT home_lat, home_lng, trim(home_area), first_assignment_completed
    INTO v_lat, v_lng, v_home_area, v_first_done
  FROM public.partners
  WHERE id = v_partner;

  IF v_home_area IS NULL OR length(v_home_area) = 0 THEN
    RAISE EXCEPTION 'Please select your work area first';
  END IF;

  IF NOT COALESCE(v_first_done, false) THEN
    IF p_duration < v_min_new THEN RAISE EXCEPTION 'First assignment must be at least % days', v_min_new; END IF;
  ELSE
    IF p_duration < v_min_days OR p_duration > v_max_days THEN RAISE EXCEPTION 'Duration must be %-% days', v_min_days, v_max_days; END IF;
  END IF;

  SELECT count(*) INTO v_existing
  FROM public.assignments
  WHERE partner_id = v_partner AND status = 'active' AND end_date >= CURRENT_DATE;
  IF v_existing > 0 THEN RAISE EXCEPTION 'You already have an active assignment'; END IF;

  IF v_lat IS NULL OR v_lng IS NULL THEN
    SELECT lat, lng INTO v_lat, v_lng
    FROM (VALUES
      ('Indira Nagar', 26.8783::numeric, 80.9989::numeric),
      ('Gomti Nagar', 26.8467::numeric, 81.0023::numeric),
      ('Gomti Nagar Extension', 26.8889::numeric, 81.0234::numeric),
      ('Aliganj', 26.8956::numeric, 80.9456::numeric),
      ('Jankipuram', 26.9234::numeric, 80.9189::numeric),
      ('Hazratganj', 26.8489::numeric, 80.945::numeric),
      ('Vikas Nagar', 26.9012::numeric, 80.9012::numeric),
      ('Ashiyana', 26.7989::numeric, 80.9089::numeric),
      ('Rajajipuram', 26.8312::numeric, 80.8723::numeric),
      ('Alambagh', 26.8089::numeric, 80.8889::numeric),
      ('Mahanagar', 26.8856::numeric, 80.9523::numeric),
      ('Kalyanpur', 26.9089::numeric, 80.9356::numeric),
      ('Khurram Nagar', 26.8978::numeric, 80.9712::numeric)
    ) AS areas(name, lat, lng)
    WHERE lower(name) = lower(v_home_area)
    LIMIT 1;
  END IF;
  IF v_lat IS NULL THEN v_lat := 26.8467; v_lng := 80.9462; END IF;

  v_end := v_start + (p_duration - 1);
  v_start_time := CASE
    WHEN p_cars <= 19 THEN '07:00'
    WHEN p_cars <= 24 THEN '06:30'
    WHEN p_cars <= 29 THEN '06:00'
    ELSE '05:30'
  END;

  CREATE TEMP TABLE tmp_picks (customer_id uuid PRIMARY KEY, vehicle_id uuid, distance_km numeric, area text, preferred_time text) ON COMMIT DROP;

  INSERT INTO tmp_picks
  SELECT customer_id, vehicle_id, distance_km, area, preferred_time
  FROM (
    SELECT DISTINCT ON (c.id)
      c.id AS customer_id,
      v.id AS vehicle_id,
      COALESCE(public.haversine_km(v_lat, v_lng, c.latitude, c.longitude), 999999) AS distance_km,
      c.area,
      c.preferred_time
    FROM public.customers c
    JOIN public.vehicles v ON v.customer_id = c.id
    WHERE c.is_active = true
      AND lower(trim(c.area)) = lower(v_home_area)
      AND NOT EXISTS (
        SELECT 1
        FROM public.assignments a2
        JOIN public.services s2 ON s2.assignment_id = a2.id AND s2.customer_id = c.id
        WHERE a2.status = 'active' AND a2.end_date >= CURRENT_DATE
      )
    ORDER BY c.id, COALESCE(public.haversine_km(v_lat, v_lng, c.latitude, c.longitude), 999999), v.created_at DESC
  ) picked
  ORDER BY distance_km ASC
  LIMIT p_cars;

  SELECT count(*), COALESCE(round(sum(NULLIF(distance_km, 999999))::numeric * 1.4, 1), 0), COALESCE(round(max(NULLIF(distance_km, 999999))::numeric, 1), 0)
    INTO v_found, v_total_d, v_radius
  FROM tmp_picks;

  IF v_found = 0 THEN
    RAISE EXCEPTION 'No customers available in your area (%). Ask admin to import more or use manual assignment.', v_home_area;
  END IF;
  IF v_min_cars > 0 AND v_found < v_min_cars THEN
    RAISE EXCEPTION 'Only % customers available. Minimum required is %.', v_found, v_min_cars;
  END IF;

  SELECT count(*) INTO v_working_days FROM generate_series(v_start, v_end, interval '1 day') g WHERE extract(dow FROM g) <> 1;

  INSERT INTO public.assignments (partner_id, area, target_cars, status, rate_per_car, estimated_earnings, estimated_hours, estimated_distance_km, search_radius_km, scheduled_date, duration_days, start_date, end_date, working_days, expected_start_time, total_earnings)
  VALUES (v_partner, v_home_area, v_found, 'active', v_rate, v_found * v_rate, GREATEST(round((v_found * 0.15)::numeric, 1), 1.0), v_total_d, v_radius, v_start, p_duration, v_start, v_end, v_working_days, v_start_time, v_found * v_rate * v_working_days)
  RETURNING id INTO v_assignment;

  FOR work_day IN SELECT generate_series(v_start, v_end, interval '1 day')::date LOOP
    IF extract(dow FROM work_day) = 1 THEN CONTINUE; END IF;
    seq := 0;
    FOR r IN SELECT tp.* FROM tmp_picks tp ORDER BY tp.preferred_time NULLS LAST, tp.distance_km ASC LOOP
      seq := seq + 1;
      INSERT INTO public.services (partner_id, customer_id, vehicle_id, assignment_id, scheduled_date, time_slot, sequence_no, rate_per_car, status)
      VALUES (v_partner, r.customer_id, r.vehicle_id, v_assignment, work_day, COALESCE(r.preferred_time, '06:00 - 09:00'), seq, v_rate, 'pending');
    END LOOP;
  END LOOP;

  UPDATE public.partners SET cars_selected = v_found, rate_per_car = v_rate, updated_at = now() WHERE id = v_partner;
  RETURN v_assignment;
END
$$;

CREATE OR REPLACE FUNCTION public.submit_service_unavailable(p_service_id uuid, p_reason text, p_notes text, p_photo text, p_lat numeric, p_lng numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_balance numeric;
  v_credit numeric := 12;
  v_updated int;
  v_assignment uuid;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_photo IS NULL OR length(trim(p_photo)) = 0 THEN RAISE EXCEPTION 'Photo required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'Reason required'; END IF;
  SELECT COALESCE((value::text)::numeric, 12) INTO v_credit FROM public.platform_settings WHERE key = 'unavailable_compensation';

  UPDATE public.services SET
    status = 'unavailable',
    unavailable_reason = p_reason::unavailable_reason,
    unavailable_notes = NULLIF(p_notes, ''),
    unavailable_photo = p_photo,
    unavailable_lat = NULLIF(p_lat, 0),
    unavailable_lng = NULLIF(p_lng, 0),
    completed_at = COALESCE(completed_at, now())
  WHERE id = p_service_id
    AND partner_id = v_partner
    AND status IN ('pending', 'in_progress', 'unavailable')
  RETURNING assignment_id INTO v_assignment;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Service not found, already closed, or not assigned to you';
  END IF;

  SELECT COALESCE(balance_after, 0) INTO v_balance
    FROM public.wallet_ledger WHERE partner_id = v_partner
    ORDER BY created_at DESC LIMIT 1;
  v_balance := COALESCE(v_balance, 0) + v_credit;

  INSERT INTO public.wallet_ledger(partner_id, entry_type, amount, balance_after, description, service_id, assignment_id)
  SELECT v_partner, 'earning', v_credit, v_balance, 'Customer unavailable visit', p_service_id, v_assignment
  WHERE NOT EXISTS (SELECT 1 FROM public.wallet_ledger WHERE service_id = p_service_id AND entry_type = 'earning');

  UPDATE public.partners
    SET lifetime_earnings = COALESCE(lifetime_earnings, 0) + CASE WHEN NOT EXISTS (SELECT 1 FROM public.wallet_ledger WHERE service_id = p_service_id AND entry_type = 'earning' AND created_at < now() - interval '1 second') THEN v_credit ELSE 0 END,
        updated_at = now()
    WHERE id = v_partner;

  RETURN jsonb_build_object('ok', true, 'credited', v_credit);
END
$$;

CREATE OR REPLACE FUNCTION public.tg_credit_completed_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance numeric;
  v_amount numeric;
BEGIN
  IF NEW.status = 'completed'::service_status AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_amount := COALESCE(NEW.rate_per_car, (SELECT COALESCE((value::text)::numeric, 17) FROM public.platform_settings WHERE key = 'rate_per_car'), 17);

    SELECT COALESCE(balance_after, 0) INTO v_balance
    FROM public.wallet_ledger
    WHERE partner_id = NEW.partner_id
    ORDER BY created_at DESC
    LIMIT 1;
    v_balance := COALESCE(v_balance, 0) + v_amount;

    INSERT INTO public.wallet_ledger(partner_id, entry_type, amount, balance_after, description, service_id, assignment_id)
    SELECT NEW.partner_id, 'earning', v_amount, v_balance, 'Service completed', NEW.id, NEW.assignment_id
    WHERE NEW.partner_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.wallet_ledger WHERE service_id = NEW.id AND entry_type = 'earning');

    UPDATE public.partners
      SET total_cars_completed = COALESCE(total_cars_completed, 0) + 1,
          lifetime_earnings = COALESCE(lifetime_earnings, 0) + v_amount,
          updated_at = now()
      WHERE id = NEW.partner_id
        AND EXISTS (SELECT 1 FROM public.wallet_ledger WHERE service_id = NEW.id AND entry_type = 'earning');
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS credit_completed_service ON public.services;
CREATE TRIGGER credit_completed_service
AFTER UPDATE OF status ON public.services
FOR EACH ROW
EXECUTE FUNCTION public.tg_credit_completed_service();

CREATE OR REPLACE FUNCTION public.cancel_assignment(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_partner uuid := auth.uid();
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  DELETE FROM public.services
  WHERE assignment_id = p_assignment_id
    AND partner_id = v_partner
    AND scheduled_date >= CURRENT_DATE
    AND status = 'pending';

  UPDATE public.assignments
    SET status = 'cancelled', completed_at = now()
  WHERE id = p_assignment_id
    AND partner_id = v_partner
    AND status = 'active';

  UPDATE public.partners SET cars_selected = 0, updated_at = now() WHERE id = v_partner;
END
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_assignment(p_assignment_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_partner uuid;
BEGIN
  SELECT partner_id INTO v_partner FROM public.assignments WHERE id = p_assignment_id;

  DELETE FROM public.services
  WHERE assignment_id = p_assignment_id
    AND scheduled_date >= CURRENT_DATE
    AND status = 'pending';

  UPDATE public.assignments
    SET status = 'cancelled', completed_at = now()
  WHERE id = p_assignment_id
    AND status = 'active';

  IF v_partner IS NOT NULL THEN
    UPDATE public.partners SET cars_selected = 0, updated_at = now() WHERE id = v_partner;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.admin_update_customer(
  p_id uuid,
  p_full_name text,
  p_phone text,
  p_area text,
  p_address_line text,
  p_pincode text,
  p_latitude numeric,
  p_longitude numeric,
  p_subscription_plan text,
  p_subscription_start date,
  p_subscription_end date,
  p_preferred_time text,
  p_service_required_before text,
  p_is_active boolean,
  p_package_amount integer DEFAULT NULL,
  p_front_image_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.customers SET
    full_name = COALESCE(NULLIF(p_full_name, ''), full_name),
    phone = COALESCE(NULLIF(p_phone, ''), phone),
    area = COALESCE(NULLIF(p_area, ''), area),
    address_line = COALESCE(NULLIF(p_address_line, ''), address_line),
    pincode = COALESCE(NULLIF(p_pincode, ''), pincode),
    latitude = COALESCE(p_latitude, latitude),
    longitude = COALESCE(p_longitude, longitude),
    subscription_plan = COALESCE(NULLIF(p_subscription_plan, '')::subscription_plan, subscription_plan),
    subscription_start = COALESCE(p_subscription_start, subscription_start),
    subscription_end = COALESCE(p_subscription_end, subscription_end),
    preferred_time = COALESCE(NULLIF(p_preferred_time, ''), preferred_time),
    service_required_before = NULLIF(p_service_required_before, ''),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_id;

  IF p_package_amount IS NOT NULL OR NULLIF(p_front_image_path, '') IS NOT NULL THEN
    UPDATE public.vehicles
      SET package_amount = COALESCE(p_package_amount, package_amount),
          front_image_path = COALESCE(NULLIF(p_front_image_path, ''), front_image_path)
      WHERE id = (SELECT id FROM public.vehicles WHERE customer_id = p_id ORDER BY created_at DESC LIMIT 1);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.admin_update_partner(
  p_id uuid,
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_home_area text DEFAULT NULL,
  p_aadhaar_number text DEFAULT NULL,
  p_pan_number text DEFAULT NULL,
  p_bank_account_number text DEFAULT NULL,
  p_bank_ifsc text DEFAULT NULL,
  p_level text DEFAULT NULL,
  p_rating numeric DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_aadhaar_verified boolean DEFAULT NULL,
  p_pan_verified boolean DEFAULT NULL,
  p_bank_verified boolean DEFAULT NULL,
  p_lifetime_earnings numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lat numeric;
  v_lng numeric;
BEGIN
  IF NULLIF(p_home_area, '') IS NOT NULL THEN
    SELECT lat, lng INTO v_lat, v_lng
    FROM (VALUES
      ('Indira Nagar', 26.8783::numeric, 80.9989::numeric),
      ('Gomti Nagar', 26.8467::numeric, 81.0023::numeric),
      ('Gomti Nagar Extension', 26.8889::numeric, 81.0234::numeric),
      ('Aliganj', 26.8956::numeric, 80.9456::numeric),
      ('Jankipuram', 26.9234::numeric, 80.9189::numeric),
      ('Hazratganj', 26.8489::numeric, 80.945::numeric),
      ('Vikas Nagar', 26.9012::numeric, 80.9012::numeric),
      ('Ashiyana', 26.7989::numeric, 80.9089::numeric),
      ('Rajajipuram', 26.8312::numeric, 80.8723::numeric),
      ('Alambagh', 26.8089::numeric, 80.8889::numeric),
      ('Mahanagar', 26.8856::numeric, 80.9523::numeric),
      ('Kalyanpur', 26.9089::numeric, 80.9356::numeric),
      ('Khurram Nagar', 26.8978::numeric, 80.9712::numeric)
    ) AS areas(name, lat, lng)
    WHERE lower(name) = lower(p_home_area)
    LIMIT 1;
  END IF;

  UPDATE public.partners SET
    full_name = COALESCE(NULLIF(p_full_name, ''), full_name),
    phone = COALESCE(NULLIF(p_phone, ''), phone),
    home_area = COALESCE(NULLIF(p_home_area, ''), home_area),
    home_lat = COALESCE(v_lat, home_lat),
    home_lng = COALESCE(v_lng, home_lng),
    aadhaar_number = COALESCE(NULLIF(p_aadhaar_number, ''), aadhaar_number),
    pan_number = COALESCE(NULLIF(p_pan_number, ''), pan_number),
    bank_account_number = COALESCE(NULLIF(p_bank_account_number, ''), bank_account_number),
    bank_ifsc = COALESCE(NULLIF(p_bank_ifsc, ''), bank_ifsc),
    level = COALESCE(NULLIF(p_level, ''), level),
    rating = COALESCE(p_rating, rating),
    status = COALESCE(NULLIF(p_status, '')::partner_status, status),
    aadhaar_verified = COALESCE(p_aadhaar_verified, aadhaar_verified),
    pan_verified = COALESCE(p_pan_verified, pan_verified),
    bank_verified = COALESCE(p_bank_verified, bank_verified),
    lifetime_earnings = COALESCE(p_lifetime_earnings, lifetime_earnings),
    updated_at = now()
  WHERE id = p_id;
END
$$;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_settings; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

REVOKE EXECUTE ON FUNCTION public.preview_assignment(integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_assignment_v2(integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_service_unavailable(uuid, text, text, text, numeric, numeric) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_assignment(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_assignment(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_customer(uuid, text, text, text, text, text, numeric, numeric, text, date, date, text, text, boolean, integer, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_partner(uuid, text, text, text, text, text, text, text, text, numeric, text, boolean, boolean, boolean, numeric) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.preview_assignment(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_assignment_v2(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_service_unavailable(uuid, text, text, text, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_assignment(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_cancel_assignment(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_customer(uuid, text, text, text, text, text, numeric, numeric, text, date, date, text, text, boolean, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_partner(uuid, text, text, text, text, text, text, text, text, numeric, text, boolean, boolean, boolean, numeric) TO service_role;