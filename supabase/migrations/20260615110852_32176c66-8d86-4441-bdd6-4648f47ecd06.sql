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

  SELECT COALESCE((value::text)::int, 15) INTO v_min_new FROM platform_settings WHERE key = 'min_assignment_days_new';
  SELECT COALESCE((value::text)::int, 7) INTO v_min FROM platform_settings WHERE key = 'min_assignment_days';
  SELECT COALESCE((value::text)::int, 30) INTO v_max FROM platform_settings WHERE key = 'max_assignment_days';

  IF p_cars < 15 OR p_cars > 30 THEN RAISE EXCEPTION 'Cars must be 15-30'; END IF;

  SELECT home_lat, home_lng, trim(home_area), first_assignment_completed
    INTO v_lat, v_lng, v_home_area, v_first_done
  FROM partners
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
  FROM assignments
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

  CREATE TEMP TABLE tmp_picks (
    customer_id uuid PRIMARY KEY,
    vehicle_id uuid,
    distance_km numeric,
    area text,
    preferred_time text
  ) ON COMMIT DROP;

  INSERT INTO tmp_picks
  SELECT DISTINCT ON (c.id)
    c.id,
    v.id,
    COALESCE(public.haversine_km(v_lat, v_lng, c.latitude, c.longitude), 999999),
    c.area,
    c.preferred_time
  FROM customers c
  JOIN vehicles v ON v.customer_id = c.id
  WHERE c.is_active = true
    AND lower(trim(c.area)) = lower(v_home_area)
    AND NOT EXISTS (
      SELECT 1
      FROM assignments a2
      JOIN services s2 ON s2.assignment_id = a2.id AND s2.customer_id = c.id
      WHERE a2.status = 'active' AND a2.end_date >= CURRENT_DATE
    )
  ORDER BY c.id, COALESCE(public.haversine_km(v_lat, v_lng, c.latitude, c.longitude), 999999), v.created_at DESC
  LIMIT p_cars;

  SELECT count(*), COALESCE(round(sum(NULLIF(distance_km, 999999))::numeric * 1.4, 1), 0), COALESCE(round(max(NULLIF(distance_km, 999999))::numeric, 1), 0)
    INTO v_found, v_total_d, v_radius
  FROM tmp_picks;

  IF v_found = 0 THEN
    RAISE EXCEPTION 'No customers available in your area (%). Ask admin to import more.', v_home_area;
  END IF;

  INSERT INTO assignments (
    partner_id, area, target_cars, status, rate_per_car,
    estimated_earnings, estimated_hours, estimated_distance_km, search_radius_km,
    scheduled_date, duration_days, start_date, end_date, working_days,
    expected_start_time, total_earnings
  )
  VALUES (
    v_partner, v_home_area, v_found, 'active', 17,
    v_found * 17, GREATEST(round((v_found * 0.15)::numeric, 1), 1.0), v_total_d, v_radius,
    v_start, p_duration, v_start, v_end,
    (SELECT count(*) FROM generate_series(v_start, v_end, interval '1 day') g WHERE extract(dow FROM g) <> 1),
    v_start_time, 0
  )
  RETURNING id INTO v_assignment;

  FOR work_day IN SELECT generate_series(v_start, v_end, interval '1 day')::date LOOP
    IF extract(dow FROM work_day) = 1 THEN CONTINUE; END IF;
    seq := 0;
    FOR r IN SELECT tp.* FROM tmp_picks tp ORDER BY tp.preferred_time NULLS LAST, tp.distance_km ASC LOOP
      seq := seq + 1;
      INSERT INTO services (partner_id, customer_id, vehicle_id, assignment_id,
                            scheduled_date, time_slot, sequence_no, rate_per_car, status)
      VALUES (v_partner, r.customer_id, r.vehicle_id, v_assignment,
              work_day, COALESCE(r.preferred_time, '06:00 - 09:00'), seq, 17, 'pending');
    END LOOP;
  END LOOP;

  UPDATE assignments SET total_earnings = (
    SELECT count(*) * 17 FROM services WHERE assignment_id = v_assignment
  ) WHERE id = v_assignment;

  UPDATE partners SET cars_selected = v_found, rate_per_car = 17 WHERE id = v_partner;
  RETURN v_assignment;
END
$function$;