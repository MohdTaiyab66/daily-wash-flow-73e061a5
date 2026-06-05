
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS home_lat numeric,
  ADD COLUMN IF NOT EXISTS home_lng numeric,
  ADD COLUMN IF NOT EXISTS home_area text,
  ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'Bronze',
  ADD COLUMN IF NOT EXISTS attendance_pct numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS aadhaar_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pan_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bank_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS training_completion_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_earnings numeric NOT NULL DEFAULT 0;

ALTER TABLE public.partners ALTER COLUMN rate_per_car SET DEFAULT 17;
UPDATE public.partners SET rate_per_car = 17 WHERE rate_per_car = 80;
UPDATE public.partners SET home_lat = 26.8467, home_lng = 80.9462, home_area = 'Hazratganj' WHERE home_lat IS NULL;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS preferred_time text NOT NULL DEFAULT '06:00 - 09:00';

DO $$
DECLARE
  areas text[] := ARRAY['Indira Nagar','Gomti Nagar','Hazratganj','Aliganj','Mahanagar','Jankipuram','Vikas Nagar'];
  centers numeric[][] := ARRAY[
    ARRAY[26.8779::numeric, 80.9896::numeric],
    ARRAY[26.8485::numeric, 80.9469::numeric],
    ARRAY[26.8519::numeric, 80.9432::numeric],
    ARRAY[26.8920::numeric, 80.9427::numeric],
    ARRAY[26.8833::numeric, 80.9530::numeric],
    ARRAY[26.9234::numeric, 80.9210::numeric],
    ARRAY[26.8556::numeric, 80.9100::numeric]
  ];
  pincodes text[] := ARRAY['226016','226010','226001','226024','226006','226021','226022'];
  makes text[] := ARRAY['Maruti','Hyundai','Tata','Honda','Toyota','Kia','MG','Mahindra'];
  models text[] := ARRAY['Swift','i20','Nexon','City','Innova','Seltos','Hector','XUV300'];
  colors text[] := ARRAY['White','Silver','Red','Grey','Black','Blue'];
  times text[] := ARRAY['06:00 - 07:00','07:00 - 08:00','08:00 - 09:00','06:30 - 07:30','07:30 - 08:30'];
  i int; ai int; cid uuid; lat numeric; lng numeric;
BEGIN
  FOR i IN 1..120 LOOP
    ai := 1 + (i % 7);
    lat := centers[ai][1] + ((random()-0.5)*0.04);
    lng := centers[ai][2] + ((random()-0.5)*0.04);
    INSERT INTO public.customers
      (full_name, phone, address_line, area, city, pincode, latitude, longitude,
       subscription_plan, subscription_start, subscription_end, is_active, preferred_time)
    VALUES
      ('Customer ' || (1000+i),
       '9' || lpad((100000000 + (random()*899999999)::int)::text, 9, '0'),
       'House ' || (10+i) || ', Sector ' || (1 + (i%9)),
       areas[ai], 'Lucknow', pincodes[ai], lat, lng,
       'daily_shine_monthly', CURRENT_DATE - 5, CURRENT_DATE + 90, true,
       times[1 + (i % 5)])
    RETURNING id INTO cid;

    INSERT INTO public.vehicles (customer_id, make, model, color, registration_number, parking_notes)
    VALUES (cid, makes[1 + (i % 8)], models[1 + (i % 8)], colors[1 + (i % 6)],
            'UP32' || chr(65 + (i%26)) || chr(65 + ((i/26)::int % 26)) || lpad(((i*7) % 9999)::text,4,'0'),
            'Park near gate; key with guard');
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  area text NOT NULL,
  target_cars int NOT NULL,
  fulfilled_cars int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  rate_per_car numeric NOT NULL DEFAULT 17,
  estimated_earnings numeric NOT NULL,
  estimated_hours numeric NOT NULL,
  estimated_distance_km numeric NOT NULL,
  search_radius_km numeric NOT NULL DEFAULT 1,
  scheduled_date date NOT NULL DEFAULT CURRENT_DATE,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.assignments TO authenticated;
GRANT ALL ON public.assignments TO service_role;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner read own assignments" ON public.assignments FOR SELECT TO authenticated USING (partner_id = auth.uid());
CREATE POLICY "partner insert own assignments" ON public.assignments FOR INSERT TO authenticated WITH CHECK (partner_id = auth.uid());
CREATE POLICY "partner update own assignments" ON public.assignments FOR UPDATE TO authenticated USING (partner_id = auth.uid());

ALTER TABLE public.services ADD COLUMN IF NOT EXISTS assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.haversine_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT (6371 * 2 * asin(sqrt(
    power(sin(radians(($3 - $1)/2)), 2) +
    cos(radians($1)) * cos(radians($3)) * power(sin(radians(($4 - $2)/2)), 2)
  )))::numeric;
$$;

DROP FUNCTION IF EXISTS public.list_assignment_offers();
CREATE OR REPLACE FUNCTION public.list_assignment_offers()
RETURNS TABLE(area text, target_cars int, estimated_earnings numeric,
              estimated_hours numeric, estimated_distance_km numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lat numeric; v_lng numeric;
BEGIN
  SELECT home_lat, home_lng INTO v_lat, v_lng FROM partners WHERE id = auth.uid();
  IF v_lat IS NULL THEN v_lat := 26.8467; v_lng := 80.9462; END IF;

  RETURN QUERY
  WITH nearby AS (
    SELECT c.area, public.haversine_km(v_lat, v_lng, c.latitude, c.longitude) AS d
    FROM customers c
    WHERE c.is_active = true
      AND NOT EXISTS (SELECT 1 FROM services s WHERE s.customer_id = c.id
                       AND s.scheduled_date = CURRENT_DATE AND s.partner_id IS NOT NULL)
  ),
  ranked AS (
    SELECT n.area AS a, count(*) AS available
    FROM nearby n GROUP BY n.area
    HAVING count(*) >= 15
    ORDER BY avg(n.d) ASC LIMIT 1
  )
  SELECT r.a, t.target,
         (t.target * 17)::numeric,
         (t.target * 0.2)::numeric,
         GREATEST(round((t.target * 0.1)::numeric, 1), 1.0)
  FROM ranked r CROSS JOIN (VALUES (15),(20),(25)) AS t(target)
  WHERE r.available >= t.target;
END $$;

DROP FUNCTION IF EXISTS public.accept_assignment(int);
CREATE OR REPLACE FUNCTION public.accept_assignment(p_target_cars int)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_lat numeric; v_lng numeric;
  v_radius numeric := 1;
  v_found int := 0;
  v_assignment uuid;
  v_area text;
  v_total_d numeric := 0;
  r record; seq int := 0; v_existing int;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_target_cars NOT IN (15,20,25) THEN RAISE EXCEPTION 'Invalid size'; END IF;

  SELECT count(*) INTO v_existing FROM assignments
   WHERE partner_id = v_partner AND scheduled_date = CURRENT_DATE AND status = 'active';
  IF v_existing > 0 THEN RAISE EXCEPTION 'You already have an active assignment for today'; END IF;

  SELECT home_lat, home_lng INTO v_lat, v_lng FROM partners WHERE id = v_partner;
  IF v_lat IS NULL THEN v_lat := 26.8467; v_lng := 80.9462; END IF;

  CREATE TEMP TABLE tmp_picks (customer_id uuid, vehicle_id uuid, d numeric, area text, preferred_time text) ON COMMIT DROP;

  WHILE v_found < p_target_cars AND v_radius <= 5 LOOP
    DELETE FROM tmp_picks;
    INSERT INTO tmp_picks
    SELECT c.id, v.id, public.haversine_km(v_lat, v_lng, c.latitude, c.longitude), c.area, c.preferred_time
    FROM customers c JOIN vehicles v ON v.customer_id = c.id
    WHERE c.is_active = true
      AND public.haversine_km(v_lat, v_lng, c.latitude, c.longitude) <= v_radius
      AND NOT EXISTS (SELECT 1 FROM services s WHERE s.customer_id = c.id AND s.scheduled_date = CURRENT_DATE AND s.partner_id IS NOT NULL)
    ORDER BY public.haversine_km(v_lat, v_lng, c.latitude, c.longitude) ASC
    LIMIT p_target_cars;
    SELECT count(*) INTO v_found FROM tmp_picks;
    IF v_found < p_target_cars THEN
      IF v_radius = 1 THEN v_radius := 2;
      ELSIF v_radius = 2 THEN v_radius := 3;
      ELSIF v_radius = 3 THEN v_radius := 5;
      ELSE EXIT; END IF;
    END IF;
  END LOOP;

  IF v_found = 0 THEN RAISE EXCEPTION 'No customers available near you'; END IF;

  SELECT t.area INTO v_area FROM tmp_picks t GROUP BY t.area ORDER BY count(*) DESC LIMIT 1;
  SELECT round(sum(t.d)::numeric * 1.4, 1) INTO v_total_d FROM tmp_picks t;

  INSERT INTO assignments (partner_id, area, target_cars, status, rate_per_car,
                           estimated_earnings, estimated_hours, estimated_distance_km, search_radius_km)
  VALUES (v_partner, v_area, v_found, 'active', 17,
          v_found * 17, round((v_found * 0.2)::numeric, 1), v_total_d, v_radius)
  RETURNING id INTO v_assignment;

  FOR r IN SELECT * FROM tmp_picks ORDER BY d ASC LOOP
    seq := seq + 1;
    INSERT INTO services (partner_id, customer_id, vehicle_id, assignment_id,
                          scheduled_date, time_slot, sequence_no, rate_per_car, status)
    VALUES (v_partner, r.customer_id, r.vehicle_id, v_assignment,
            CURRENT_DATE, r.preferred_time, seq, 17, 'pending');
  END LOOP;

  UPDATE partners SET cars_selected = v_found, rate_per_car = 17 WHERE id = v_partner;

  RETURN v_assignment;
END $$;

GRANT EXECUTE ON FUNCTION public.list_assignment_offers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_assignment(int) TO authenticated;
