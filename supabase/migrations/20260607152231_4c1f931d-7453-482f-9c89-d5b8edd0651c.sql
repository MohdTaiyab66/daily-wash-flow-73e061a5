
-- 1. Admin role system
CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'partner');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. Platform settings
CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_settings TO authenticated, anon;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "everyone reads settings" ON public.platform_settings FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "admins write settings" ON public.platform_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.platform_settings (key, value, description) VALUES
  ('rate_per_car', '17', 'Payout per completed car (INR)'),
  ('unavailable_compensation', '12', 'Compensation when vehicle unavailable (INR)'),
  ('hold_amount_days', '15', 'Days of earnings held as security for new partners'),
  ('cancel_penalty', '250', 'Penalty for cancelling assignment mid-way (INR)'),
  ('area_lock_days', '2', 'Days before partner can change their work area'),
  ('min_assignment_days_new', '15', 'Minimum assignment duration for new partners (days)'),
  ('min_assignment_days', '7', 'Minimum assignment duration for veteran partners (days)'),
  ('max_assignment_days', '30', 'Maximum assignment duration (days)'),
  ('referral_partner_reward', '500', 'Reward when a referred partner completes first assignment (INR)'),
  ('referral_customer_reward', '100', 'Reward when a referred customer subscribes (INR)');

-- 3. Area lock
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS previous_area text,
  ADD COLUMN IF NOT EXISTS area_locked_until date,
  ADD COLUMN IF NOT EXISTS area_change_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS first_assignment_completed boolean NOT NULL DEFAULT false;

CREATE TABLE public.area_change_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid REFERENCES public.partners(id) ON DELETE CASCADE NOT NULL,
  from_area text,
  to_area text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.area_change_history TO authenticated;
GRANT ALL ON public.area_change_history TO service_role;
ALTER TABLE public.area_change_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partners read own area history" ON public.area_change_history FOR SELECT TO authenticated USING (partner_id = auth.uid());
CREATE POLICY "admins read all area history" ON public.area_change_history FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4. set_partner_area RPC
CREATE OR REPLACE FUNCTION public.set_partner_area(p_area text, p_lat numeric, p_lng numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_current text;
  v_locked date;
  v_lock_days int;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT home_area, area_locked_until INTO v_current, v_locked FROM partners WHERE id = v_partner;
  SELECT (value::text)::int INTO v_lock_days FROM platform_settings WHERE key = 'area_lock_days';

  IF v_current IS NOT NULL AND v_current <> p_area AND v_locked IS NOT NULL AND v_locked > CURRENT_DATE THEN
    RAISE EXCEPTION 'Area is locked until %', v_locked;
  END IF;

  IF v_current IS DISTINCT FROM p_area THEN
    INSERT INTO area_change_history (partner_id, from_area, to_area) VALUES (v_partner, v_current, p_area);
    UPDATE partners SET
      previous_area = v_current,
      home_area = p_area,
      home_lat = p_lat,
      home_lng = p_lng,
      area_locked_until = CURRENT_DATE + v_lock_days,
      area_change_count = area_change_count + CASE WHEN v_current IS NULL THEN 0 ELSE 1 END
    WHERE id = v_partner;
  END IF;
END $$;

-- 5. accept_assignment_v2: enforce first-assignment minimum + prefer home area
CREATE OR REPLACE FUNCTION public.accept_assignment_v2(p_cars integer, p_duration integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_lat numeric; v_lng numeric; v_home_area text; v_first_done boolean;
  v_radius numeric := 1; v_found int := 0;
  v_assignment uuid; v_area text; v_existing int;
  v_start date := CURRENT_DATE; v_end date;
  v_start_time text; v_total_d numeric := 0;
  r record; d date; seq int;
  v_min_new int; v_min int; v_max int;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT (value::text)::int INTO v_min_new FROM platform_settings WHERE key = 'min_assignment_days_new';
  SELECT (value::text)::int INTO v_min FROM platform_settings WHERE key = 'min_assignment_days';
  SELECT (value::text)::int INTO v_max FROM platform_settings WHERE key = 'max_assignment_days';

  IF p_cars < 15 OR p_cars > 30 THEN RAISE EXCEPTION 'Cars must be 15-30'; END IF;

  SELECT home_lat, home_lng, home_area, first_assignment_completed
    INTO v_lat, v_lng, v_home_area, v_first_done FROM partners WHERE id = v_partner;

  IF v_home_area IS NULL THEN RAISE EXCEPTION 'Please select your work area first'; END IF;

  IF NOT v_first_done THEN
    IF p_duration < v_min_new THEN RAISE EXCEPTION 'First assignment must be at least % days', v_min_new; END IF;
  ELSE
    IF p_duration < v_min OR p_duration > v_max THEN RAISE EXCEPTION 'Duration must be %-% days', v_min, v_max; END IF;
  END IF;

  SELECT count(*) INTO v_existing FROM assignments
   WHERE partner_id = v_partner AND status = 'active' AND end_date >= CURRENT_DATE;
  IF v_existing > 0 THEN RAISE EXCEPTION 'You already have an active assignment'; END IF;

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
      CASE WHEN c.area = v_home_area THEN 0 ELSE 1 END,
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
    v_start_time, 0
  )
  RETURNING id INTO v_assignment;

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

-- 6. Seed Lucknow demo customers
WITH new_customers AS (
  INSERT INTO public.customers (full_name, phone, area, address_line, pincode, latitude, longitude, preferred_time, is_active)
  SELECT t.full_name, t.phone, t.area, t.address_line, t.pincode, t.lat, t.lng, t.pref, true
  FROM (VALUES
    ('Aarav Sharma', '9000000101', 'Indira Nagar', 'A-12 Sector 14', '226016', 26.8783::numeric, 80.9989::numeric, '06:00 - 09:00'),
    ('Vikas Mishra', '9000000102', 'Indira Nagar', 'B-45 Sector 9',  '226016', 26.8809, 80.9941, '06:00 - 09:00'),
    ('Priya Singh',  '9000000103', 'Indira Nagar', 'C-78 Ring Road', '226016', 26.8765, 81.0023, '06:00 - 09:00'),
    ('Rohit Verma',  '9000000104', 'Gomti Nagar',  'Vipul Khand 2',  '226010', 26.8467, 81.0023, '06:00 - 09:00'),
    ('Anjali Yadav', '9000000105', 'Gomti Nagar',  'Vipin Khand',    '226010', 26.8501, 81.0098, '06:00 - 09:00'),
    ('Saurabh Joshi','9000000106', 'Gomti Nagar',  'Vishesh Khand',  '226010', 26.8523, 81.0067, '06:00 - 09:00'),
    ('Neha Tiwari',  '9000000107', 'Gomti Nagar Extension', 'Sector 6', '226010', 26.8889, 81.0234, '06:00 - 09:00'),
    ('Manish Gupta', '9000000108', 'Gomti Nagar Extension', 'Sector 7', '226010', 26.8923, 81.0301, '06:00 - 09:00'),
    ('Pooja Pandey', '9000000109', 'Aliganj',      'Sector D',       '226024', 26.8956, 80.9456, '06:00 - 09:00'),
    ('Karan Kapoor', '9000000110', 'Aliganj',      'Sector E',       '226024', 26.8989, 80.9489, '06:00 - 09:00'),
    ('Divya Mehta',  '9000000111', 'Jankipuram',   'Sector F',       '226021', 26.9234, 80.9189, '06:00 - 09:00'),
    ('Rahul Saxena', '9000000112', 'Jankipuram',   'Sector G',       '226021', 26.9267, 80.9223, '06:00 - 09:00'),
    ('Sneha Nair',   '9000000113', 'Hazratganj',   'MG Road',        '226001', 26.8489, 80.9450, '06:00 - 09:00'),
    ('Amit Bhatia',  '9000000114', 'Hazratganj',   'Park Road',      '226001', 26.8512, 80.9478, '06:00 - 09:00'),
    ('Riya Khanna',  '9000000115', 'Vikas Nagar',  'Sector 12',      '226022', 26.9012, 80.9012, '06:00 - 09:00'),
    ('Arjun Rao',    '9000000116', 'Vikas Nagar',  'Sector 14',      '226022', 26.9045, 80.9034, '06:00 - 09:00'),
    ('Kavya Iyer',   '9000000117', 'Ashiyana',     'Sector H',       '226012', 26.7989, 80.9089, '06:00 - 09:00'),
    ('Dev Patel',    '9000000118', 'Ashiyana',     'Sector J',       '226012', 26.8012, 80.9112, '06:00 - 09:00'),
    ('Tanya Bose',   '9000000119', 'Rajajipuram',  'C-Block',        '226017', 26.8312, 80.8723, '06:00 - 09:00'),
    ('Yash Malhotra','9000000120', 'Rajajipuram',  'D-Block',        '226017', 26.8345, 80.8756, '06:00 - 09:00'),
    ('Ishaan Reddy', '9000000121', 'Alambagh',     'Kanpur Road',    '226005', 26.8089, 80.8889, '06:00 - 09:00'),
    ('Meera Das',    '9000000122', 'Alambagh',     'Awadh Hospital', '226005', 26.8112, 80.8912, '06:00 - 09:00'),
    ('Aditya Rana',  '9000000123', 'Mahanagar',    'A Block',        '226006', 26.8856, 80.9523, '06:00 - 09:00'),
    ('Sara Khan',    '9000000124', 'Mahanagar',    'C Block',        '226006', 26.8889, 80.9556, '06:00 - 09:00')
  ) AS t(full_name, phone, area, address_line, pincode, lat, lng, pref)
  WHERE NOT EXISTS (SELECT 1 FROM public.customers WHERE phone = t.phone)
  RETURNING id
)
INSERT INTO public.vehicles (customer_id, make, model, registration_number, color, parking_notes)
SELECT id,
  (ARRAY['Maruti','Hyundai','Honda','Tata','Toyota'])[1 + floor(random()*5)::int],
  (ARRAY['Swift','i20','City','Nexon','Innova'])[1 + floor(random()*5)::int],
  'UP32' || upper(substr(md5(id::text), 1, 2)) || lpad((1000 + floor(random()*8999)::int)::text, 4, '0'),
  (ARRAY['White','Silver','Grey','Black','Red'])[1 + floor(random()*5)::int],
  'Stilt parking · ground floor'
FROM new_customers;
