
-- 1. Extend assignments for multi-day duration
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS duration_days int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS start_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS end_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS working_days int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS expected_start_time text NOT NULL DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS total_earnings numeric NOT NULL DEFAULT 0;

-- 2. Service analytics
CREATE TABLE IF NOT EXISTS public.service_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  area text,
  travel_seconds int NOT NULL DEFAULT 0,
  cleaning_seconds int NOT NULL DEFAULT 0,
  total_seconds int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_id)
);
GRANT SELECT, INSERT, UPDATE ON public.service_analytics TO authenticated;
GRANT ALL ON public.service_analytics TO service_role;
ALTER TABLE public.service_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partner rw own analytics" ON public.service_analytics
  FOR ALL TO authenticated USING (partner_id = auth.uid()) WITH CHECK (partner_id = auth.uid());

-- 3. Dirty vehicle reports
CREATE TABLE IF NOT EXISTS public.dirty_vehicle_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  reason text NOT NULL,
  notes text,
  photo_front text,
  photo_rear text,
  photo_left text,
  photo_right text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.dirty_vehicle_reports TO authenticated;
GRANT ALL ON public.dirty_vehicle_reports TO service_role;
ALTER TABLE public.dirty_vehicle_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partner rw own dirty reports" ON public.dirty_vehicle_reports
  FOR ALL TO authenticated USING (partner_id = auth.uid()) WITH CHECK (partner_id = auth.uid());

-- 4. Parking reports
CREATE TABLE IF NOT EXISTS public.parking_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  reason text NOT NULL,
  notes text,
  photo_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.parking_reports TO authenticated;
GRANT ALL ON public.parking_reports TO service_role;
ALTER TABLE public.parking_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partner rw own parking reports" ON public.parking_reports
  FOR ALL TO authenticated USING (partner_id = auth.uid()) WITH CHECK (partner_id = auth.uid());

-- 5. Unavailability penalties
CREATE TABLE IF NOT EXISTS public.unavailability_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  for_date date NOT NULL DEFAULT CURRENT_DATE,
  penalty_amount numeric NOT NULL DEFAULT 250,
  day_earnings_lost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.unavailability_penalties TO authenticated;
GRANT ALL ON public.unavailability_penalties TO service_role;
ALTER TABLE public.unavailability_penalties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partner read own penalties" ON public.unavailability_penalties
  FOR SELECT TO authenticated USING (partner_id = auth.uid());

-- 6. Preview RPC
CREATE OR REPLACE FUNCTION public.preview_assignment(p_cars int, p_duration int)
RETURNS TABLE(
  cars int, duration_days int, working_days int,
  daily_earnings numeric, total_earnings numeric,
  estimated_radius_km numeric, estimated_hours numeric,
  expected_start_time text, expected_end_time text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lat numeric; v_lng numeric;
  v_radius numeric := 1; v_found int := 0; v_max_d numeric := 0;
  v_days int := 0; d date;
BEGIN
  IF p_cars < 15 OR p_cars > 30 THEN RAISE EXCEPTION 'Cars must be 15-30'; END IF;
  IF p_duration < 7 OR p_duration > 30 THEN RAISE EXCEPTION 'Duration must be 7-30'; END IF;

  SELECT home_lat, home_lng INTO v_lat, v_lng FROM partners WHERE id = auth.uid();
  IF v_lat IS NULL THEN v_lat := 26.8467; v_lng := 80.9462; END IF;

  WHILE v_found < p_cars AND v_radius <= 5 LOOP
    SELECT count(*), COALESCE(max(public.haversine_km(v_lat, v_lng, c.latitude, c.longitude)), 0)
      INTO v_found, v_max_d
    FROM customers c
    WHERE c.is_active = true
      AND public.haversine_km(v_lat, v_lng, c.latitude, c.longitude) <= v_radius;
    IF v_found < p_cars THEN
      v_radius := CASE v_radius WHEN 1 THEN 2 WHEN 2 THEN 3 WHEN 3 THEN 5 ELSE 6 END;
    END IF;
  END LOOP;

  -- Working days: exclude Mondays (dow=1)
  FOR d IN SELECT generate_series(CURRENT_DATE, CURRENT_DATE + (p_duration - 1), interval '1 day')::date LOOP
    IF extract(dow FROM d) <> 1 THEN v_days := v_days + 1; END IF;
  END LOOP;

  RETURN QUERY SELECT
    p_cars,
    p_duration,
    v_days,
    (p_cars * 17)::numeric,
    (p_cars * 17 * v_days)::numeric,
    LEAST(v_radius, 5)::numeric,
    GREATEST(round((p_cars * 0.15)::numeric, 1), 1.0),
    CASE
      WHEN p_cars <= 19 THEN '07:00'
      WHEN p_cars <= 24 THEN '06:30'
      WHEN p_cars <= 29 THEN '06:00'
      ELSE '05:30'
    END,
    '10:00';
END $$;

GRANT EXECUTE ON FUNCTION public.preview_assignment(int, int) TO authenticated;

-- 7. Accept v2 — locks customer set for duration, generates services for working days
CREATE OR REPLACE FUNCTION public.accept_assignment_v2(p_cars int, p_duration int)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_lat numeric; v_lng numeric;
  v_radius numeric := 1; v_found int := 0;
  v_assignment uuid; v_area text; v_existing int;
  v_start date := CURRENT_DATE; v_end date;
  v_start_time text; v_total_d numeric := 0;
  r record; d date; seq int;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_cars < 15 OR p_cars > 30 THEN RAISE EXCEPTION 'Cars must be 15-30'; END IF;
  IF p_duration < 7 OR p_duration > 30 THEN RAISE EXCEPTION 'Duration must be 7-30'; END IF;

  SELECT count(*) INTO v_existing FROM assignments
   WHERE partner_id = v_partner AND status = 'active' AND end_date >= CURRENT_DATE;
  IF v_existing > 0 THEN RAISE EXCEPTION 'You already have an active assignment'; END IF;

  SELECT home_lat, home_lng INTO v_lat, v_lng FROM partners WHERE id = v_partner;
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
      AND public.haversine_km(v_lat, v_lng, c.latitude, c.longitude) <= v_radius
      AND NOT EXISTS (
        SELECT 1 FROM assignments a2
        JOIN services s2 ON s2.assignment_id = a2.id AND s2.customer_id = c.id
        WHERE a2.status = 'active' AND a2.end_date >= CURRENT_DATE
      )
    ORDER BY
      -- priority: preferred time bucket (earlier first), then distance
      c.preferred_time NULLS LAST,
      public.haversine_km(v_lat, v_lng, c.latitude, c.longitude) ASC
    LIMIT p_cars;
    SELECT count(*) INTO v_found FROM tmp_picks;
    IF v_found < p_cars THEN
      v_radius := CASE v_radius WHEN 1 THEN 2 WHEN 2 THEN 3 WHEN 3 THEN 5 ELSE 6 END;
    END IF;
  END LOOP;

  IF v_found = 0 THEN RAISE EXCEPTION 'No customers available near you'; END IF;

  SELECT t.area INTO v_area FROM tmp_picks t GROUP BY t.area ORDER BY count(*) DESC LIMIT 1;
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
    v_start_time,
    0
  )
  RETURNING id INTO v_assignment;

  -- generate services for each working day (skip Mondays)
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
END $$;

GRANT EXECUTE ON FUNCTION public.accept_assignment_v2(int, int) TO authenticated;

-- 8. Cancel assignment with penalty
CREATE OR REPLACE FUNCTION public.cancel_assignment(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_day_earnings numeric := 0;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT COALESCE(count(*) * 17, 0) INTO v_day_earnings
  FROM services
  WHERE assignment_id = p_assignment_id
    AND scheduled_date = CURRENT_DATE
    AND status = 'pending';

  INSERT INTO unavailability_penalties (partner_id, assignment_id, for_date, penalty_amount, day_earnings_lost)
  VALUES (v_partner, p_assignment_id, CURRENT_DATE, 250, v_day_earnings);

  -- free remaining services for reassignment
  UPDATE services SET partner_id = NULL, status = 'pending'
  WHERE assignment_id = p_assignment_id
    AND scheduled_date >= CURRENT_DATE
    AND status = 'pending'
    AND partner_id = v_partner;

  UPDATE assignments SET status = 'cancelled', completed_at = now()
  WHERE id = p_assignment_id AND partner_id = v_partner;
END $$;

GRANT EXECUTE ON FUNCTION public.cancel_assignment(uuid) TO authenticated;
