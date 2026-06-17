CREATE OR REPLACE FUNCTION public.preview_assignment(p_cars integer, p_duration integer)
 RETURNS TABLE(cars integer, duration_days integer, working_days integer, daily_earnings numeric, total_earnings numeric, estimated_radius_km numeric, estimated_hours numeric, expected_start_time text, expected_end_time text, available_customers integer, message text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lat numeric; v_lng numeric; v_home_area text;
  v_found int := 0; v_available int := 0; v_max_d numeric := 0;
  v_days int := 0; v_date date;
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

  FOR v_date IN SELECT generate_series(CURRENT_DATE, CURRENT_DATE + (p_duration - 1), interval '1 day')::date LOOP
    IF extract(dow FROM v_date) <> 1 THEN v_days := v_days + 1; END IF;
  END LOOP;

  IF v_home_area IS NULL OR length(v_home_area) = 0 THEN
    RETURN QUERY SELECT 0, p_duration, v_days, 0::numeric, 0::numeric, 0::numeric, 0::numeric, '07:00'::text, '10:00'::text, 0, 'Select your work area first.'::text;
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
      COALESCE(public.haversine_km(v_lat, v_lng, c.latitude, c.longitude), 0) AS dist_km
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
  SELECT count(*)::int, LEAST(count(*)::int, p_cars), COALESCE(max(ranked.dist_km) FILTER (WHERE ranked.rn <= p_cars), 0)
    INTO v_available, v_found, v_max_d
  FROM (
    SELECT available.*, row_number() OVER (ORDER BY available.dist_km ASC) AS rn FROM available
  ) ranked;

  RETURN QUERY SELECT
    v_found,
    p_duration,
    v_days,
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
    END)::text;
END
$function$;