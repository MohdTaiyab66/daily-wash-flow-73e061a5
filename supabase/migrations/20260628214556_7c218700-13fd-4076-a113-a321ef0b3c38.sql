
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE public.service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  city text NOT NULL DEFAULT 'Lucknow',
  state text NOT NULL DEFAULT 'Uttar Pradesh',
  pincodes text[] NOT NULL DEFAULT '{}',
  center_lat double precision,
  center_lng double precision,
  radius_km double precision NOT NULL DEFAULT 2.5,
  polygon jsonb,
  is_active boolean NOT NULL DEFAULT true,
  daily_shine_enabled boolean NOT NULL DEFAULT false,
  premium_enabled boolean NOT NULL DEFAULT false,
  washing_enabled boolean NOT NULL DEFAULT true,
  interior_enabled boolean NOT NULL DEFAULT true,
  exterior_enabled boolean NOT NULL DEFAULT true,
  deep_clean_enabled boolean NOT NULL DEFAULT true,
  polish_enabled boolean NOT NULL DEFAULT true,
  cutter_polish_enabled boolean NOT NULL DEFAULT true,
  seat_cleaning_enabled boolean NOT NULL DEFAULT true,
  roof_cleaning_enabled boolean NOT NULL DEFAULT true,
  launch_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_areas TO anon, authenticated;
GRANT ALL ON public.service_areas TO service_role;
ALTER TABLE public.service_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_areas readable by anyone" ON public.service_areas FOR SELECT USING (true);
CREATE POLICY "service_areas admin manage" ON public.service_areas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_service_areas_updated BEFORE UPDATE ON public.service_areas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_areas;

CREATE TABLE public.expansion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  phone text, area_name text, pincode text,
  lat double precision, lng double precision,
  interested_service text,
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.expansion_requests TO anon;
GRANT SELECT, INSERT ON public.expansion_requests TO authenticated;
GRANT ALL ON public.expansion_requests TO service_role;
ALTER TABLE public.expansion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expansion_requests insert anyone" ON public.expansion_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "expansion_requests admin read" ON public.expansion_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "expansion_requests admin update" ON public.expansion_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
ALTER PUBLICATION supabase_realtime ADD TABLE public.expansion_requests;

CREATE OR REPLACE FUNCTION public.get_area_availability(
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_pincode text DEFAULT NULL
)
RETURNS TABLE (
  area_id uuid, area_name text, matched boolean, is_active boolean,
  daily_shine boolean, premium boolean,
  washing boolean, interior boolean, exterior boolean, deep_clean boolean,
  polish boolean, cutter_polish boolean, seat_cleaning boolean, roof_cleaning boolean,
  distance_km double precision
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid; v_dist double precision;
  v_row public.service_areas%ROWTYPE;
BEGIN
  IF p_pincode IS NOT NULL AND length(p_pincode) >= 5 THEN
    SELECT id INTO v_id FROM public.service_areas
      WHERE is_active = true AND p_pincode = ANY(pincodes) LIMIT 1;
  END IF;

  IF v_id IS NULL AND p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    SELECT sa.id,
      6371 * acos(greatest(-1, least(1,
        cos(radians(p_lat)) * cos(radians(sa.center_lat)) *
        cos(radians(sa.center_lng) - radians(p_lng)) +
        sin(radians(p_lat)) * sin(radians(sa.center_lat))
      )))
    INTO v_id, v_dist
    FROM public.service_areas sa
    WHERE sa.is_active = true AND sa.center_lat IS NOT NULL
    ORDER BY 2 ASC LIMIT 1;
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.service_areas WHERE id = v_id;
    IF v_dist IS NOT NULL AND v_dist > COALESCE(v_row.radius_km, 2.5) + 1.0 THEN
      v_row.id := NULL;
    END IF;
  END IF;

  IF v_row.id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, false, false, false, false,
      false, false, false, false, false, false, false, false, NULL::double precision;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_row.id, v_row.name, true, v_row.is_active,
    v_row.daily_shine_enabled, v_row.premium_enabled,
    v_row.washing_enabled, v_row.interior_enabled, v_row.exterior_enabled,
    v_row.deep_clean_enabled, v_row.polish_enabled, v_row.cutter_polish_enabled,
    v_row.seat_cleaning_enabled, v_row.roof_cleaning_enabled, v_dist;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_area_availability(double precision, double precision, text) TO anon, authenticated;

INSERT INTO public.service_areas (name, center_lat, center_lng, radius_km, daily_shine_enabled, premium_enabled, is_active) VALUES
  ('Indira Nagar',     26.8783, 80.9989, 3.0, true,  true,  true),
  ('Aliganj',          26.8956, 80.9456, 3.0, true,  true,  true),
  ('Jankipuram',       26.9234, 80.9189, 3.0, true,  true,  true),
  ('Vikas Nagar',      26.9012, 80.9012, 3.0, true,  true,  true),
  ('Kalyanpur',        26.9089, 80.9356, 3.0, true,  true,  true),
  ('Adil Nagar',       26.9156, 80.9512, 2.5, true,  true,  true),
  ('Khurram Nagar',    26.8978, 80.9712, 2.5, true,  true,  true),
  ('Munshipulia',      26.8845, 80.9889, 2.0, true,  true,  true),
  ('Gomti Nagar',      26.8467, 81.0023, 4.0, false, true,  true),
  ('Hazratganj',       26.8489, 80.9450, 3.0, false, true,  true),
  ('Mahanagar',        26.8856, 80.9523, 2.5, false, true,  true),
  ('Nishatganj',       26.8678, 80.9612, 2.0, false, true,  true),
  ('Kapoorthala',      26.8923, 80.9389, 2.0, false, true,  true),
  ('Daliganj',         26.8745, 80.9389, 2.0, false, true,  true)
ON CONFLICT (name) DO NOTHING;
