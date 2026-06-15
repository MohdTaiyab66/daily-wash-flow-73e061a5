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
  r record; d date; seq int;
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
    d numeric,
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

  SELECT count(*), COALESCE(round(sum(NULLIF(d, 999999))::numeric * 1.4, 1), 0), COALESCE(round(max(NULLIF(d, 999999))::numeric, 1), 0)
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

  FOR d IN SELECT generate_series(v_start, v_end, interval '1 day')::date LOOP
    IF extract(dow FROM d) = 1 THEN CONTINUE; END IF;
    seq := 0;
    FOR r IN SELECT * FROM tmp_picks ORDER BY preferred_time NULLS LAST, d ASC LOOP
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
END
$function$;

CREATE OR REPLACE FUNCTION public.preview_assignment(p_cars integer, p_duration integer)
RETURNS TABLE(cars integer, duration_days integer, working_days integer, daily_earnings numeric, total_earnings numeric, estimated_radius_km numeric, estimated_hours numeric, expected_start_time text, expected_end_time text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lat numeric; v_lng numeric; v_home_area text;
  v_found int := 0; v_max_d numeric := 0;
  v_days int := 0; d date;
BEGIN
  IF p_cars < 15 OR p_cars > 30 THEN RAISE EXCEPTION 'Cars must be 15-30'; END IF;
  IF p_duration < 7 OR p_duration > 30 THEN RAISE EXCEPTION 'Duration must be 7-30'; END IF;

  SELECT home_lat, home_lng, trim(home_area)
    INTO v_lat, v_lng, v_home_area
  FROM partners
  WHERE id = auth.uid();

  IF v_home_area IS NULL OR length(v_home_area) = 0 THEN
    RETURN QUERY SELECT 0, p_duration, 0, 0::numeric, 0::numeric, 0::numeric, 0::numeric, '07:00', '10:00';
    RETURN;
  END IF;

  IF v_lat IS NULL THEN v_lat := 26.8467; v_lng := 80.9462; END IF;

  WITH available AS (
    SELECT DISTINCT ON (c.id)
      c.id,
      COALESCE(public.haversine_km(v_lat, v_lng, c.latitude, c.longitude), 0) AS d
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
    LIMIT p_cars
  )
  SELECT count(*), COALESCE(max(d), 0)
    INTO v_found, v_max_d
  FROM available;

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
    '10:00';
END
$function$;

CREATE OR REPLACE FUNCTION public.modify_assignment(p_assignment_id uuid, p_delta integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_partner uuid := auth.uid();
  v_a record;
  v_cooldown int;
  v_max int;
  v_today date := CURRENT_DATE;
  v_change_type text;
  v_released uuid[] := ARRAY[]::uuid[];
  v_requested_target int;
  v_actual_target int;
  v_lat numeric; v_lng numeric; v_home_area text;
  v_added int := 0;
  r record;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_delta = 0 THEN RAISE EXCEPTION 'Delta must be non-zero'; END IF;

  SELECT COALESCE((value::text)::int, 2) INTO v_cooldown FROM platform_settings WHERE key='modify_cooldown_days';
  SELECT COALESCE((value::text)::int, 3) INTO v_max FROM platform_settings WHERE key='max_modifications_per_assignment';

  SELECT * INTO v_a FROM assignments
    WHERE id = p_assignment_id AND partner_id = v_partner AND status='active'
    FOR UPDATE;
  IF v_a.id IS NULL THEN RAISE EXCEPTION 'Assignment not found or not active'; END IF;

  IF v_a.modification_count >= v_max THEN
    RAISE EXCEPTION 'Reached maximum % modifications for this assignment', v_max;
  END IF;
  IF v_a.last_modified_at IS NOT NULL AND v_a.last_modified_at > now() - (v_cooldown || ' days')::interval THEN
    RAISE EXCEPTION 'Wait at least % days between modifications', v_cooldown;
  END IF;

  v_requested_target := v_a.target_cars + p_delta;
  IF v_requested_target < 15 OR v_requested_target > 30 THEN
    RAISE EXCEPTION 'Car count must stay between 15 and 30';
  END IF;
  v_change_type := CASE WHEN p_delta > 0 THEN 'increase' ELSE 'decrease' END;

  IF p_delta < 0 THEN
    SELECT array_agg(DISTINCT customer_id) INTO v_released
    FROM (
      SELECT s.customer_id, s.id,
             row_number() OVER (PARTITION BY s.scheduled_date ORDER BY s.sequence_no DESC) AS rn
      FROM services s
      WHERE s.assignment_id = p_assignment_id
        AND s.scheduled_date >= v_today
        AND s.status = 'pending'
    ) ranked
    WHERE rn <= -p_delta;

    DELETE FROM services
    WHERE assignment_id = p_assignment_id
      AND scheduled_date >= v_today
      AND status = 'pending'
      AND customer_id = ANY(COALESCE(v_released, ARRAY[]::uuid[]));
  ELSE
    SELECT home_lat, home_lng, trim(home_area) INTO v_lat, v_lng, v_home_area FROM partners WHERE id = v_partner;
    IF v_lat IS NULL THEN v_lat := 26.8467; v_lng := 80.9462; END IF;
    IF v_home_area IS NULL OR length(v_home_area) = 0 THEN RAISE EXCEPTION 'Please select your work area first'; END IF;

    FOR r IN
      SELECT DISTINCT ON (c.id)
        c.id AS customer_id,
        v.id AS vehicle_id,
        c.preferred_time,
        COALESCE(public.haversine_km(v_lat, v_lng, c.latitude, c.longitude), 999999) AS d
      FROM customers c
      JOIN vehicles v ON v.customer_id = c.id
      WHERE c.is_active = true
        AND lower(trim(c.area)) = lower(v_home_area)
        AND NOT EXISTS (
          SELECT 1 FROM services s2
          WHERE s2.customer_id = c.id
            AND s2.scheduled_date >= v_today
            AND s2.partner_id IS NOT NULL
        )
      ORDER BY c.id, COALESCE(public.haversine_km(v_lat, v_lng, c.latitude, c.longitude), 999999), v.created_at DESC
      LIMIT p_delta
    LOOP
      v_added := v_added + 1;
      INSERT INTO services (partner_id, customer_id, vehicle_id, assignment_id,
                            scheduled_date, time_slot, sequence_no, rate_per_car, status)
      SELECT v_partner, r.customer_id, r.vehicle_id, p_assignment_id,
             d, COALESCE(r.preferred_time, '06:00 - 09:00'),
             COALESCE((SELECT max(sequence_no) FROM services WHERE assignment_id=p_assignment_id AND scheduled_date=d),0)+1,
             v_a.rate_per_car, 'pending'
      FROM generate_series(v_today, v_a.end_date, interval '1 day') AS g(d)
      WHERE extract(dow FROM d) <> 1;
    END LOOP;

    IF v_added = 0 THEN
      RAISE EXCEPTION 'No additional customers available in your area';
    END IF;
  END IF;

  SELECT count(DISTINCT customer_id) INTO v_actual_target
  FROM services
  WHERE assignment_id = p_assignment_id AND scheduled_date >= v_today;
  v_actual_target := GREATEST(v_actual_target, 0);

  UPDATE assignments
    SET target_cars = v_actual_target,
        modification_count = modification_count + 1,
        last_modified_at = now(),
        total_earnings = (SELECT count(*) * rate_per_car FROM services WHERE assignment_id = p_assignment_id)
    WHERE id = p_assignment_id;

  INSERT INTO assignment_changes(assignment_id, partner_id, change_type, delta_cars, previous_target, new_target, released_customer_ids)
  VALUES (p_assignment_id, v_partner, v_change_type, p_delta, v_a.target_cars, v_actual_target, v_released);

  RETURN jsonb_build_object(
    'ok', true,
    'new_target', v_actual_target,
    'released_count', COALESCE(array_length(v_released,1),0),
    'added_count', v_added,
    'modifications_used', v_a.modification_count + 1,
    'modifications_remaining', v_max - (v_a.modification_count + 1)
  );
END
$function$;

REVOKE ALL ON FUNCTION public.modify_assignment(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.modify_assignment(uuid, integer) TO authenticated;