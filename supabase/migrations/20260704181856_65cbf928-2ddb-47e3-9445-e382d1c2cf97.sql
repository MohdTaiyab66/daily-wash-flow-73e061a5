
-- 1) Helper: end date such that (start..end) inclusive contains exactly N non-off-day working days.
CREATE OR REPLACE FUNCTION public.working_days_end_date(p_start date, p_working int, p_off_dow int DEFAULT 1)
RETURNS date
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_date date := p_start;
  v_count int := 0;
BEGIN
  IF p_working IS NULL OR p_working <= 0 THEN RETURN p_start; END IF;
  LOOP
    IF extract(dow FROM v_date)::int <> p_off_dow THEN
      v_count := v_count + 1;
      IF v_count >= p_working THEN RETURN v_date; END IF;
    END IF;
    v_date := v_date + 1;
    IF v_date - p_start > 400 THEN RETURN v_date; END IF; -- safety
  END LOOP;
END $$;

-- 2) Booking-conflict helper: is there a same-day booking for this customer that
-- covers a professional Interior/Exterior/Deep Clean/Premium service?
CREATE OR REPLACE FUNCTION public.customer_has_pro_booking_on(p_customer_id uuid, p_date date)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.bookings b
      JOIN public.service_catalog sc ON sc.id = b.service_id
      JOIN public.customer_profiles cp ON cp.user_id = b.user_id
      JOIN public.customers c
        ON c.id = p_customer_id
       AND (
            (c.phone IS NOT NULL AND cp.phone IS NOT NULL AND c.phone = cp.phone)
         OR (c.email IS NOT NULL AND cp.email IS NOT NULL AND lower(c.email) = lower(cp.email))
       )
     WHERE b.scheduled_date = p_date
       AND b.status NOT IN ('cancelled','failed')
       AND sc.category IN ('one_time','deep_clean','premium')
  );
$$;

-- 3) accept_assignment_v2 — treat p_duration as WORKING DAYS.
CREATE OR REPLACE FUNCTION public.accept_assignment_v2(p_cars integer, p_duration integer)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
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
  v_off int := 1;
  v_off_name text;
  v_calendar_days int;
  v_covered boolean;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT COALESCE((value::text)::int, 15) INTO v_min_new FROM public.platform_settings WHERE key = 'min_assignment_days_new';
  SELECT COALESCE((value::text)::int, 7)  INTO v_min_days FROM public.platform_settings WHERE key = 'min_assignment_days';
  SELECT COALESCE((value::text)::int, 30) INTO v_max_days FROM public.platform_settings WHERE key = 'max_assignment_days';
  SELECT COALESCE((value::text)::int, 0)  INTO v_min_cars FROM public.platform_settings WHERE key = 'min_cars_required';
  SELECT COALESCE((value::text)::int, 30) INTO v_max_cars FROM public.platform_settings WHERE key = 'max_cars_allowed';
  SELECT COALESCE((value::text)::numeric, 17) INTO v_rate  FROM public.platform_settings WHERE key = 'rate_per_car';
  SELECT lower(trim(both '"' from value::text)) INTO v_off_name FROM public.platform_settings WHERE key='weekly_off_day';
  v_off := CASE COALESCE(v_off_name,'monday')
    WHEN 'sunday' THEN 0 WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2
    WHEN 'wednesday' THEN 3 WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5
    WHEN 'saturday' THEN 6 ELSE 1 END;

  v_min_cars := GREATEST(COALESCE(v_min_cars, 0), 0);
  v_max_cars := GREATEST(COALESCE(v_max_cars, 30), GREATEST(v_min_cars, 1));
  p_cars := GREATEST(COALESCE(p_cars, GREATEST(v_min_cars, 1)), 1);

  IF p_cars > v_max_cars THEN RAISE EXCEPTION 'Cars must be at most %', v_max_cars; END IF;

  SELECT home_lat, home_lng, trim(home_area), first_assignment_completed
    INTO v_lat, v_lng, v_home_area, v_first_done
  FROM public.partners WHERE id = v_partner;

  IF v_home_area IS NULL OR length(v_home_area) = 0 THEN
    RAISE EXCEPTION 'Select your work area first';
  END IF;

  IF NOT COALESCE(v_first_done, false) THEN
    IF p_duration < v_min_new OR p_duration > v_max_days THEN
      RAISE EXCEPTION 'First assignment must be %-% working days', v_min_new, v_max_days;
    END IF;
  ELSE
    IF p_duration < v_min_days OR p_duration > v_max_days THEN
      RAISE EXCEPTION 'Duration must be %-% working days', v_min_days, v_max_days;
    END IF;
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

  -- end_date = date on which we reach exactly p_duration working days
  v_end := public.working_days_end_date(v_start, p_duration, v_off);
  v_calendar_days := (v_end - v_start) + 1;

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

  INSERT INTO public.assignments (partner_id, area, target_cars, status, rate_per_car, estimated_earnings, estimated_hours, estimated_distance_km, search_radius_km, scheduled_date, duration_days, start_date, end_date, working_days, expected_start_time, total_earnings, original_duration_days)
  VALUES (v_partner, v_home_area, v_found, 'active', v_rate, v_found * v_rate, GREATEST(1, ceil(v_found::numeric / 5)), v_total_d, v_radius, v_start, v_calendar_days, v_start, v_end, 0, v_start_time, 0, p_duration)
  RETURNING id INTO v_assignment;

  FOR work_day IN SELECT generate_series(v_start, v_end, interval '1 day')::date LOOP
    IF extract(dow FROM work_day)::int = v_off THEN CONTINUE; END IF;
    seq := 0;
    -- order by preferred window so early "Before 07:00" precedes "Before 10:00"
    FOR r IN
      SELECT * FROM tmp_picks
      ORDER BY COALESCE(preferred_time, '99:99') ASC, distance_km ASC
    LOOP
      seq := seq + 1;
      v_covered := public.customer_has_pro_booking_on(r.customer_id, work_day);
      BEGIN
        INSERT INTO public.services (partner_id, customer_id, vehicle_id, assignment_id, scheduled_date, time_slot, sequence_no, rate_per_car, status, completed_at, delay_reason)
        VALUES (
          v_partner, r.customer_id, r.vehicle_id, v_assignment, work_day,
          COALESCE(r.preferred_time, '06:00 - 09:00'), seq,
          CASE WHEN v_covered THEN 0 ELSE v_rate END,
          CASE WHEN v_covered THEN 'completed' ELSE 'pending' END,
          CASE WHEN v_covered THEN (work_day::timestamptz) ELSE NULL END,
          CASE WHEN v_covered THEN 'covered_by_booking' ELSE NULL END
        );
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
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

-- 4) preview_assignment — treat p_duration as working days.
CREATE OR REPLACE FUNCTION public.preview_assignment(p_cars integer, p_duration integer)
RETURNS TABLE(cars integer, duration_days integer, working_days integer, daily_earnings numeric, total_earnings numeric, estimated_radius_km numeric, estimated_hours numeric, expected_start_time text, expected_end_time text, available_customers integer, message text, zone_id uuid, zone_name text, daily_shine_open boolean, zone_capacity_remaining integer, zone_used_pct numeric, daily_shine_demand integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_lat numeric; v_lng numeric; v_home_area text;
  v_found int := 0; v_available int := 0; v_max_d numeric := 0;
  v_working int; v_cal_days int; v_end date;
  v_min_cars int := 0; v_max_cars int := 30; v_rate numeric := 120;
  v_min_days int := 7; v_max_days int := 30;
  v_cov record; v_cap record;
  v_zone_id uuid; v_zone_name text; v_ds_open boolean := false;
  v_zone_remaining int := 0; v_zone_pct numeric := 0;
  v_ds_demand int := 0;
  v_off int := 1; v_off_name text;
BEGIN
  SELECT COALESCE((value::text)::int, 0) INTO v_min_cars FROM platform_settings WHERE key = 'min_cars_required';
  SELECT COALESCE((value::text)::int, 30) INTO v_max_cars FROM platform_settings WHERE key = 'max_cars_allowed';
  SELECT COALESCE((value::text)::numeric, 120) INTO v_rate FROM platform_settings WHERE key = 'rate_per_car';
  SELECT COALESCE((value::text)::int, 7) INTO v_min_days FROM platform_settings WHERE key = 'min_assignment_days';
  SELECT COALESCE((value::text)::int, 30) INTO v_max_days FROM platform_settings WHERE key = 'max_assignment_days';
  SELECT lower(trim(both '"' from value::text)) INTO v_off_name FROM public.platform_settings WHERE key='weekly_off_day';
  v_off := CASE COALESCE(v_off_name,'monday')
    WHEN 'sunday' THEN 0 WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2
    WHEN 'wednesday' THEN 3 WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5
    WHEN 'saturday' THEN 6 ELSE 1 END;

  v_min_cars := GREATEST(COALESCE(v_min_cars, 0), 0);
  v_max_cars := GREATEST(COALESCE(v_max_cars, 30), GREATEST(v_min_cars, 1));
  p_cars := GREATEST(COALESCE(p_cars, GREATEST(v_min_cars, 1)), 1);

  IF p_cars > v_max_cars THEN RAISE EXCEPTION 'Cars must be at most %', v_max_cars; END IF;
  IF p_duration < v_min_days OR p_duration > v_max_days THEN
    RAISE EXCEPTION 'Duration must be %-% working days', v_min_days, v_max_days;
  END IF;

  SELECT home_lat, home_lng, trim(home_area) INTO v_lat, v_lng, v_home_area
  FROM partners WHERE id = auth.uid();

  v_working := p_duration;
  v_end := public.working_days_end_date(CURRENT_DATE, p_duration, v_off);
  v_cal_days := (v_end - CURRENT_DATE) + 1;

  IF v_home_area IS NULL OR length(v_home_area) = 0 THEN
    RETURN QUERY SELECT 0, v_cal_days, v_working, 0::numeric, 0::numeric, 0::numeric, 0::numeric,
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
    AND s.scheduled_date <= v_end;

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
    v_found, v_cal_days, v_working,
    (v_found * v_rate)::numeric,
    (v_found * v_rate * v_working)::numeric,
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

-- 5) generate_services_for_queue — insert covered rows when booking exists,
-- and order by preferred time.
CREATE OR REPLACE FUNCTION public.generate_services_for_queue(p_queue_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  q public.subscription_assignment_queue%ROWTYPE;
  v_a public.assignments%ROWTYPE;
  v_book record;
  v_day date;
  v_dow int;
  v_off int;
  v_off_name text;
  v_slot text;
  v_seq int;
  v_inserted int := 0;
  v_today date := CURRENT_DATE;
  v_covered boolean;
BEGIN
  SELECT * INTO q FROM public.subscription_assignment_queue WHERE id = p_queue_id;
  IF NOT FOUND OR q.status <> 'assigned' OR q.assigned_partner_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_a FROM public.assignments
   WHERE partner_id = q.assigned_partner_id
     AND status = 'active'
     AND end_date >= v_today
   ORDER BY start_date DESC LIMIT 1;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT b.id AS booking_id, b.vehicle_id, b.preferred_before_time, b.user_id
    INTO v_book FROM public.bookings b WHERE b.id = q.booking_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT lower(value::text) INTO v_off_name FROM public.platform_settings WHERE key='weekly_off_day';
  v_off := CASE trim(both '"' from COALESCE(v_off_name,'"monday"'))
    WHEN 'sunday' THEN 0 WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2
    WHEN 'wednesday' THEN 3 WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5
    WHEN 'saturday' THEN 6 ELSE 1 END;

  v_slot := COALESCE(v_book.preferred_before_time, '06:00 - 09:00');

  FOR v_day IN
    SELECT d::date FROM generate_series(GREATEST(v_a.start_date, v_today), v_a.end_date, interval '1 day') d
  LOOP
    v_dow := extract(dow FROM v_day)::int;
    IF v_dow = v_off THEN CONTINUE; END IF;

    SELECT COALESCE(max(sequence_no),0)+1 INTO v_seq
      FROM public.services WHERE assignment_id = v_a.id AND scheduled_date = v_day;

    v_covered := public.customer_has_pro_booking_on(v_book.user_id, v_day);

    BEGIN
      INSERT INTO public.services
        (partner_id, customer_id, vehicle_id, assignment_id, scheduled_date, time_slot, sequence_no, rate_per_car, status, completed_at, delay_reason)
      VALUES
        (q.assigned_partner_id, v_book.user_id, v_book.vehicle_id, v_a.id,
         v_day, v_slot, v_seq,
         CASE WHEN v_covered THEN 0 ELSE v_a.rate_per_car END,
         CASE WHEN v_covered THEN 'completed' ELSE 'pending' END,
         CASE WHEN v_covered THEN (v_day::timestamptz) ELSE NULL END,
         CASE WHEN v_covered THEN 'covered_by_booking' ELSE NULL END);
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END LOOP;

  UPDATE public.subscription_assignment_queue
     SET locked_partner_id = q.assigned_partner_id,
         lock_until = v_a.end_date
   WHERE id = q.id;

  RETURN v_inserted;
END $function$;

-- 6) Trigger: when a booking lands on a date matching Interior/Exterior/Deep Clean/Premium,
-- mark that day's pending Daily Shine service as covered.
CREATE OR REPLACE FUNCTION public.tg_booking_covers_daily_shine()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat text;
BEGIN
  IF NEW.status IN ('cancelled','failed') THEN RETURN NEW; END IF;
  SELECT category::text INTO v_cat FROM public.service_catalog WHERE id = NEW.service_id;
  IF v_cat NOT IN ('one_time','deep_clean','premium') THEN RETURN NEW; END IF;

  UPDATE public.services s
     SET status = 'completed',
         completed_at = COALESCE(s.completed_at, NEW.scheduled_date::timestamptz),
         rate_per_car = 0,
         delay_reason = 'covered_by_booking',
         updated_at = now()
    FROM public.customer_profiles cp
    JOIN public.customers c
      ON (c.phone IS NOT NULL AND cp.phone IS NOT NULL AND c.phone = cp.phone)
      OR (c.email IS NOT NULL AND cp.email IS NOT NULL AND lower(c.email) = lower(cp.email))
   WHERE cp.user_id = NEW.user_id
     AND s.customer_id = c.id
     AND s.scheduled_date = NEW.scheduled_date
     AND s.status IN ('pending','in_progress');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_booking_covers_daily_shine ON public.bookings;
CREATE TRIGGER trg_booking_covers_daily_shine
AFTER INSERT OR UPDATE OF status, scheduled_date, service_id ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.tg_booking_covers_daily_shine();

-- 7) renew_assignments — extend by originally-selected WORKING DAYS.
CREATE OR REPLACE FUNCTION public.renew_assignments()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r record;
  v_default_days int;
  v_added int;
  v_new_end date;
  v_count int := 0;
  v_off int := 1; v_off_name text;
BEGIN
  SELECT COALESCE((value::text)::int, 30) INTO v_default_days
    FROM public.platform_settings WHERE key = 'assignment_default_days';
  SELECT lower(trim(both '"' from value::text)) INTO v_off_name FROM public.platform_settings WHERE key='weekly_off_day';
  v_off := CASE COALESCE(v_off_name,'monday')
    WHEN 'sunday' THEN 0 WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2
    WHEN 'wednesday' THEN 3 WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5
    WHEN 'saturday' THEN 6 ELSE 1 END;

  FOR r IN
    SELECT * FROM public.assignments
     WHERE status = 'active'
       AND auto_renew = true
       AND end_date <= (CURRENT_DATE + 1)
  LOOP
    v_added := GREATEST(1, COALESCE(r.original_duration_days, r.working_days, v_default_days));
    v_new_end := public.working_days_end_date(r.end_date + 1, v_added, v_off);

    UPDATE public.assignments
       SET end_date = v_new_end,
           duration_days = (v_new_end - start_date) + 1,
           updated_at = now()
     WHERE id = r.id;

    UPDATE public.subscription_assignment_queue
       SET lock_until = v_new_end
     WHERE assigned_partner_id = r.partner_id
       AND status = 'assigned'
       AND locked_partner_id IS NOT NULL;

    v_count := v_count + 1;
  END LOOP;

  PERFORM public.generate_daily_routes(CURRENT_DATE + 1);
  RETURN v_count;
END $function$;
