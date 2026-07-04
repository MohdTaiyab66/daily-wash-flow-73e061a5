-- ============================================================================
-- Phase 1: Coverage Manager as single source of truth
-- ============================================================================

-- 1. Ray-cast point-in-polygon over a JSONB polygon shaped as [[lng,lat], ...]
CREATE OR REPLACE FUNCTION public.polygon_contains_point(
  p_polygon jsonb,
  p_lat double precision,
  p_lng double precision
) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  n int;
  i int := 0;
  j int;
  inside boolean := false;
  xi double precision; yi double precision;
  xj double precision; yj double precision;
BEGIN
  IF p_polygon IS NULL OR jsonb_typeof(p_polygon) <> 'array' THEN RETURN false; END IF;
  n := jsonb_array_length(p_polygon);
  IF n < 3 THEN RETURN false; END IF;
  j := n - 1;
  WHILE i < n LOOP
    xi := (p_polygon->i->>0)::double precision;  -- lng
    yi := (p_polygon->i->>1)::double precision;  -- lat
    xj := (p_polygon->j->>0)::double precision;
    yj := (p_polygon->j->>1)::double precision;
    IF ((yi > p_lat) <> (yj > p_lat))
       AND (p_lng < (xj - xi) * (p_lat - yi) / NULLIF((yj - yi), 0) + xi) THEN
      inside := NOT inside;
    END IF;
    j := i;
    i := i + 1;
  END LOOP;
  RETURN inside;
END $$;

-- 2. Rewrite get_coverage_at — real polygon check for polygon zones
CREATE OR REPLACE FUNCTION public.get_coverage_at(p_lat double precision, p_lng double precision)
RETURNS TABLE(matched boolean, status text, zone_id uuid, zone_name text,
  daily_shine boolean, premium boolean, washing boolean, interior boolean,
  exterior boolean, int_ext boolean, deep_clean boolean, polish boolean,
  cutter_polish boolean, roof_cleaning boolean, seat_cleaning boolean,
  corporate_fleet boolean, emergency boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE z record; m record;
BEGIN
  SELECT * INTO z FROM coverage_zones cz
  WHERE cz.status IN ('active','paused')
    AND (cz.bbox_min_lat IS NULL OR p_lat BETWEEN cz.bbox_min_lat AND cz.bbox_max_lat)
    AND (cz.bbox_min_lng IS NULL OR p_lng BETWEEN cz.bbox_min_lng AND cz.bbox_max_lng)
    AND (
      (cz.zone_type = 'polygon'
        AND cz.polygon IS NOT NULL
        AND public.polygon_contains_point(cz.polygon, p_lat, p_lng))
      OR (cz.zone_type = 'radius' AND cz.center_lat IS NOT NULL
          AND 6371000 * 2 * asin(sqrt(
            sin(radians((p_lat - cz.center_lat)/2))^2
            + cos(radians(cz.center_lat)) * cos(radians(p_lat))
              * sin(radians((p_lng - cz.center_lng)/2))^2
          )) <= cz.radius_m)
    )
  ORDER BY cz.priority DESC LIMIT 1;

  IF z.id IS NULL THEN matched := false; RETURN NEXT; RETURN; END IF;
  SELECT * INTO m FROM zone_calendar_mask(z.id, CURRENT_DATE);
  matched := true; status := z.status;
  zone_id := z.id; zone_name := z.name;
  daily_shine := z.daily_shine_enabled AND z.status='active' AND m.daily_shine_on
                 AND is_daily_shine_open(z.id, CURRENT_DATE);
  premium := z.premium_enabled AND z.status='active' AND m.premium_on;
  washing := z.washing_enabled AND premium;
  interior := z.interior_enabled AND premium;
  exterior := z.exterior_enabled AND premium;
  int_ext := z.int_ext_enabled AND premium;
  deep_clean := z.deep_clean_enabled AND premium;
  polish := z.polish_enabled AND premium;
  cutter_polish := z.cutter_polish_enabled AND premium;
  roof_cleaning := z.roof_cleaning_enabled AND premium;
  seat_cleaning := z.seat_cleaning_enabled AND premium;
  corporate_fleet := z.corporate_fleet_enabled AND premium;
  emergency := z.emergency_enabled AND premium;
  RETURN NEXT;
END $$;

-- 3. Serviceability guard — raises when a service can't be sold at that point.
-- Slug is mapped to the same flag surface used by area-availability.ts.
CREATE OR REPLACE FUNCTION public.assert_serviceable(
  p_lat double precision, p_lng double precision, p_slug text
) RETURNS uuid
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE c record; ok boolean;
BEGIN
  SELECT * INTO c FROM public.get_coverage_at(p_lat, p_lng);
  IF NOT COALESCE(c.matched, false) THEN
    RAISE EXCEPTION 'Not serviceable at this location' USING ERRCODE = 'P0001';
  END IF;
  ok := CASE lower(coalesce(p_slug,''))
    WHEN 'daily-shine' THEN c.daily_shine
    WHEN 'premium' THEN c.premium
    WHEN 'washing' THEN c.washing
    WHEN 'interior' THEN c.interior
    WHEN 'exterior' THEN c.exterior
    WHEN 'int-ext' THEN c.int_ext
    WHEN 'deep-clean' THEN c.deep_clean
    WHEN 'polish' THEN c.polish
    WHEN 'cutter-polish' THEN c.cutter_polish
    WHEN 'roof-cleaning' THEN c.roof_cleaning
    WHEN 'seat-cleaning' THEN c.seat_cleaning
    WHEN 'corporate-fleet' THEN c.corporate_fleet
    WHEN 'emergency' THEN c.emergency
    ELSE c.premium
  END;
  IF NOT ok THEN
    RAISE EXCEPTION '% is not enabled in %', p_slug, coalesce(c.zone_name,'this area') USING ERRCODE = 'P0001';
  END IF;
  RETURN c.zone_id;
END $$;

GRANT EXECUTE ON FUNCTION public.assert_serviceable(double precision, double precision, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.polygon_contains_point(jsonb, double precision, double precision) TO anon, authenticated;

-- 4. Partner ↔ Zone binding
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS home_zone_id uuid REFERENCES public.coverage_zones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS partners_home_zone_id_idx ON public.partners(home_zone_id);

-- 5. Helper: is a customer point inside a given zone?
CREATE OR REPLACE FUNCTION public.point_in_zone(
  p_zone_id uuid, p_lat double precision, p_lng double precision
) RETURNS boolean
LANGUAGE plpgsql STABLE PARALLEL SAFE
SET search_path = public
AS $$
DECLARE z record;
BEGIN
  IF p_zone_id IS NULL OR p_lat IS NULL OR p_lng IS NULL THEN RETURN false; END IF;
  SELECT * INTO z FROM public.coverage_zones WHERE id = p_zone_id;
  IF z.id IS NULL THEN RETURN false; END IF;
  IF z.bbox_min_lat IS NOT NULL AND (p_lat NOT BETWEEN z.bbox_min_lat AND z.bbox_max_lat
     OR p_lng NOT BETWEEN z.bbox_min_lng AND z.bbox_max_lng) THEN
    RETURN false;
  END IF;
  IF z.zone_type = 'polygon' THEN
    RETURN public.polygon_contains_point(z.polygon, p_lat, p_lng);
  ELSIF z.zone_type = 'radius' AND z.center_lat IS NOT NULL THEN
    RETURN 6371000 * 2 * asin(sqrt(
      sin(radians((p_lat - z.center_lat)/2))^2
      + cos(radians(z.center_lat)) * cos(radians(p_lat))
        * sin(radians((p_lng - z.center_lng)/2))^2
    )) <= z.radius_m;
  END IF;
  RETURN false;
END $$;

GRANT EXECUTE ON FUNCTION public.point_in_zone(uuid, double precision, double precision) TO authenticated, service_role;

-- 6. set_partner_area: server-side zone validation + zone binding
CREATE OR REPLACE FUNCTION public.set_partner_area(p_area text, p_lat numeric, p_lng numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_current text;
  v_locked date;
  v_lock_days int;
  v_cov record;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT home_area, area_locked_until INTO v_current, v_locked
  FROM public.partners WHERE id = v_partner;

  SELECT COALESCE((value::text)::int, 0) INTO v_lock_days
  FROM public.platform_settings WHERE key = 'area_lock_days';
  v_lock_days := COALESCE(v_lock_days, 0);

  IF v_lock_days > 0 AND v_current IS NOT NULL AND v_current <> p_area
     AND v_locked IS NOT NULL AND v_locked > CURRENT_DATE THEN
    RAISE EXCEPTION 'Area is locked until %', v_locked;
  END IF;

  -- Server-side coverage validation: partner GPS must fall inside an active zone.
  SELECT * INTO v_cov FROM public.get_coverage_at(p_lat::double precision, p_lng::double precision);
  IF NOT COALESCE(v_cov.matched, false) OR v_cov.status <> 'active' THEN
    RAISE EXCEPTION 'This location is not in an active service zone' USING ERRCODE = 'P0001';
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
    home_zone_id = v_cov.zone_id,
    area_locked_until = CASE WHEN v_lock_days > 0 THEN CURRENT_DATE + v_lock_days ELSE NULL END,
    area_change_count = area_change_count + CASE WHEN v_current IS NOT NULL AND v_current IS DISTINCT FROM p_area THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE id = v_partner;
END $$;

-- 7. accept_assignment_v2: filter customers by polygon of partner's home zone.
--    Text-area match is retained as fallback when partner has no bound zone
--    (existing partners keep working until they re-set their area).
CREATE OR REPLACE FUNCTION public.accept_assignment_v2(p_cars integer, p_duration integer)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_lat numeric; v_lng numeric; v_home_area text; v_first_done boolean;
  v_home_zone uuid;
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

  SELECT home_lat, home_lng, trim(home_area), first_assignment_completed, home_zone_id
    INTO v_lat, v_lng, v_home_area, v_first_done, v_home_zone
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

  v_end := public.working_days_end_date(v_start, p_duration, v_off);
  v_calendar_days := (v_end - v_start) + 1;

  v_start_time := CASE
    WHEN p_cars <= 15 THEN '06:30'
    WHEN p_cars <= 22 THEN '06:15'
    WHEN p_cars <= 29 THEN '06:00'
    ELSE '05:30'
  END;

  CREATE TEMP TABLE tmp_picks (customer_id uuid PRIMARY KEY, vehicle_id uuid, distance_km numeric, area text, preferred_time text) ON COMMIT DROP;

  -- Prefer polygon containment when partner is bound to a zone;
  -- fall back to text-area match otherwise (compat for legacy partners).
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
      AND (
        (v_home_zone IS NOT NULL
          AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
          AND public.point_in_zone(v_home_zone, c.latitude::double precision, c.longitude::double precision))
        OR (v_home_zone IS NULL AND lower(trim(c.area)) = lower(v_home_area))
      )
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

  SELECT count(*),
         COALESCE(round(sum(NULLIF(distance_km, 999999))::numeric * 1.4, 1), 0),
         COALESCE(round(max(NULLIF(distance_km, 999999))::numeric, 1), 0)
    INTO v_found, v_total_d, v_radius
  FROM tmp_picks;

  IF v_found = 0 THEN
    RAISE EXCEPTION 'No customers available in your zone (%). Ask admin to import more or use manual assignment.', v_home_area;
  END IF;

  INSERT INTO public.assignments (partner_id, area, target_cars, status, rate_per_car, estimated_earnings, estimated_hours, estimated_distance_km, search_radius_km, scheduled_date, duration_days, start_date, end_date, working_days, expected_start_time, total_earnings, original_duration_days)
  VALUES (v_partner, v_home_area, v_found, 'active', v_rate, v_found * v_rate,
          GREATEST(1, ceil(v_found::numeric / 5)), v_total_d, v_radius,
          v_start, v_calendar_days, v_start, v_end, 0, v_start_time, 0, p_duration)
  RETURNING id INTO v_assignment;

  FOR work_day IN SELECT generate_series(v_start, v_end, interval '1 day')::date LOOP
    IF extract(dow FROM work_day)::int = v_off THEN CONTINUE; END IF;
    v_working_days := v_working_days + 1;
    seq := 0;
    FOR r IN SELECT * FROM tmp_picks ORDER BY distance_km ASC LOOP
      seq := seq + 1;
      v_covered := public.customer_has_pro_booking_on(r.customer_id, work_day);
      INSERT INTO public.services (
        assignment_id, partner_id, customer_id, vehicle_id,
        scheduled_date, sequence, status, rate_per_car, preferred_time,
        delay_reason, completed_at
      ) VALUES (
        v_assignment, v_partner, r.customer_id, r.vehicle_id,
        work_day, seq,
        CASE WHEN v_covered THEN 'covered_by_booking' ELSE 'pending' END,
        CASE WHEN v_covered THEN 0 ELSE v_rate END,
        r.preferred_time,
        CASE WHEN v_covered THEN 'covered_by_booking' ELSE NULL END,
        NULL
      );
    END LOOP;
  END LOOP;

  UPDATE public.assignments SET working_days = v_working_days WHERE id = v_assignment;

  RETURN v_assignment;
END $$;
