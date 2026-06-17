CREATE OR REPLACE FUNCTION public.admin_mark_monthly_wash(p_customer_id uuid, p_kind text, p_done_date date, p_partner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_kind = 'interior' THEN
    UPDATE public.customers
      SET interior_wash_done_date = p_done_date,
          interior_wash_partner_id = p_partner_id,
          updated_at = now()
      WHERE id = p_customer_id;
  ELSIF p_kind = 'exterior' THEN
    UPDATE public.customers
      SET exterior_wash_done_date = p_done_date,
          exterior_wash_partner_id = p_partner_id,
          updated_at = now()
      WHERE id = p_customer_id;
  ELSE
    RAISE EXCEPTION 'kind must be interior or exterior';
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_extend_customer(p_customer_id uuid, p_days integer, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prev DATE;
  v_new DATE;
BEGIN
  IF p_days = 0 THEN RAISE EXCEPTION 'Days must be non-zero'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  SELECT subscription_end INTO v_prev FROM public.customers WHERE id = p_customer_id;
  IF v_prev IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;

  v_new := v_prev + p_days;

  UPDATE public.customers
    SET subscription_end = v_new,
        is_active = CASE WHEN v_new >= CURRENT_DATE THEN true ELSE is_active END,
        updated_at = now()
    WHERE id = p_customer_id;

  INSERT INTO public.subscription_extensions(customer_id, days, reason, previous_end, new_end, created_by)
  VALUES (p_customer_id, p_days, p_reason, v_prev, v_new, auth.uid());

  RETURN jsonb_build_object('ok', true, 'previous_end', v_prev, 'new_end', v_new);
END $function$;

CREATE OR REPLACE FUNCTION public.admin_update_customer(p_id uuid, p_full_name text, p_phone text, p_area text, p_address_line text, p_pincode text, p_latitude numeric, p_longitude numeric, p_subscription_plan text, p_subscription_start date, p_subscription_end date, p_preferred_time text, p_service_required_before text, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.customers SET
    full_name = COALESCE(NULLIF(p_full_name, ''), full_name),
    phone = COALESCE(NULLIF(p_phone, ''), phone),
    area = COALESCE(NULLIF(p_area, ''), area),
    address_line = COALESCE(NULLIF(p_address_line, ''), address_line),
    pincode = COALESCE(NULLIF(p_pincode, ''), pincode),
    latitude = COALESCE(p_latitude, latitude),
    longitude = COALESCE(p_longitude, longitude),
    subscription_plan = COALESCE(NULLIF(p_subscription_plan, '')::subscription_plan, subscription_plan),
    subscription_start = COALESCE(p_subscription_start, subscription_start),
    subscription_end = COALESCE(p_subscription_end, subscription_end),
    preferred_time = COALESCE(NULLIF(p_preferred_time, ''), preferred_time),
    service_required_before = NULLIF(p_service_required_before, ''),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_id;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_create_manual_assignment(p_partner_id uuid, p_customer_ids uuid[], p_duration integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_assignment uuid;
  v_start date := CURRENT_DATE;
  v_end date;
  v_partner_area text;
  v_rate numeric := 17;
  v_count int;
  v_existing int;
  v_reserved int;
  v_working_days int;
  r record;
  work_day date;
  seq int;
BEGIN
  IF p_partner_id IS NULL THEN RAISE EXCEPTION 'Partner required'; END IF;
  IF p_customer_ids IS NULL OR array_length(p_customer_ids,1) IS NULL THEN RAISE EXCEPTION 'Select at least one customer'; END IF;
  IF p_duration < 1 OR p_duration > 60 THEN RAISE EXCEPTION 'Duration must be 1-60 days'; END IF;

  SELECT count(*) INTO v_existing FROM public.assignments WHERE partner_id = p_partner_id AND status='active' AND end_date >= CURRENT_DATE;
  IF v_existing > 0 THEN RAISE EXCEPTION 'Partner already has an active assignment'; END IF;

  SELECT count(DISTINCT s.customer_id) INTO v_reserved
  FROM public.assignments a JOIN public.services s ON s.assignment_id = a.id
  WHERE a.status = 'active' AND a.end_date >= CURRENT_DATE AND s.customer_id = ANY(p_customer_ids) AND s.partner_id IS NOT NULL;
  IF v_reserved > 0 THEN RAISE EXCEPTION '% selected customer(s) are already assigned', v_reserved; END IF;

  SELECT home_area INTO v_partner_area FROM public.partners WHERE id = p_partner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partner not found'; END IF;

  v_end := v_start + (p_duration - 1);
  SELECT count(DISTINCT c.id) INTO v_count FROM public.customers c JOIN public.vehicles v ON v.customer_id = c.id WHERE c.id = ANY(p_customer_ids) AND c.is_active = true;
  IF v_count = 0 THEN RAISE EXCEPTION 'No active customers with vehicles selected'; END IF;

  SELECT count(*) INTO v_working_days FROM generate_series(v_start, v_end, interval '1 day') g WHERE extract(dow FROM g) <> 1;

  INSERT INTO public.assignments (partner_id, area, target_cars, status, rate_per_car, estimated_earnings, estimated_hours, estimated_distance_km, search_radius_km, scheduled_date, duration_days, start_date, end_date, working_days, expected_start_time, total_earnings)
  VALUES (p_partner_id, COALESCE(NULLIF(v_partner_area, ''), 'Manual'), v_count, 'active', v_rate, v_count * v_rate, GREATEST(round((v_count * 0.15)::numeric,1), 1.0), 0, 0, v_start, p_duration, v_start, v_end, v_working_days, '07:00', v_count * v_rate * v_working_days)
  RETURNING id INTO v_assignment;

  FOR work_day IN SELECT generate_series(v_start, v_end, interval '1 day')::date LOOP
    IF extract(dow FROM work_day) = 1 THEN CONTINUE; END IF;
    seq := 0;
    FOR r IN SELECT DISTINCT ON (c.id) c.id AS customer_id, v.id AS vehicle_id, c.preferred_time FROM public.customers c JOIN public.vehicles v ON v.customer_id = c.id WHERE c.id = ANY(p_customer_ids) AND c.is_active = true ORDER BY c.id, v.created_at DESC LOOP
      seq := seq + 1;
      INSERT INTO public.services (partner_id, customer_id, vehicle_id, assignment_id, scheduled_date, time_slot, sequence_no, rate_per_car, status)
      VALUES (p_partner_id, r.customer_id, r.vehicle_id, v_assignment, work_day, COALESCE(r.preferred_time, '06:00 - 09:00'), seq, v_rate, 'pending');
    END LOOP;
  END LOOP;

  UPDATE public.partners SET cars_selected = v_count, rate_per_car = v_rate WHERE id = p_partner_id;
  RETURN v_assignment;
END $function$;