CREATE OR REPLACE FUNCTION public.admin_create_manual_assignment(p_partner_id uuid, p_customer_ids uuid[], p_duration integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_assignment uuid;
  v_start date := CURRENT_DATE;
  v_end date;
  v_partner_area text;
  v_rate numeric := 17;
  v_count int;
  v_reserved int;
  v_working_days int;
  v_total_customers int;
  r record;
  work_day date;
  seq int;
BEGIN
  IF p_partner_id IS NULL THEN RAISE EXCEPTION 'Partner required'; END IF;
  IF p_customer_ids IS NULL OR array_length(p_customer_ids,1) IS NULL THEN RAISE EXCEPTION 'Select at least one customer'; END IF;
  IF p_duration < 1 OR p_duration > 60 THEN RAISE EXCEPTION 'Duration must be 1-60 days'; END IF;

  SELECT home_area INTO v_partner_area FROM public.partners WHERE id = p_partner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partner not found'; END IF;

  SELECT count(DISTINCT s.customer_id) INTO v_reserved
  FROM public.assignments a
  JOIN public.services s ON s.assignment_id = a.id
  WHERE a.status = 'active'
    AND a.end_date >= CURRENT_DATE
    AND s.customer_id = ANY(p_customer_ids)
    AND a.partner_id <> p_partner_id;
  IF v_reserved > 0 THEN RAISE EXCEPTION '% selected customer(s) are already assigned to another partner', v_reserved; END IF;

  SELECT id, start_date, end_date, rate_per_car
    INTO v_assignment, v_start, v_end, v_rate
  FROM public.assignments
  WHERE partner_id = p_partner_id
    AND status = 'active'
    AND end_date >= CURRENT_DATE
  ORDER BY start_date DESC
  LIMIT 1;

  SELECT count(DISTINCT c.id) INTO v_count
  FROM public.customers c
  JOIN public.vehicles v ON v.customer_id = c.id
  WHERE c.id = ANY(p_customer_ids)
    AND c.is_active = true;
  IF v_count = 0 THEN RAISE EXCEPTION 'No active customers with vehicles selected'; END IF;

  IF v_assignment IS NULL THEN
    v_start := CURRENT_DATE;
    v_end := v_start + (p_duration - 1);
    SELECT count(*) INTO v_working_days
    FROM generate_series(v_start, v_end, interval '1 day') g
    WHERE extract(dow FROM g) <> 1;

    INSERT INTO public.assignments (
      partner_id, area, target_cars, status, rate_per_car, estimated_earnings,
      estimated_hours, estimated_distance_km, search_radius_km, scheduled_date,
      duration_days, start_date, end_date, working_days, expected_start_time, total_earnings
    ) VALUES (
      p_partner_id, COALESCE(NULLIF(v_partner_area, ''), 'Manual'), v_count, 'active', v_rate,
      v_count * v_rate, GREATEST(round((v_count * 0.15)::numeric,1), 1.0), 0, 0,
      v_start, p_duration, v_start, v_end, v_working_days, '07:00', v_count * v_rate * v_working_days
    ) RETURNING id INTO v_assignment;
  ELSE
    IF v_start < CURRENT_DATE THEN v_start := CURRENT_DATE; END IF;
    SELECT working_days INTO v_working_days FROM public.assignments WHERE id = v_assignment;
  END IF;

  FOR work_day IN SELECT generate_series(v_start, v_end, interval '1 day')::date LOOP
    IF extract(dow FROM work_day) = 1 THEN CONTINUE; END IF;
    SELECT COALESCE(max(sequence_no), 0) INTO seq
    FROM public.services
    WHERE assignment_id = v_assignment
      AND scheduled_date = work_day;

    FOR r IN
      SELECT DISTINCT ON (c.id)
        c.id AS customer_id,
        v.id AS vehicle_id,
        COALESCE(c.service_required_before, c.preferred_time, '06:00') AS preferred_time
      FROM public.customers c
      JOIN public.vehicles v ON v.customer_id = c.id
      WHERE c.id = ANY(p_customer_ids)
        AND c.is_active = true
      ORDER BY c.id, v.created_at ASC
    LOOP
      IF EXISTS (
        SELECT 1 FROM public.services
        WHERE assignment_id = v_assignment
          AND customer_id = r.customer_id
          AND scheduled_date = work_day
      ) THEN
        CONTINUE;
      END IF;

      seq := seq + 1;
      INSERT INTO public.services (
        partner_id, customer_id, vehicle_id, assignment_id, scheduled_date,
        time_slot, sequence_no, rate_per_car, status
      ) VALUES (
        p_partner_id, r.customer_id, r.vehicle_id, v_assignment, work_day,
        r.preferred_time, seq, v_rate, 'pending'
      );
    END LOOP;
  END LOOP;

  SELECT count(DISTINCT customer_id) INTO v_total_customers
  FROM public.services
  WHERE assignment_id = v_assignment;

  SELECT count(DISTINCT scheduled_date) INTO v_working_days
  FROM public.services
  WHERE assignment_id = v_assignment;

  UPDATE public.assignments
  SET target_cars = COALESCE(v_total_customers, v_count),
      working_days = COALESCE(v_working_days, working_days),
      estimated_earnings = COALESCE(v_total_customers, v_count) * v_rate,
      estimated_hours = GREATEST(round((COALESCE(v_total_customers, v_count) * 0.15)::numeric,1), 1.0),
      total_earnings = COALESCE(v_total_customers, v_count) * v_rate * GREATEST(COALESCE(v_working_days, working_days), 1),
      area = COALESCE(NULLIF(v_partner_area, ''), area)
  WHERE id = v_assignment;

  UPDATE public.partners
  SET cars_selected = COALESCE(v_total_customers, v_count),
      rate_per_car = v_rate
  WHERE id = p_partner_id;

  RETURN v_assignment;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_manual_assignment(uuid, uuid[], integer) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_manual_assignment(uuid, uuid[], integer) TO authenticated, service_role;