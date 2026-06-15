
-- 1. Normalize existing customer area values to the canonical names used in the app
UPDATE public.customers SET area = 'Kalyanpur'   WHERE area ILIKE 'kalyanpur';
UPDATE public.customers SET area = 'Jankipuram'  WHERE area ILIKE 'jankipuram' OR area ILIKE 'jankipuam';
UPDATE public.customers SET area = 'Aliganj'     WHERE area ILIKE 'aliganj';
UPDATE public.customers SET area = 'Indira Nagar' WHERE area ILIKE 'indira nagar' OR area ILIKE 'indra nagar';
UPDATE public.customers SET area = 'Khurram Nagar' WHERE area ILIKE 'khurram nagar';
UPDATE public.customers SET area = 'Vikas Nagar' WHERE area ILIKE 'vikas nagar';

-- 2. Tighten accept_assignment_v2: HARD filter by partner's home_area
CREATE OR REPLACE FUNCTION public.accept_assignment_v2(p_cars integer, p_duration integer)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_partner uuid := auth.uid();
  v_lat numeric; v_lng numeric; v_home_area text; v_first_done boolean;
  v_radius numeric := 1; v_found int := 0;
  v_assignment uuid; v_area text; v_existing int;
  v_start date := CURRENT_DATE; v_end date;
  v_start_time text; v_total_d numeric := 0;
  r record; d date; seq int;
  v_min_new int; v_min int; v_max int;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT (value::text)::int INTO v_min_new FROM platform_settings WHERE key = 'min_assignment_days_new';
  SELECT (value::text)::int INTO v_min FROM platform_settings WHERE key = 'min_assignment_days';
  SELECT (value::text)::int INTO v_max FROM platform_settings WHERE key = 'max_assignment_days';

  IF p_cars < 15 OR p_cars > 30 THEN RAISE EXCEPTION 'Cars must be 15-30'; END IF;

  SELECT home_lat, home_lng, home_area, first_assignment_completed
    INTO v_lat, v_lng, v_home_area, v_first_done FROM partners WHERE id = v_partner;

  IF v_home_area IS NULL THEN RAISE EXCEPTION 'Please select your work area first'; END IF;

  IF NOT v_first_done THEN
    IF p_duration < v_min_new THEN RAISE EXCEPTION 'First assignment must be at least % days', v_min_new; END IF;
  ELSE
    IF p_duration < v_min OR p_duration > v_max THEN RAISE EXCEPTION 'Duration must be %-% days', v_min, v_max; END IF;
  END IF;

  SELECT count(*) INTO v_existing FROM assignments
   WHERE partner_id = v_partner AND status = 'active' AND end_date >= CURRENT_DATE;
  IF v_existing > 0 THEN RAISE EXCEPTION 'You already have an active assignment'; END IF;

  IF v_lat IS NULL THEN v_lat := 26.8467; v_lng := 80.9462; END IF;

  v_end := v_start + (p_duration - 1);
  v_start_time := CASE
    WHEN p_cars <= 19 THEN '07:00'
    WHEN p_cars <= 24 THEN '06:30'
    WHEN p_cars <= 29 THEN '06:00'
    ELSE '05:30'
  END;

  CREATE TEMP TABLE tmp_picks (customer_id uuid, vehicle_id uuid, d numeric, area text, preferred_time text) ON COMMIT DROP;

  WHILE v_found < p_cars AND v_radius <= 5 LOOP
    DELETE FROM tmp_picks;
    INSERT INTO tmp_picks
    SELECT c.id, v.id, public.haversine_km(v_lat, v_lng, c.latitude, c.longitude), c.area, c.preferred_time
    FROM customers c JOIN vehicles v ON v.customer_id = c.id
    WHERE c.is_active = true
      AND c.area = v_home_area  -- HARD area lock
      AND public.haversine_km(v_lat, v_lng, c.latitude, c.longitude) <= v_radius
      AND NOT EXISTS (
        SELECT 1 FROM assignments a2
        JOIN services s2 ON s2.assignment_id = a2.id AND s2.customer_id = c.id
        WHERE a2.status = 'active' AND a2.end_date >= CURRENT_DATE
      )
    ORDER BY c.preferred_time NULLS LAST,
             public.haversine_km(v_lat, v_lng, c.latitude, c.longitude) ASC
    LIMIT p_cars;
    SELECT count(*) INTO v_found FROM tmp_picks;
    IF v_found < p_cars THEN
      v_radius := CASE v_radius WHEN 1 THEN 2 WHEN 2 THEN 3 WHEN 3 THEN 5 ELSE 6 END;
    END IF;
  END LOOP;

  IF v_found = 0 THEN
    RAISE EXCEPTION 'No customers available in your area (%). Ask admin to import more.', v_home_area;
  END IF;

  v_area := v_home_area;
  SELECT round(sum(t.d)::numeric * 1.4, 1) INTO v_total_d FROM tmp_picks t;

  INSERT INTO assignments (
    partner_id, area, target_cars, status, rate_per_car,
    estimated_earnings, estimated_hours, estimated_distance_km, search_radius_km,
    scheduled_date, duration_days, start_date, end_date, working_days,
    expected_start_time, total_earnings
  )
  VALUES (
    v_partner, v_area, v_found, 'active', 17,
    v_found * 17, GREATEST(round((v_found * 0.15)::numeric, 1), 1.0), v_total_d, v_radius,
    v_start, p_duration, v_start, v_end,
    (SELECT count(*) FROM generate_series(v_start, v_end, interval '1 day') g WHERE extract(dow FROM g) <> 1),
    v_start_time, 0
  )
  RETURNING id INTO v_assignment;

  FOR d IN SELECT generate_series(v_start, v_end, interval '1 day')::date LOOP
    IF extract(dow FROM d) = 1 THEN CONTINUE; END IF;
    seq := 0;
    FOR r IN SELECT * FROM tmp_picks ORDER BY d ASC LOOP
      seq := seq + 1;
      INSERT INTO services (partner_id, customer_id, vehicle_id, assignment_id,
                            scheduled_date, time_slot, sequence_no, rate_per_car, status)
      VALUES (v_partner, r.customer_id, r.vehicle_id, v_assignment,
              d, COALESCE(r.preferred_time, '06:00 - 09:00'), seq, 17, 'pending');
    END LOOP;
  END LOOP;

  UPDATE assignments SET total_earnings = (
    SELECT count(*) * 17 FROM services WHERE assignment_id = v_assignment
  ) WHERE id = v_assignment;

  UPDATE partners SET cars_selected = v_found, rate_per_car = 17 WHERE id = v_partner;
  RETURN v_assignment;
END $function$;

-- 3. Schedule the 48h photo cleanup hourly (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-service-photos');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-service-photos',
  '0 * * * *',
  $$ SELECT public.cleanup_old_service_photos(); $$
);
