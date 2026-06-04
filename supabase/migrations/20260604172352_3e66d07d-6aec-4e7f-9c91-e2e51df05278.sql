
-- Available customers (no active partner assigned in services for today)
CREATE OR REPLACE FUNCTION public.list_available_customers()
RETURNS TABLE (
  customer_id uuid,
  full_name text,
  area text,
  address_line text,
  pincode text,
  latitude numeric,
  longitude numeric,
  vehicle_id uuid,
  make text,
  model text,
  registration_number text,
  color text,
  parking_notes text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.full_name, c.area, c.address_line, c.pincode, c.latitude, c.longitude,
         v.id, v.make, v.model, v.registration_number, v.color, v.parking_notes
  FROM customers c
  JOIN vehicles v ON v.customer_id = c.id
  WHERE c.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM services s
      WHERE s.customer_id = c.id
        AND s.scheduled_date >= CURRENT_DATE
        AND s.partner_id IS NOT NULL
    )
  ORDER BY c.area, c.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.list_available_customers() TO authenticated, anon;

-- Claim a customer: creates 30 daily services assigned to calling partner
CREATE OR REPLACE FUNCTION public.claim_customer(p_customer_id uuid, p_rate numeric DEFAULT 80)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vehicle uuid;
  v_partner uuid := auth.uid();
  v_count int := 0;
  v_existing int;
BEGIN
  IF v_partner IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_vehicle FROM vehicles WHERE customer_id = p_customer_id LIMIT 1;
  IF v_vehicle IS NULL THEN
    RAISE EXCEPTION 'No vehicle for customer';
  END IF;

  SELECT count(*) INTO v_existing FROM services
   WHERE customer_id = p_customer_id AND scheduled_date >= CURRENT_DATE AND partner_id IS NOT NULL;
  IF v_existing > 0 THEN
    RAISE EXCEPTION 'Already claimed';
  END IF;

  INSERT INTO services (partner_id, customer_id, vehicle_id, scheduled_date, time_slot, rate_per_car, status)
  SELECT v_partner, p_customer_id, v_vehicle, (CURRENT_DATE + g), '06:00 - 09:00', p_rate, 'pending'
  FROM generate_series(0, 29) g;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE partners SET cars_selected = cars_selected + 1, rate_per_car = p_rate WHERE id = v_partner;

  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.claim_customer(uuid, numeric) TO authenticated;

-- Admin read: aggregate counts via service_role only (no broad anon policy)
-- (admin dashboard uses server functions w/ supabaseAdmin)
