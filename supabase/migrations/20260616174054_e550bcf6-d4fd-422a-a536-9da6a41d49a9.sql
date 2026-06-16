
-- Enable trial manual assignment by default for trial mode
UPDATE public.platform_settings SET value = 'true'::jsonb WHERE key = 'trial_manual_assignment_enabled';

-- ============== Manual assignment (admin, bypasses area lock) ==============
CREATE OR REPLACE FUNCTION public.admin_create_manual_assignment(
  p_partner_id uuid,
  p_customer_ids uuid[],
  p_duration int
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment uuid;
  v_start date := CURRENT_DATE;
  v_end date;
  v_partner_area text;
  v_lat numeric; v_lng numeric;
  v_rate numeric := 17;
  v_count int;
  v_existing int;
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
  FROM assignments
  WHERE partner_id = p_partner_id AND status='active' AND end_date >= CURRENT_DATE;
  IF v_existing > 0 THEN RAISE EXCEPTION 'Partner already has an active assignment'; END IF;

  SELECT home_area, home_lat, home_lng INTO v_partner_area, v_lat, v_lng
  FROM partners WHERE id = p_partner_id;

  v_end := v_start + (p_duration - 1);
  v_count := array_length(p_customer_ids, 1);

  INSERT INTO assignments (
    partner_id, area, target_cars, status, rate_per_car,
    estimated_earnings, estimated_hours, estimated_distance_km, search_radius_km,
    scheduled_date, duration_days, start_date, end_date, working_days,
    expected_start_time, total_earnings
  ) VALUES (
    p_partner_id, COALESCE(v_partner_area, 'Manual'), v_count, 'active', v_rate,
    v_count * v_rate, GREATEST(round((v_count * 0.15)::numeric,1), 1.0), 0, 0,
    v_start, p_duration, v_start, v_end,
    (SELECT count(*) FROM generate_series(v_start, v_end, interval '1 day') g WHERE extract(dow FROM g) <> 1),
    '07:00', 0
  )
  RETURNING id INTO v_assignment;

  FOR work_day IN SELECT generate_series(v_start, v_end, interval '1 day')::date LOOP
    IF extract(dow FROM work_day) = 1 THEN CONTINUE; END IF;
    seq := 0;
    FOR r IN
      SELECT DISTINCT ON (c.id) c.id AS customer_id, v.id AS vehicle_id, c.preferred_time
      FROM customers c
      JOIN vehicles v ON v.customer_id = c.id
      WHERE c.id = ANY(p_customer_ids)
      ORDER BY c.id, v.created_at DESC
    LOOP
      seq := seq + 1;
      INSERT INTO services (partner_id, customer_id, vehicle_id, assignment_id,
                            scheduled_date, time_slot, sequence_no, rate_per_car, status)
      VALUES (p_partner_id, r.customer_id, r.vehicle_id, v_assignment,
              work_day, COALESCE(r.preferred_time, '06:00 - 09:00'), seq, v_rate, 'pending');
    END LOOP;
  END LOOP;

  UPDATE assignments SET total_earnings = (
    SELECT count(*) * v_rate FROM services WHERE assignment_id = v_assignment
  ) WHERE id = v_assignment;

  UPDATE partners SET cars_selected = v_count, rate_per_car = v_rate WHERE id = p_partner_id;
  RETURN v_assignment;
END $$;

-- ============== Admin update customer ==============
CREATE OR REPLACE FUNCTION public.admin_update_customer(
  p_id uuid,
  p_full_name text,
  p_phone text,
  p_area text,
  p_address_line text,
  p_pincode text,
  p_latitude numeric,
  p_longitude numeric,
  p_subscription_plan text,
  p_subscription_start date,
  p_subscription_end date,
  p_preferred_time text,
  p_service_required_before text,
  p_is_active boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.customers SET
    full_name = COALESCE(p_full_name, full_name),
    phone = COALESCE(p_phone, phone),
    area = COALESCE(p_area, area),
    address_line = COALESCE(p_address_line, address_line),
    pincode = p_pincode,
    latitude = p_latitude,
    longitude = p_longitude,
    subscription_plan = COALESCE(p_subscription_plan::subscription_plan, subscription_plan),
    subscription_start = COALESCE(p_subscription_start, subscription_start),
    subscription_end = COALESCE(p_subscription_end, subscription_end),
    preferred_time = COALESCE(p_preferred_time, preferred_time),
    service_required_before = p_service_required_before,
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_id;
END $$;

-- ============== Available customers by area (for admin dashboard) ==============
CREATE OR REPLACE FUNCTION public.available_customers_by_area()
RETURNS TABLE(area text, available int, total_active int)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.area,
    count(*) FILTER (
      WHERE c.is_active
        AND NOT EXISTS (
          SELECT 1 FROM assignments a
          JOIN services s ON s.assignment_id = a.id AND s.customer_id = c.id
          WHERE a.status='active' AND a.end_date >= CURRENT_DATE
        )
    )::int AS available,
    count(*) FILTER (WHERE c.is_active)::int AS total_active
  FROM customers c
  GROUP BY c.area
  ORDER BY c.area;
$$;

-- ============== List unassigned customers (for manual assignment picker) ==============
CREATE OR REPLACE FUNCTION public.admin_list_unassigned_customers(p_area text DEFAULT NULL)
RETURNS TABLE(
  id uuid, full_name text, area text, phone text,
  subscription_end date, preferred_time text,
  vehicle_make text, vehicle_model text, registration_number text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (c.id)
    c.id, c.full_name, c.area, c.phone,
    c.subscription_end, c.preferred_time,
    v.make, v.model, v.registration_number
  FROM customers c
  LEFT JOIN vehicles v ON v.customer_id = c.id
  WHERE c.is_active = true
    AND (p_area IS NULL OR lower(trim(c.area)) = lower(trim(p_area)))
    AND NOT EXISTS (
      SELECT 1 FROM assignments a
      JOIN services s ON s.assignment_id = a.id AND s.customer_id = c.id
      WHERE a.status='active' AND a.end_date >= CURRENT_DATE
    )
  ORDER BY c.id, v.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_manual_assignment(uuid, uuid[], int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_customer(uuid,text,text,text,text,text,numeric,numeric,text,date,date,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.available_customers_by_area() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_unassigned_customers(text) TO authenticated;
