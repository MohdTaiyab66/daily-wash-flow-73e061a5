
-- Extend service_catalog (use existing columns where they exist)
ALTER TABLE public.service_catalog
  ADD COLUMN IF NOT EXISTS includes_hatchback text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS includes_sedan_suv text[] NOT NULL DEFAULT '{}';

-- Service add-ons
CREATE TABLE IF NOT EXISTS public.service_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  icon_url text,
  price_hatchback numeric NOT NULL DEFAULT 0,
  price_sedan_suv numeric NOT NULL DEFAULT 0,
  applies_to_slugs text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_addons TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_addons TO authenticated;
GRANT ALL ON public.service_addons TO service_role;
ALTER TABLE public.service_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "addons_read" ON public.service_addons FOR SELECT USING (active OR public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "addons_admin_write" ON public.service_addons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_addons_updated BEFORE UPDATE ON public.service_addons
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Multi-vehicle discount
CREATE TABLE IF NOT EXISTS public.multi_vehicle_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_count int NOT NULL UNIQUE CHECK (vehicle_count >= 2),
  percent numeric NOT NULL CHECK (percent >= 0 AND percent <= 100),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.multi_vehicle_discounts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.multi_vehicle_discounts TO authenticated;
GRANT ALL ON public.multi_vehicle_discounts TO service_role;
ALTER TABLE public.multi_vehicle_discounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mvd_read" ON public.multi_vehicle_discounts FOR SELECT USING (true);
CREATE POLICY "mvd_admin_write" ON public.multi_vehicle_discounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE TRIGGER trg_mvd_updated BEFORE UPDATE ON public.multi_vehicle_discounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Referral config
CREATE TABLE IF NOT EXISTS public.referral_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  referrer_reward numeric NOT NULL DEFAULT 100,
  referred_reward numeric NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.referral_config TO anon, authenticated;
GRANT UPDATE ON public.referral_config TO authenticated;
GRANT ALL ON public.referral_config TO service_role;
ALTER TABLE public.referral_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rc_read" ON public.referral_config FOR SELECT USING (true);
CREATE POLICY "rc_admin_write" ON public.referral_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
INSERT INTO public.referral_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Seed services
INSERT INTO public.service_catalog
  (slug, name, description, service_type, price_hatchback, price_sedan_suv, duration_minutes, sort_order, active, benefits, includes_hatchback, includes_sedan_suv)
VALUES
  ('daily-shine','Daily Shine','Daily exterior cleaning + 1 Interior & Exterior Pressure Wash','subscription',999,1199,20,1,true,
    ARRAY['Daily exterior cleaning','Monthly pressure wash','Trained partners','Eco-friendly products'],
    ARRAY['Daily Exterior Cleaning','1 Interior & Exterior Pressure Wash'],
    ARRAY['Daily Exterior Cleaning','1 Interior & Exterior Pressure Wash']),
  ('one-time-wash-basic','One-Time Wash – Basic','Pressure wash + interior vacuum + dashboard polish','one_time',349,399,45,2,true,
    ARRAY['Exterior pressure wash','Tyre polish','Interior vacuum','Dashboard polish','Fragrance spray'],
    ARRAY['Pressure Wash','Tyre Polish','Vacuuming','Dashboard Polish','Fragrance Spray'],
    ARRAY['Pressure Wash','Tyre Polish','Vacuuming','Dashboard Polish','Fragrance Spray']),
  ('one-time-wash-premium','One-Time Wash – Premium','Adds body polish on top of the basic wash','one_time',399,499,60,3,true,
    ARRAY['Body polish included','Tyre polish','Interior vacuum','Dashboard polish'],
    ARRAY['Pressure Wash','Body Polish','Tyre Polish','Vacuuming','Dashboard Polish','Fragrance Spray'],
    ARRAY['Pressure Wash','Body Polish','Tyre Polish','Vacuuming','Dashboard Polish','Fragrance Spray']),
  ('deep-clean','Deep Clean','Full interior + exterior deep clean with ceramic polish','deep_clean',1099,1399,150,4,true,
    ARRAY['Ceramic polish','Full interior deep clean','Roof + trunk cleaning'],
    ARRAY['Pressure Wash','Ceramic Polish','Tyre Polish','Vacuuming','Seat Cleaning','Door Panel Cleaning','Dashboard Cleaning & Polish','Roof Cleaning','Trunk Cleaning','Fragrance Spray'],
    ARRAY['Pressure Wash','Ceramic Polish','Tyre Polish','Vacuuming','Seat Cleaning','Door Panel Cleaning','Dashboard Cleaning & Polish','Roof Cleaning','Trunk Cleaning','Fragrance Spray']),
  ('interior-deep-clean','Interior Deep Clean','Interior-only deep clean','interior_deep',899,999,120,5,true,
    ARRAY['Seat cleaning','Door panels','Dashboard polish','Roof + trunk'],
    ARRAY['Vacuuming','Seat Cleaning','Door Panel Cleaning','Dashboard Cleaning & Polish','Roof Cleaning','Trunk Cleaning','Fragrance Spray'],
    ARRAY['Vacuuming','Seat Cleaning','Door Panel Cleaning','Dashboard Cleaning & Polish','Roof Cleaning','Trunk Cleaning','Fragrance Spray'])
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  service_type = EXCLUDED.service_type,
  price_hatchback = EXCLUDED.price_hatchback,
  price_sedan_suv = EXCLUDED.price_sedan_suv,
  duration_minutes = EXCLUDED.duration_minutes,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active,
  benefits = EXCLUDED.benefits,
  includes_hatchback = EXCLUDED.includes_hatchback,
  includes_sedan_suv = EXCLUDED.includes_sedan_suv;

-- Seed add-ons
INSERT INTO public.service_addons (name, description, price_hatchback, price_sedan_suv, applies_to_slugs, sort_order) VALUES
  ('Extra Interior Wash','Add one extra interior pressure wash',149,199,ARRAY['daily-shine'],1),
  ('Extra Exterior Wash','Add one extra exterior pressure wash',149,199,ARRAY['daily-shine'],2),
  ('Dusting','Quick dusting',25,25,ARRAY['daily-shine'],3),
  ('Body Polish','Quick body polish',49,49,ARRAY['daily-shine'],4),
  ('Seat Cleaning','Full seat cleaning',499,499,ARRAY['one-time-wash-basic','one-time-wash-premium'],5),
  ('Roof Cleaning','Roof deep clean',499,499,ARRAY['one-time-wash-basic','one-time-wash-premium'],6),
  ('Buffing Polish','Premium buffing polish',999,999,ARRAY[]::text[],7),
  ('Cutter Polish + Polish','Cutter polish for scratch removal',1999,1999,ARRAY[]::text[],8)
ON CONFLICT DO NOTHING;

-- Seed multi-vehicle discounts
INSERT INTO public.multi_vehicle_discounts (vehicle_count, percent) VALUES (2,5),(3,10)
ON CONFLICT (vehicle_count) DO NOTHING;

-- Seed vehicle catalog (using existing two-tier category)
INSERT INTO public.vehicle_catalog (make, model, category) VALUES
  ('Maruti Suzuki','Alto','hatchback_compact_sedan'),
  ('Maruti Suzuki','Alto K10','hatchback_compact_sedan'),
  ('Maruti Suzuki','S-Presso','hatchback_compact_sedan'),
  ('Maruti Suzuki','Wagon R','hatchback_compact_sedan'),
  ('Maruti Suzuki','Celerio','hatchback_compact_sedan'),
  ('Maruti Suzuki','Swift','hatchback_compact_sedan'),
  ('Maruti Suzuki','Ignis','hatchback_compact_sedan'),
  ('Maruti Suzuki','Baleno','hatchback_compact_sedan'),
  ('Maruti Suzuki','Dzire','hatchback_compact_sedan'),
  ('Maruti Suzuki','Ciaz','sedan_suv'),
  ('Maruti Suzuki','Brezza','sedan_suv'),
  ('Maruti Suzuki','Fronx','sedan_suv'),
  ('Maruti Suzuki','Grand Vitara','sedan_suv'),
  ('Maruti Suzuki','S-Cross','sedan_suv'),
  ('Maruti Suzuki','Ertiga','sedan_suv'),
  ('Maruti Suzuki','XL6','sedan_suv'),
  ('Maruti Suzuki','Invicto','sedan_suv'),
  ('Maruti Suzuki','Jimny','sedan_suv'),
  ('Hyundai','Grand i10 Nios','hatchback_compact_sedan'),
  ('Hyundai','i10','hatchback_compact_sedan'),
  ('Hyundai','i20','hatchback_compact_sedan'),
  ('Hyundai','Aura','hatchback_compact_sedan'),
  ('Hyundai','Verna','sedan_suv'),
  ('Hyundai','Exter','sedan_suv'),
  ('Hyundai','Venue','sedan_suv'),
  ('Hyundai','Creta','sedan_suv'),
  ('Hyundai','Alcazar','sedan_suv'),
  ('Hyundai','Tucson','sedan_suv'),
  ('Hyundai','Kona','sedan_suv'),
  ('Hyundai','Ioniq 5','sedan_suv'),
  ('Tata','Tiago','hatchback_compact_sedan'),
  ('Tata','Tiago EV','hatchback_compact_sedan'),
  ('Tata','Altroz','hatchback_compact_sedan'),
  ('Tata','Punch','hatchback_compact_sedan'),
  ('Tata','Tigor','hatchback_compact_sedan'),
  ('Tata','Nexon','sedan_suv'),
  ('Tata','Nexon EV','sedan_suv'),
  ('Tata','Curvv','sedan_suv'),
  ('Tata','Harrier','sedan_suv'),
  ('Tata','Safari','sedan_suv'),
  ('Mahindra','Bolero','sedan_suv'),
  ('Mahindra','Bolero Neo','sedan_suv'),
  ('Mahindra','XUV 3XO','sedan_suv'),
  ('Mahindra','XUV300','sedan_suv'),
  ('Mahindra','XUV400','sedan_suv'),
  ('Mahindra','XUV700','sedan_suv'),
  ('Mahindra','Scorpio','sedan_suv'),
  ('Mahindra','Scorpio N','sedan_suv'),
  ('Mahindra','Scorpio Classic','sedan_suv'),
  ('Mahindra','Thar','sedan_suv'),
  ('Mahindra','Thar Roxx','sedan_suv'),
  ('Mahindra','Marazzo','sedan_suv'),
  ('Mahindra','XEV 9e','sedan_suv'),
  ('Mahindra','BE 6','sedan_suv'),
  ('Toyota','Glanza','hatchback_compact_sedan'),
  ('Toyota','Taisor','sedan_suv'),
  ('Toyota','Urban Cruiser Hyryder','sedan_suv'),
  ('Toyota','Rumion','sedan_suv'),
  ('Toyota','Innova Crysta','sedan_suv'),
  ('Toyota','Innova Hycross','sedan_suv'),
  ('Toyota','Fortuner','sedan_suv'),
  ('Toyota','Legender','sedan_suv'),
  ('Toyota','Hilux','sedan_suv'),
  ('Toyota','Vellfire','sedan_suv'),
  ('Toyota','Camry','sedan_suv'),
  ('Honda','Amaze','hatchback_compact_sedan'),
  ('Honda','City','sedan_suv'),
  ('Honda','Elevate','sedan_suv'),
  ('Kia','Sonet','sedan_suv'),
  ('Kia','Seltos','sedan_suv'),
  ('Kia','Carens','sedan_suv'),
  ('Kia','Carnival','sedan_suv'),
  ('Kia','EV6','sedan_suv'),
  ('Kia','EV9','sedan_suv'),
  ('Kia','Syros','sedan_suv'),
  ('MG','Astor','sedan_suv'),
  ('MG','Hector','sedan_suv'),
  ('MG','Hector Plus','sedan_suv'),
  ('MG','Gloster','sedan_suv'),
  ('MG','ZS EV','sedan_suv'),
  ('MG','Comet EV','hatchback_compact_sedan'),
  ('MG','Windsor EV','sedan_suv'),
  ('Skoda','Kushaq','sedan_suv'),
  ('Skoda','Kylaq','sedan_suv'),
  ('Skoda','Slavia','sedan_suv'),
  ('Skoda','Octavia','sedan_suv'),
  ('Skoda','Superb','sedan_suv'),
  ('Skoda','Kodiaq','sedan_suv'),
  ('Volkswagen','Virtus','sedan_suv'),
  ('Volkswagen','Taigun','sedan_suv'),
  ('Volkswagen','Tiguan','sedan_suv'),
  ('Renault','Kwid','hatchback_compact_sedan'),
  ('Renault','Triber','sedan_suv'),
  ('Renault','Kiger','sedan_suv'),
  ('Nissan','Magnite','sedan_suv'),
  ('Nissan','X-Trail','sedan_suv'),
  ('Jeep','Compass','sedan_suv'),
  ('Jeep','Meridian','sedan_suv'),
  ('Jeep','Wrangler','sedan_suv'),
  ('Jeep','Grand Cherokee','sedan_suv'),
  ('Citroen','C3','hatchback_compact_sedan'),
  ('Citroen','C3 Aircross','sedan_suv'),
  ('Citroen','Basalt','sedan_suv'),
  ('Citroen','eC3','hatchback_compact_sedan'),
  ('BMW','3 Series','sedan_suv'),
  ('BMW','5 Series','sedan_suv'),
  ('BMW','7 Series','sedan_suv'),
  ('BMW','X1','sedan_suv'),
  ('BMW','X3','sedan_suv'),
  ('BMW','X5','sedan_suv'),
  ('BMW','X7','sedan_suv'),
  ('Mercedes-Benz','A-Class','sedan_suv'),
  ('Mercedes-Benz','C-Class','sedan_suv'),
  ('Mercedes-Benz','E-Class','sedan_suv'),
  ('Mercedes-Benz','S-Class','sedan_suv'),
  ('Mercedes-Benz','GLA','sedan_suv'),
  ('Mercedes-Benz','GLC','sedan_suv'),
  ('Mercedes-Benz','GLE','sedan_suv'),
  ('Mercedes-Benz','GLS','sedan_suv'),
  ('Audi','A4','sedan_suv'),
  ('Audi','A6','sedan_suv'),
  ('Audi','A8','sedan_suv'),
  ('Audi','Q3','sedan_suv'),
  ('Audi','Q5','sedan_suv'),
  ('Audi','Q7','sedan_suv'),
  ('Audi','Q8','sedan_suv'),
  ('Volvo','XC40','sedan_suv'),
  ('Volvo','XC60','sedan_suv'),
  ('Volvo','XC90','sedan_suv'),
  ('Volvo','S90','sedan_suv')
ON CONFLICT (make, model) DO NOTHING;

-- Realtime
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.service_catalog; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.service_addons; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.multi_vehicle_discounts; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicle_catalog; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.services; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
