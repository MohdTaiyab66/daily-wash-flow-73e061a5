
-- 1. Backfill: delete pending/in_progress services tied to non-active assignments
DELETE FROM public.services s
USING public.assignments a
WHERE s.assignment_id = a.id
  AND a.status <> 'active'
  AND s.status IN ('pending','in_progress')
  AND s.scheduled_date >= CURRENT_DATE;

-- 2. Trigger: when an assignment goes non-active, drop its future pending services
CREATE OR REPLACE FUNCTION public.tg_cleanup_services_on_assignment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'active' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    DELETE FROM public.services
    WHERE assignment_id = NEW.id
      AND status IN ('pending','in_progress')
      AND scheduled_date >= CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_services_on_assignment_change ON public.assignments;
CREATE TRIGGER trg_cleanup_services_on_assignment_change
AFTER UPDATE OF status ON public.assignments
FOR EACH ROW EXECUTE FUNCTION public.tg_cleanup_services_on_assignment_change();

-- 3. Tighten picker in accept_assignment_v2: also exclude customers already
--    holding a non-terminal service on any day in the target window.
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
  v_min_new int; v_min_days int; v_max_days int;
  v_min_cars int := 0; v_max_cars int := 30; v_rate numeric := 17;
  v_working_days int := 0;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT COALESCE((value::text)::int, 15) INTO v_min_new FROM public.platform_settings WHERE key = 'min_assignment_days_new';
  SELECT COALESCE((value::text)::int, 7)  INTO v_min_days FROM public.platform_settings WHERE key = 'min_assignment_days';
  SELECT COALESCE((value::text)::int, 30) INTO v_max_days FROM public.platform_settings WHERE key = 'max_assignment_days';
  SELECT COALESCE((value::text)::int, 0)  INTO v_min_cars FROM public.platform_settings WHERE key = 'min_cars_required';
  SELECT COALESCE((value::text)::int, 30) INTO v_max_cars FROM public.platform_settings WHERE key = 'max_cars_allowed';
  SELECT COALESCE((value::text)::numeric, 17) INTO v_rate  FROM public.platform_settings WHERE key = 'rate_per_car';

  v_min_cars := GREATEST(COALESCE(v_min_cars, 0), 0);
  v_max_cars := GREATEST(COALESCE(v_max_cars, 30), GREATEST(v_min_cars, 1));
  p_cars := GREATEST(COALESCE(p_cars, GREATEST(v_min_cars, 1)), 1);

  IF p_cars > v_max_cars THEN RAISE EXCEPTION 'Cars must be at most %', v_max_cars; END IF;

  SELECT home_lat, home_lng, trim(home_area), first_assignment_completed
    INTO v_lat, v_lng, v_home_area, v_first_done
  FROM public.partners WHERE id = v_partner;

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
      ('Hazratganj', 26.8500::numeric, 80.9450::numeric),
      ('Mahanagar', 26.8850::numeric, 80.9450::numeric)
    ) AS a(name, lat, lng)
    WHERE lower(a.name) = lower(v_home_area);
  END IF;

  v_end := v_start + (p_duration - 1);

  v_start_time := CASE
    WHEN p_cars <= 15 THEN '06:30'
    WHEN p_cars <= 22 THEN '06:15'
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
        SELECT 1 FROM public.assignments a2
        JOIN public.services s2 ON s2.assignment_id = a2.id AND s2.customer_id = c.id
        WHERE a2.status = 'active' AND a2.end_date >= CURRENT_DATE
      )
      -- NEW: also skip customers with any non-terminal service already booked
      -- in our target window, regardless of assignment status. This defends
      -- against the (customer_id, scheduled_date) unique index at insert time.
      AND NOT EXISTS (
        SELECT 1 FROM public.services s3
        WHERE s3.customer_id = c.id
          AND s3.scheduled_date BETWEEN v_start AND v_end
          AND s3.status IN ('pending','in_progress','completed')
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

  INSERT INTO public.assignments (partner_id, area, target_cars, status, rate_per_car, estimated_earnings, estimated_hours, estimated_distance_km, search_radius_km, scheduled_date, duration_days, start_date, end_date, working_days, expected_start_time, total_earnings)
  VALUES (v_partner, v_home_area, v_found, 'active', v_rate, v_found * v_rate, GREATEST(1, ceil(v_found::numeric / 5)), v_total_d, v_radius, v_start, p_duration, v_start, v_end, 0, v_start_time, 0)
  RETURNING id INTO v_assignment;

  FOR work_day IN SELECT generate_series(v_start, v_end, interval '1 day')::date LOOP
    IF extract(dow FROM work_day) = 1 THEN CONTINUE; END IF;
    seq := 0;
    FOR r IN SELECT * FROM tmp_picks ORDER BY distance_km ASC LOOP
      seq := seq + 1;
      INSERT INTO public.services (partner_id, customer_id, vehicle_id, assignment_id, scheduled_date, time_slot, sequence_no, rate_per_car, status)
      VALUES (v_partner, r.customer_id, r.vehicle_id, v_assignment, work_day, COALESCE(r.preferred_time, '06:00 - 09:00'), seq, v_rate, 'pending')
      ON CONFLICT (customer_id, scheduled_date) WHERE status IN ('pending','in_progress','completed') AND customer_id IS NOT NULL DO NOTHING;
    END LOOP;
    v_working_days := v_working_days + 1;
  END LOOP;

  UPDATE public.assignments
     SET working_days = v_working_days,
         total_earnings = v_working_days * v_found * v_rate
   WHERE id = v_assignment;

  RETURN v_assignment;
END;
$function$;
