
DROP FUNCTION IF EXISTS public.preview_assignment(integer, integer);

CREATE FUNCTION public.preview_assignment(p_cars integer, p_duration integer)
 RETURNS TABLE(
   cars integer, duration_days integer, working_days integer,
   daily_earnings numeric, total_earnings numeric,
   estimated_radius_km numeric, estimated_hours numeric,
   expected_start_time text, expected_end_time text,
   available_customers integer, message text,
   zone_id uuid, zone_name text, daily_shine_open boolean,
   zone_capacity_remaining integer, zone_used_pct numeric,
   daily_shine_demand integer
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lat numeric; v_lng numeric; v_home_area text;
  v_found int := 0; v_available int := 0; v_max_d numeric := 0;
  v_days int := 0; v_date date;
  v_min_cars int := 0; v_max_cars int := 30; v_rate numeric := 120;
  v_min_days int := 7; v_max_days int := 30;
  v_cov record; v_cap record;
  v_zone_id uuid; v_zone_name text; v_ds_open boolean := false;
  v_zone_remaining int := 0; v_zone_pct numeric := 0;
  v_ds_demand int := 0;
BEGIN
  SELECT COALESCE((value::text)::int, 0) INTO v_min_cars FROM platform_settings WHERE key = 'min_cars_required';
  SELECT COALESCE((value::text)::int, 30) INTO v_max_cars FROM platform_settings WHERE key = 'max_cars_allowed';
  SELECT COALESCE((value::text)::numeric, 120) INTO v_rate FROM platform_settings WHERE key = 'rate_per_car';
  SELECT COALESCE((value::text)::int, 7) INTO v_min_days FROM platform_settings WHERE key = 'min_assignment_days';
  SELECT COALESCE((value::text)::int, 30) INTO v_max_days FROM platform_settings WHERE key = 'max_assignment_days';

  v_min_cars := GREATEST(COALESCE(v_min_cars, 0), 0);
  v_max_cars := GREATEST(COALESCE(v_max_cars, 30), GREATEST(v_min_cars, 1));
  p_cars := GREATEST(COALESCE(p_cars, GREATEST(v_min_cars, 1)), 1);

  IF p_cars > v_max_cars THEN RAISE EXCEPTION 'Cars must be at most %', v_max_cars; END IF;
  IF p_duration < v_min_days OR p_duration > v_max_days THEN RAISE EXCEPTION 'Duration must be %-% days', v_min_days, v_max_days; END IF;

  SELECT home_lat, home_lng, trim(home_area) INTO v_lat, v_lng, v_home_area
  FROM partners WHERE id = auth.uid();

  FOR v_date IN SELECT generate_series(CURRENT_DATE, CURRENT_DATE + (p_duration - 1), interval '1 day')::date LOOP
    IF extract(dow FROM v_date) <> 1 THEN v_days := v_days + 1; END IF;
  END LOOP;

  IF v_home_area IS NULL OR length(v_home_area) = 0 THEN
    RETURN QUERY SELECT 0, p_duration, v_days, 0::numeric, 0::numeric, 0::numeric, 0::numeric,
      '07:00'::text, '10:00'::text, 0, 'Select your work area first.'::text,
      NULL::uuid, NULL::text, false, 0, 0::numeric, 0;
    RETURN;
  END IF;

  IF v_lat IS NULL OR v_lng IS NULL THEN
    v_lat := 26.8467; v_lng := 80.9462;
  END IF;

  SELECT * INTO v_cov FROM get_coverage_at(v_lat, v_lng) LIMIT 1;
  IF v_cov.matched THEN
    v_zone_id := v_cov.zone_id;
    v_zone_name := v_cov.zone_name;
    v_ds_open := COALESCE(v_cov.daily_shine, false);
    SELECT * INTO v_cap FROM get_zone_capacity(v_zone_id, CURRENT_DATE) LIMIT 1;
    IF v_cap.daily_capacity IS NOT NULL THEN
      v_zone_remaining := COALESCE(v_cap.remaining, 0);
      v_zone_pct := COALESCE(v_cap.used_pct, 0);
    END IF;
  END IF;

  SELECT COUNT(*)::int INTO v_ds_demand
  FROM customers c
  JOIN services s ON s.customer_id = c.id
  WHERE lower(trim(c.area)) = lower(v_home_area)
    AND s.status::text IN ('pending','scheduled')
    AND s.scheduled_date >= CURRENT_DATE
    AND s.scheduled_date <= CURRENT_DATE + (p_duration - 1);

  WITH available AS (
    SELECT DISTINCT ON (c.id)
      c.id,
      COALESCE(haversine_km(v_lat, v_lng, c.latitude, c.longitude), 0) AS dist_km
    FROM customers c
    JOIN vehicles v ON v.customer_id = c.id
    WHERE c.is_active = true
      AND lower(trim(c.area)) = lower(v_home_area)
      AND NOT EXISTS (
        SELECT 1 FROM assignments a2
        JOIN services s2 ON s2.assignment_id = a2.id AND s2.customer_id = c.id
        WHERE a2.status = 'active' AND a2.end_date >= CURRENT_DATE
      )
    ORDER BY c.id, COALESCE(haversine_km(v_lat, v_lng, c.latitude, c.longitude), 999999), v.created_at DESC
  )
  SELECT count(*)::int, LEAST(count(*)::int, p_cars), COALESCE(max(ranked.dist_km) FILTER (WHERE ranked.rn <= p_cars), 0)
    INTO v_available, v_found, v_max_d
  FROM (SELECT available.*, row_number() OVER (ORDER BY available.dist_km ASC) AS rn FROM available) ranked;

  RETURN QUERY SELECT
    v_found, p_duration, v_days,
    (v_found * v_rate)::numeric,
    (v_found * v_rate * v_days)::numeric,
    round(v_max_d, 1)::numeric,
    GREATEST(round((v_found * 0.15)::numeric, 1), CASE WHEN v_found > 0 THEN 1.0 ELSE 0 END),
    (CASE
      WHEN COALESCE(NULLIF(v_found, 0), p_cars) <= 19 THEN '07:00'
      WHEN COALESCE(NULLIF(v_found, 0), p_cars) <= 24 THEN '06:30'
      WHEN COALESCE(NULLIF(v_found, 0), p_cars) <= 29 THEN '06:00'
      ELSE '05:30'
    END)::text,
    '10:00'::text,
    v_available,
    (CASE
      WHEN v_available = 0 THEN 'No customers available in this area.'
      WHEN v_available < p_cars THEN 'Only ' || v_available || ' customers available.'
      WHEN v_found < GREATEST(v_min_cars, 1) THEN 'Minimum ' || v_min_cars || ' customers required.'
      ELSE NULL
    END)::text,
    v_zone_id, v_zone_name, v_ds_open,
    v_zone_remaining, v_zone_pct, v_ds_demand;
END
$function$;

GRANT EXECUTE ON FUNCTION public.preview_assignment(integer, integer) TO authenticated, service_role;
