ALTER PUBLICATION supabase_realtime ADD TABLE public.assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.services;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.partners;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_ledger;

CREATE OR REPLACE FUNCTION public.submit_service_unavailable(p_service_id uuid, p_reason text, p_notes text, p_photo text, p_lat numeric, p_lng numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_partner UUID := auth.uid();
  v_balance NUMERIC;
  v_credit NUMERIC := 12;
  v_updated int;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_photo IS NULL OR length(trim(p_photo)) = 0 THEN RAISE EXCEPTION 'Photo required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'Reason required'; END IF;

  UPDATE public.services SET
    status = 'unavailable',
    unavailable_reason = p_reason,
    unavailable_notes = NULLIF(p_notes, ''),
    unavailable_photo = p_photo,
    unavailable_lat = NULLIF(p_lat, 0),
    unavailable_lng = NULLIF(p_lng, 0),
    completed_at = now()
  WHERE id = p_service_id
    AND partner_id = v_partner
    AND status IN ('pending', 'in_progress');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Service not found, already closed, or not assigned to you';
  END IF;

  SELECT COALESCE(balance_after, 0) INTO v_balance
    FROM public.wallet_ledger WHERE partner_id = v_partner
    ORDER BY created_at DESC LIMIT 1;
  v_balance := COALESCE(v_balance, 0) + v_credit;

  INSERT INTO public.wallet_ledger(partner_id, entry_type, amount, balance_after, description, service_id)
  VALUES (v_partner, 'earning', v_credit, v_balance, 'Customer unavailable visit', p_service_id);

  RETURN jsonb_build_object('ok', true, 'credited', v_credit);
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
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_partner_id IS NULL THEN RAISE EXCEPTION 'Partner required'; END IF;
  IF p_customer_ids IS NULL OR array_length(p_customer_ids,1) IS NULL THEN
    RAISE EXCEPTION 'Select at least one customer';
  END IF;
  IF p_duration < 1 OR p_duration > 60 THEN RAISE EXCEPTION 'Duration must be 1-60 days'; END IF;

  SELECT count(*) INTO v_existing
  FROM public.assignments
  WHERE partner_id = p_partner_id AND status='active' AND end_date >= CURRENT_DATE;
  IF v_existing > 0 THEN RAISE EXCEPTION 'Partner already has an active assignment'; END IF;

  SELECT count(DISTINCT s.customer_id) INTO v_reserved
  FROM public.assignments a
  JOIN public.services s ON s.assignment_id = a.id
  WHERE a.status = 'active'
    AND a.end_date >= CURRENT_DATE
    AND s.customer_id = ANY(p_customer_ids)
    AND s.partner_id IS NOT NULL;
  IF v_reserved > 0 THEN RAISE EXCEPTION '% selected customer(s) are already assigned', v_reserved; END IF;

  SELECT home_area INTO v_partner_area FROM public.partners WHERE id = p_partner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partner not found'; END IF;

  v_end := v_start + (p_duration - 1);
  SELECT count(DISTINCT c.id) INTO v_count
  FROM public.customers c
  JOIN public.vehicles v ON v.customer_id = c.id
  WHERE c.id = ANY(p_customer_ids) AND c.is_active = true;
  IF v_count = 0 THEN RAISE EXCEPTION 'No active customers with vehicles selected'; END IF;

  SELECT count(*) INTO v_working_days
  FROM generate_series(v_start, v_end, interval '1 day') g
  WHERE extract(dow FROM g) <> 1;

  INSERT INTO public.assignments (
    partner_id, area, target_cars, status, rate_per_car,
    estimated_earnings, estimated_hours, estimated_distance_km, search_radius_km,
    scheduled_date, duration_days, start_date, end_date, working_days,
    expected_start_time, total_earnings
  ) VALUES (
    p_partner_id, COALESCE(NULLIF(v_partner_area, ''), 'Manual'), v_count, 'active', v_rate,
    v_count * v_rate, GREATEST(round((v_count * 0.15)::numeric,1), 1.0), 0, 0,
    v_start, p_duration, v_start, v_end, v_working_days,
    '07:00', v_count * v_rate * v_working_days
  )
  RETURNING id INTO v_assignment;

  FOR work_day IN SELECT generate_series(v_start, v_end, interval '1 day')::date LOOP
    IF extract(dow FROM work_day) = 1 THEN CONTINUE; END IF;
    seq := 0;
    FOR r IN
      SELECT DISTINCT ON (c.id) c.id AS customer_id, v.id AS vehicle_id, c.preferred_time
      FROM public.customers c
      JOIN public.vehicles v ON v.customer_id = c.id
      WHERE c.id = ANY(p_customer_ids) AND c.is_active = true
      ORDER BY c.id, v.created_at DESC
    LOOP
      seq := seq + 1;
      INSERT INTO public.services (partner_id, customer_id, vehicle_id, assignment_id,
                            scheduled_date, time_slot, sequence_no, rate_per_car, status)
      VALUES (p_partner_id, r.customer_id, r.vehicle_id, v_assignment,
              work_day, COALESCE(r.preferred_time, '06:00 - 09:00'), seq, v_rate, 'pending');
    END LOOP;
  END LOOP;

  UPDATE public.partners SET cars_selected = v_count, rate_per_car = v_rate WHERE id = p_partner_id;
  RETURN v_assignment;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_update_customer(p_id uuid, p_full_name text, p_phone text, p_area text, p_address_line text, p_pincode text, p_latitude numeric, p_longitude numeric, p_subscription_plan text, p_subscription_start date, p_subscription_end date, p_preferred_time text, p_service_required_before text, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
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