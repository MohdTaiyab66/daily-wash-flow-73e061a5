
-- ============================================================
-- Customer App V1 — Phase 0 schema
-- ============================================================

-- Add 'customer' to the app_role enum so the same login can be customer + partner + admin.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.app_role'::regtype AND enumlabel = 'customer') THEN
    ALTER TYPE public.app_role ADD VALUE 'customer';
  END IF;
END $$;

-- ----------------------------------------------------------------
-- updated_at trigger helper (reuse tg_set_updated_at if present)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ----------------------------------------------------------------
-- customer_profiles
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  phone text,
  preferred_area text,
  marketing_opt_in boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_profiles TO authenticated;
GRANT ALL ON public.customer_profiles TO service_role;
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cp_self_select" ON public.customer_profiles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cp_self_insert" ON public.customer_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "cp_self_update" ON public.customer_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "cp_admin_all"   ON public.customer_profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_cp_updated BEFORE UPDATE ON public.customer_profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ----------------------------------------------------------------
-- customer_addresses
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Home',
  address_line text NOT NULL,
  area text NOT NULL,
  pincode text,
  latitude numeric,
  longitude numeric,
  parking_notes text,
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_addresses TO authenticated;
GRANT ALL ON public.customer_addresses TO service_role;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ca_self_select" ON public.customer_addresses FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ca_self_cud"    ON public.customer_addresses FOR ALL    TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_ca_updated BEFORE UPDATE ON public.customer_addresses FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ----------------------------------------------------------------
-- customer_vehicles
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  make text NOT NULL,
  model text NOT NULL,
  category text NOT NULL CHECK (category IN ('hatchback_compact_sedan','sedan_suv')),
  color text,
  registration_number text NOT NULL,
  parking_notes text,
  image_path text,
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_vehicles TO authenticated;
GRANT ALL ON public.customer_vehicles TO service_role;
ALTER TABLE public.customer_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cv_self_select" ON public.customer_vehicles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cv_self_cud"    ON public.customer_vehicles FOR ALL    TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_cv_updated BEFORE UPDATE ON public.customer_vehicles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ----------------------------------------------------------------
-- area_waitlist (Notify Me)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.area_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  area text NOT NULL,
  full_name text,
  notified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.area_waitlist TO authenticated;
GRANT INSERT ON public.area_waitlist TO anon, authenticated;
GRANT ALL ON public.area_waitlist TO service_role;
ALTER TABLE public.area_waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aw_public_insert" ON public.area_waitlist FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "aw_admin_select"  ON public.area_waitlist FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "aw_admin_update"  ON public.area_waitlist FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ----------------------------------------------------------------
-- vehicle_catalog (master make/model/category)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehicle_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  make text NOT NULL,
  model text NOT NULL,
  category text NOT NULL CHECK (category IN ('hatchback_compact_sedan','sedan_suv')),
  image_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (make, model)
);
GRANT SELECT ON public.vehicle_catalog TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vehicle_catalog TO authenticated;
GRANT ALL ON public.vehicle_catalog TO service_role;
ALTER TABLE public.vehicle_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vc_public_read"  ON public.vehicle_catalog FOR SELECT TO anon, authenticated USING (active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "vc_admin_write"  ON public.vehicle_catalog FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_vc_updated BEFORE UPDATE ON public.vehicle_catalog FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed popular Indian models with auto-classification
INSERT INTO public.vehicle_catalog (make, model, category) VALUES
  -- SUVs
  ('Toyota','Fortuner','sedan_suv'),('Toyota','Innova Crysta','sedan_suv'),('Toyota','Innova Hycross','sedan_suv'),
  ('Toyota','Urban Cruiser Hyryder','sedan_suv'),('Tata','Harrier','sedan_suv'),('Tata','Safari','sedan_suv'),
  ('Mahindra','Scorpio','sedan_suv'),('Mahindra','Scorpio N','sedan_suv'),('Mahindra','XUV700','sedan_suv'),
  ('Mahindra','Thar','sedan_suv'),('Hyundai','Creta','sedan_suv'),('Hyundai','Alcazar','sedan_suv'),
  ('Hyundai','Tucson','sedan_suv'),('Kia','Seltos','sedan_suv'),('Kia','Carens','sedan_suv'),
  ('MG','Hector','sedan_suv'),('MG','Astor','sedan_suv'),('Skoda','Kushaq','sedan_suv'),
  ('Volkswagen','Taigun','sedan_suv'),('Jeep','Compass','sedan_suv'),('Jeep','Meridian','sedan_suv'),
  ('Maruti','Grand Vitara','sedan_suv'),('Maruti','Brezza','sedan_suv'),('Maruti','XL6','sedan_suv'),
  ('Maruti','Ertiga','sedan_suv'),('Honda','Elevate','sedan_suv'),('Renault','Duster','sedan_suv'),
  ('Nissan','Magnite','sedan_suv'),('Renault','Kiger','sedan_suv'),
  -- Sedans
  ('Honda','City','sedan_suv'),('Hyundai','Verna','sedan_suv'),('Volkswagen','Virtus','sedan_suv'),
  ('Skoda','Slavia','sedan_suv'),('Maruti','Ciaz','sedan_suv'),('Toyota','Camry','sedan_suv'),
  ('BMW','3 Series','sedan_suv'),('Mercedes','C-Class','sedan_suv'),('Audi','A4','sedan_suv'),
  -- Compact sedans
  ('Maruti','Dzire','hatchback_compact_sedan'),('Honda','Amaze','hatchback_compact_sedan'),
  ('Hyundai','Aura','hatchback_compact_sedan'),('Tata','Tigor','hatchback_compact_sedan'),
  -- Hatchbacks
  ('Maruti','Swift','hatchback_compact_sedan'),('Maruti','Baleno','hatchback_compact_sedan'),
  ('Maruti','WagonR','hatchback_compact_sedan'),('Maruti','Alto K10','hatchback_compact_sedan'),
  ('Maruti','Celerio','hatchback_compact_sedan'),('Maruti','S-Presso','hatchback_compact_sedan'),
  ('Maruti','Ignis','hatchback_compact_sedan'),('Hyundai','i20','hatchback_compact_sedan'),
  ('Hyundai','Grand i10 Nios','hatchback_compact_sedan'),('Hyundai','Exter','hatchback_compact_sedan'),
  ('Tata','Tiago','hatchback_compact_sedan'),('Tata','Altroz','hatchback_compact_sedan'),
  ('Tata','Punch','hatchback_compact_sedan'),('Renault','Kwid','hatchback_compact_sedan'),
  -- Compact SUVs treated as hatchback tier
  ('Hyundai','Venue','hatchback_compact_sedan'),('Tata','Nexon','hatchback_compact_sedan'),
  ('Mahindra','XUV300','hatchback_compact_sedan'),('Mahindra','XUV 3XO','hatchback_compact_sedan'),
  ('Kia','Sonet','hatchback_compact_sedan'),('Citroen','C3','hatchback_compact_sedan')
ON CONFLICT (make, model) DO NOTHING;

-- ----------------------------------------------------------------
-- service_catalog (admin-editable services)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  benefits text[] DEFAULT ARRAY[]::text[],
  banner_url text,
  video_url text,
  duration_minutes int,
  service_type text NOT NULL CHECK (service_type IN ('subscription','one_time','deep_clean','interior_deep','custom')),
  price_hatchback numeric NOT NULL DEFAULT 0,
  price_sedan_suv numeric NOT NULL DEFAULT 0,
  addons jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order int NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.service_catalog TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_catalog TO authenticated;
GRANT ALL ON public.service_catalog TO service_role;
ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sc_public_read" ON public.service_catalog FOR SELECT TO anon, authenticated USING (active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sc_admin_write" ON public.service_catalog FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_sc_updated BEFORE UPDATE ON public.service_catalog FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed services
INSERT INTO public.service_catalog (slug, name, description, benefits, service_type, price_hatchback, price_sedan_suv, addons, sort_order) VALUES
  ('daily_shine','Daily Shine','Daily exterior cleaning + 1 monthly interior & exterior pressure wash.',
    ARRAY['Daily exterior wipe','Monthly pressure wash','Tyre dressing','Doorstep service'],
    'subscription', 999, 1199,
    '[{"key":"interior_wash","name":"Interior Wash","price_hatchback":149,"price_sedan_suv":199},
      {"key":"exterior_wash","name":"Exterior Wash","price_hatchback":149,"price_sedan_suv":199},
      {"key":"dusting","name":"Dusting","price_hatchback":25,"price_sedan_suv":25},
      {"key":"body_polish","name":"Body Polish","price_hatchback":49,"price_sedan_suv":49}]'::jsonb,
    10),
  ('one_time_basic','One-Time Wash · Basic','Pressure wash + tyre polish + vacuuming + dashboard polish + fragrance.',
    ARRAY['Pressure wash','Tyre polish','Vacuuming','Dashboard polish','Fragrance'],
    'one_time', 349, 399,
    '[{"key":"seat_cleaning","name":"Seat Cleaning","price_hatchback":499,"price_sedan_suv":499},
      {"key":"roof_cleaning","name":"Roof Cleaning","price_hatchback":499,"price_sedan_suv":499}]'::jsonb,
    20),
  ('one_time_plus','One-Time Wash · Plus','Adds body polish to the basic wash.',
    ARRAY['Pressure wash','Body polish','Tyre polish','Vacuuming','Dashboard polish','Fragrance'],
    'one_time', 399, 499,
    '[{"key":"seat_cleaning","name":"Seat Cleaning","price_hatchback":499,"price_sedan_suv":499},
      {"key":"roof_cleaning","name":"Roof Cleaning","price_hatchback":499,"price_sedan_suv":499}]'::jsonb,
    30),
  ('deep_clean','Deep Clean','Full interior + exterior detail with ceramic polish.',
    ARRAY['Pressure wash','Ceramic polish','Seat cleaning','Door panel & dashboard','Roof & trunk','Fragrance'],
    'deep_clean', 1099, 1399, '[]'::jsonb, 40),
  ('interior_deep','Interior Deep Clean','Deep interior detailing only.',
    ARRAY['Seat cleaning','Door panel cleaning','Dashboard cleaning','Roof cleaning','Trunk cleaning','Fragrance'],
    'interior_deep', 899, 999, '[]'::jsonb, 50)
ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------------
-- bookings
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.service_catalog(id),
  vehicle_id uuid REFERENCES public.customer_vehicles(id) ON DELETE SET NULL,
  address_id uuid REFERENCES public.customer_addresses(id) ON DELETE SET NULL,
  scheduled_date date,
  preferred_before_time text,
  base_amount numeric NOT NULL DEFAULT 0,
  addon_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','paid','active','completed','cancelled','refunded')),
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','failed','refunded')),
  razorpay_order_id text,
  razorpay_payment_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bk_self_select" ON public.bookings FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "bk_self_insert" ON public.bookings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "bk_self_update" ON public.bookings FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')) WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_bk_updated BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ----------------------------------------------------------------
-- booking_addons
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  addon_key text NOT NULL,
  addon_name text NOT NULL,
  price numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.booking_addons TO authenticated;
GRANT ALL ON public.booking_addons TO service_role;
ALTER TABLE public.booking_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ba_self_select" ON public.booking_addons FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND (b.user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY "ba_self_cud"    ON public.booking_addons FOR ALL    TO authenticated USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.user_id = auth.uid()));

-- ----------------------------------------------------------------
-- subscription_pauses
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  reason text NOT NULL,
  notes text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_extended int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','active','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.subscription_pauses TO authenticated;
GRANT ALL ON public.subscription_pauses TO service_role;
ALTER TABLE public.subscription_pauses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_self_select" ON public.subscription_pauses FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sp_self_insert" ON public.subscription_pauses FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "sp_admin_update" ON public.subscription_pauses FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_sp_updated BEFORE UPDATE ON public.subscription_pauses FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ----------------------------------------------------------------
-- push_tokens
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'web',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.push_tokens TO authenticated;
GRANT ALL ON public.push_tokens TO service_role;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pt_self" ON public.push_tokens FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------
-- platform_settings seeds for customer-app config
-- ----------------------------------------------------------------
INSERT INTO public.platform_settings (key, value, description) VALUES
  ('multi_vehicle_discount_2', to_jsonb(5),  'Percent discount when customer subscribes 2 vehicles at same address'),
  ('multi_vehicle_discount_3', to_jsonb(10), 'Percent discount when customer subscribes 3+ vehicles at same address'),
  ('referral_reward_referrer', to_jsonb(100), 'Rupees credited to referrer when referred customer subscribes'),
  ('referral_reward_referee',  to_jsonb(100), 'Rupees credited to new customer who signs up via referral')
ON CONFLICT (key) DO NOTHING;
