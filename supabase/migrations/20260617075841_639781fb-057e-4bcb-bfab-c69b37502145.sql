ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS package_amount integer;

CREATE OR REPLACE FUNCTION public.set_partner_area(p_area text, p_lat numeric, p_lng numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_partner uuid := auth.uid();
  v_current text;
  v_locked date;
  v_lock_days int;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT home_area, area_locked_until INTO v_current, v_locked
  FROM public.partners
  WHERE id = v_partner;

  SELECT COALESCE((value::text)::int, 0) INTO v_lock_days
  FROM public.platform_settings
  WHERE key = 'area_lock_days';
  v_lock_days := COALESCE(v_lock_days, 0);

  IF v_lock_days > 0 AND v_current IS NOT NULL AND v_current <> p_area AND v_locked IS NOT NULL AND v_locked > CURRENT_DATE THEN
    RAISE EXCEPTION 'Area is locked until %', v_locked;
  END IF;

  IF v_current IS DISTINCT FROM p_area THEN
    INSERT INTO public.area_change_history (partner_id, from_area, to_area)
    VALUES (v_partner, v_current, p_area);
  END IF;

  UPDATE public.partners SET
    previous_area = CASE WHEN v_current IS DISTINCT FROM p_area THEN v_current ELSE previous_area END,
    home_area = p_area,
    home_lat = p_lat,
    home_lng = p_lng,
    area_locked_until = CASE WHEN v_lock_days > 0 THEN CURRENT_DATE + v_lock_days ELSE NULL END,
    area_change_count = area_change_count + CASE WHEN v_current IS NOT NULL AND v_current IS DISTINCT FROM p_area THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE id = v_partner;
END
$function$;

DROP FUNCTION IF EXISTS public.preview_assignment(integer, integer);

CREATE OR REPLACE FUNCTION public.preview_assignment(p_cars integer, p_duration integer)
RETURNS TABLE(cars integer, duration_days integer, working_days integer, daily_earnings numeric, total_earnings numeric, estimated_radius_km numeric, estimated_hours numeric, expected_start_time text, expected_end_time text, available_customers integer, message text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lat numeric; v_lng numeric; v_home_area text;
  v_found int := 0; v_available int := 0; v_max_d numeric := 0;
  v_days int := 0; d date;
BEGIN
  IF p_cars < 15 OR p_cars > 30 THEN RAISE EXCEPTION 'Cars must be 15-30'; END IF;
  IF p_duration < 7 OR p_duration > 30 THEN RAISE EXCEPTION 'Duration must be 7-30'; END IF;

  SELECT home_lat, home_lng, trim(home_area)
    INTO v_lat, v_lng, v_home_area
  FROM public.partners
  WHERE id = auth.uid();

  IF v_home_area IS NULL OR length(v_home_area) = 0 THEN
    FOR d IN SELECT generate_series(CURRENT_DATE, CURRENT_DATE + (p_duration - 1), interval '1 day')::date LOOP
      IF extract(dow FROM d) <> 1 THEN v_days := v_days + 1; END IF;
    END LOOP;
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

  FOR d IN SELECT generate_series(CURRENT_DATE, CURRENT_DATE + (p_duration - 1), interval '1 day')::date LOOP
    IF extract(dow FROM d) <> 1 THEN v_days := v_days + 1; END IF;
  END LOOP;

  RETURN QUERY SELECT
    v_found,
    p_duration,
    v_days,
    (v_found * 17)::numeric,
    (v_found * 17 * v_days)::numeric,
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
      WHEN v_available < p_cars THEN 'Only ' || v_available || ' customers available in this area.'
      ELSE NULL
    END;
END
$function$;

CREATE OR REPLACE FUNCTION public.accept_assignment_v2(p_cars integer, p_duration integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_partner uuid := auth.uid();
  v_lat numeric; v_lng numeric; v_home_area text; v_first_done boolean;
  v_found int := 0;
  v_assignment uuid; v_existing int;
  v_start date := CURRENT_DATE; v_end date;
  v_start_time text; v_total_d numeric := 0; v_radius numeric := 0;
  r record; work_day date; seq int;
  v_min_new int; v_min int; v_max int;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT COALESCE((value::text)::int, 15) INTO v_min_new FROM public.platform_settings WHERE key = 'min_assignment_days_new';
  SELECT COALESCE((value::text)::int, 7) INTO v_min FROM public.platform_settings WHERE key = 'min_assignment_days';
  SELECT COALESCE((value::text)::int, 30) INTO v_max FROM public.platform_settings WHERE key = 'max_assignment_days';

  IF p_cars < 15 OR p_cars > 30 THEN RAISE EXCEPTION 'Cars must be 15-30'; END IF;

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
    IF p_duration < v_min OR p_duration > v_max THEN RAISE EXCEPTION 'Duration must be %-% days', v_min, v_max; END IF;
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

  IF v_found < p_cars THEN
    RAISE EXCEPTION 'Only % customers available in this area.', v_found;
  END IF;

  INSERT INTO public.assignments (partner_id, area, target_cars, status, rate_per_car, estimated_earnings, estimated_hours, estimated_distance_km, search_radius_km, scheduled_date, duration_days, start_date, end_date, working_days, expected_start_time, total_earnings)
  VALUES (v_partner, v_home_area, v_found, 'active', 17, v_found * 17, GREATEST(round((v_found * 0.15)::numeric, 1), 1.0), v_total_d, v_radius, v_start, p_duration, v_start, v_end, (SELECT count(*) FROM generate_series(v_start, v_end, interval '1 day') g WHERE extract(dow FROM g) <> 1), v_start_time, 0)
  RETURNING id INTO v_assignment;

  FOR work_day IN SELECT generate_series(v_start, v_end, interval '1 day')::date LOOP
    IF extract(dow FROM work_day) = 1 THEN CONTINUE; END IF;
    seq := 0;
    FOR r IN SELECT tp.* FROM tmp_picks tp ORDER BY tp.preferred_time NULLS LAST, tp.distance_km ASC LOOP
      seq := seq + 1;
      INSERT INTO public.services (partner_id, customer_id, vehicle_id, assignment_id, scheduled_date, time_slot, sequence_no, rate_per_car, status)
      VALUES (v_partner, r.customer_id, r.vehicle_id, v_assignment, work_day, COALESCE(r.preferred_time, '06:00 - 09:00'), seq, 17, 'pending');
    END LOOP;
  END LOOP;

  UPDATE public.assignments SET total_earnings = (SELECT count(*) * 17 FROM public.services WHERE assignment_id = v_assignment) WHERE id = v_assignment;
  UPDATE public.partners SET cars_selected = v_found, rate_per_car = 17, updated_at = now() WHERE id = v_partner;
  RETURN v_assignment;
END
$function$;

DROP FUNCTION IF EXISTS public.admin_update_customer(uuid, text, text, text, text, text, numeric, numeric, text, date, date, text, text, boolean);

CREATE OR REPLACE FUNCTION public.admin_update_customer(p_id uuid, p_full_name text, p_phone text, p_area text, p_address_line text, p_pincode text, p_latitude numeric, p_longitude numeric, p_subscription_plan text, p_subscription_start date, p_subscription_end date, p_preferred_time text, p_service_required_before text, p_is_active boolean, p_package_amount integer DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF p_package_amount IS NOT NULL THEN
    UPDATE public.vehicles
      SET package_amount = p_package_amount
      WHERE id = (SELECT id FROM public.vehicles WHERE customer_id = p_id ORDER BY created_at DESC LIMIT 1);
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.tg_credit_completed_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_balance numeric;
  v_amount numeric;
BEGIN
  IF NEW.status = 'completed'::service_status AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_amount := COALESCE(NEW.rate_per_car, 17);

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
      WHERE id = NEW.partner_id;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS credit_completed_service ON public.services;
CREATE TRIGGER credit_completed_service
AFTER UPDATE OF status ON public.services
FOR EACH ROW
EXECUTE FUNCTION public.tg_credit_completed_service();

CREATE OR REPLACE FUNCTION public.submit_service_unavailable(p_service_id uuid, p_reason text, p_notes text, p_photo text, p_lat numeric, p_lng numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_partner UUID := auth.uid();
  v_balance NUMERIC;
  v_credit NUMERIC := 12;
  v_updated int;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_photo IS NULL OR length(trim(p_photo)) = 0 THEN RAISE EXCEPTION 'Photo required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'Reason required'; END IF;

  UPDATE public.services SET
    status = 'unavailable',
    unavailable_reason = p_reason::unavailable_reason,
    unavailable_notes = NULLIF(p_notes, ''),
    unavailable_photo = p_photo,
    unavailable_lat = NULLIF(p_lat, 0),
    unavailable_lng = NULLIF(p_lng, 0),
    completed_at = now()
  WHERE id = p_service_id
    AND partner_id = v_partner
    AND status IN ('pending', 'in_progress');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Service not found, already closed, or not assigned to you';
  END IF;

  SELECT COALESCE(balance_after, 0) INTO v_balance
    FROM public.wallet_ledger WHERE partner_id = v_partner
    ORDER BY created_at DESC LIMIT 1;
  v_balance := COALESCE(v_balance, 0) + v_credit;

  INSERT INTO public.wallet_ledger(partner_id, entry_type, amount, balance_after, description, service_id)
  SELECT v_partner, 'earning', v_credit, v_balance, 'Customer unavailable visit', p_service_id
  WHERE NOT EXISTS (SELECT 1 FROM public.wallet_ledger WHERE service_id = p_service_id AND entry_type = 'earning');

  UPDATE public.partners
    SET lifetime_earnings = COALESCE(lifetime_earnings, 0) + v_credit,
        updated_at = now()
    WHERE id = v_partner;

  RETURN jsonb_build_object('ok', true, 'credited', v_credit);
END
$function$;

INSERT INTO public.platform_settings(key, value, description)
VALUES ('area_lock_days', '0'::jsonb, 'Days before partner can change their work area')
ON CONFLICT (key) DO UPDATE SET value = '0'::jsonb, description = EXCLUDED.description, updated_at = now();

REVOKE EXECUTE ON FUNCTION public.preview_assignment(integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_assignment_v2(integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_partner_area(text, numeric, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_service_unavailable(uuid, text, text, text, numeric, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_customer(uuid, text, text, text, text, text, numeric, numeric, text, date, date, text, text, boolean, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_credit_completed_service() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.preview_assignment(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_assignment_v2(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_partner_area(text, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_service_unavailable(uuid, text, text, text, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_customer(uuid, text, text, text, text, text, numeric, numeric, text, date, date, text, text, boolean, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_credit_completed_service() TO service_role;