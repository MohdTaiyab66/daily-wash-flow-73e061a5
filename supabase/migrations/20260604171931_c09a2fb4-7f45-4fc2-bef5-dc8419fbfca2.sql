
CREATE TYPE public.partner_status AS ENUM ('pending_verification','active','suspended','offline');
CREATE TYPE public.availability_status AS ENUM ('online','offline','leave','emergency_leave');
CREATE TYPE public.service_status AS ENUM ('pending','in_progress','completed','unavailable','skipped');
CREATE TYPE public.unavailable_reason AS ENUM ('vehicle_not_available','parking_locked','customer_asked_to_skip','access_not_available','customer_not_responding');
CREATE TYPE public.photo_stage AS ENUM ('before','after');
CREATE TYPE public.photo_angle AS ENUM ('front','rear','left','right');
CREATE TYPE public.subscription_plan AS ENUM ('daily_shine_monthly','daily_shine_quarterly','daily_shine_yearly');
CREATE TYPE public.complaint_status AS ENUM ('open','investigating','resolved','dismissed');
CREATE TYPE public.payout_status AS ENUM ('pending','processing','paid','failed');

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Tables (no policies yet)
CREATE TABLE public.partners (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_code TEXT UNIQUE NOT NULL DEFAULT ('UW-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6))),
  full_name TEXT,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  profile_photo_url TEXT,
  aadhaar_number TEXT,
  pan_number TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_account_holder TEXT,
  city TEXT NOT NULL DEFAULT 'Lucknow',
  status public.partner_status NOT NULL DEFAULT 'pending_verification',
  availability public.availability_status NOT NULL DEFAULT 'offline',
  cars_selected INT NOT NULL DEFAULT 0,
  rate_per_car NUMERIC(10,2) NOT NULL DEFAULT 0,
  rating NUMERIC(3,2) NOT NULL DEFAULT 5.00,
  total_cars_completed INT NOT NULL DEFAULT 0,
  referral_code TEXT UNIQUE NOT NULL DEFAULT ('UW' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6))),
  referred_by UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  joined_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address_line TEXT NOT NULL,
  area TEXT,
  city TEXT NOT NULL DEFAULT 'Lucknow',
  pincode TEXT,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  subscription_plan public.subscription_plan NOT NULL DEFAULT 'daily_shine_monthly',
  subscription_start DATE NOT NULL DEFAULT CURRENT_DATE,
  subscription_end DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  registration_number TEXT NOT NULL,
  color TEXT,
  parking_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL DEFAULT CURRENT_DATE,
  time_slot TEXT NOT NULL DEFAULT '06:00 - 09:00',
  sequence_no INT,
  status public.service_status NOT NULL DEFAULT 'pending',
  unavailable_reason public.unavailable_reason,
  unavailable_notes TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  start_lat NUMERIC(9,6),
  start_lng NUMERIC(9,6),
  complete_lat NUMERIC(9,6),
  complete_lng NUMERIC(9,6),
  rate_per_car NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_services_partner_date ON public.services(partner_id, scheduled_date);
CREATE INDEX idx_services_customer ON public.services(customer_id);

CREATE TABLE public.service_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  stage public.photo_stage NOT NULL,
  angle public.photo_angle NOT NULL,
  storage_path TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lat NUMERIC(9,6),
  lng NUMERIC(9,6),
  metadata JSONB,
  UNIQUE (service_id, stage, angle)
);

CREATE TABLE public.partner_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  referee_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  referee_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  days_completed INT NOT NULL DEFAULT 0,
  reward_amount NUMERIC(10,2) NOT NULL DEFAULT 500,
  reward_paid BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.customer_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  area TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  incentive_amount NUMERIC(10,2) NOT NULL DEFAULT 100,
  incentive_paid BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  earned_on DATE NOT NULL DEFAULT CURRENT_DATE,
  cars_completed INT NOT NULL DEFAULT 0,
  base_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  incentive_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  referral_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  penalty_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10,2) GENERATED ALWAYS AS (base_amount + incentive_amount + referral_amount - penalty_amount) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, earned_on)
);

CREATE TABLE public.payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  cars_completed INT NOT NULL DEFAULT 0,
  base_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  referral_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  incentive_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  penalty_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status public.payout_status NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  complaint_type TEXT NOT NULL,
  description TEXT,
  status public.complaint_status NOT NULL DEFAULT 'open',
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status public.availability_status NOT NULL DEFAULT 'online',
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, attendance_date)
);

CREATE TABLE public.training_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 5,
  sort_order INT NOT NULL DEFAULT 0,
  content JSONB,
  video_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.training_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, module_id)
);

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.partners TO authenticated;
GRANT SELECT ON public.customers TO authenticated;
GRANT SELECT ON public.vehicles TO authenticated;
GRANT SELECT, UPDATE ON public.services TO authenticated;
GRANT SELECT, INSERT ON public.service_photos TO authenticated;
GRANT SELECT, INSERT ON public.partner_referrals TO authenticated;
GRANT SELECT, INSERT ON public.customer_referrals TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.earnings TO authenticated;
GRANT SELECT ON public.payouts TO authenticated;
GRANT SELECT ON public.complaints TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.attendance TO authenticated;
GRANT SELECT ON public.training_modules TO authenticated;
GRANT SELECT, INSERT ON public.training_progress TO authenticated;
GRANT ALL ON public.partners, public.customers, public.vehicles, public.services, public.service_photos,
             public.partner_referrals, public.customer_referrals, public.earnings, public.payouts,
             public.complaints, public.attendance, public.training_modules, public.training_progress
       TO service_role;

-- RLS
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_progress ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Partners view own profile" ON public.partners FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Partners insert own profile" ON public.partners FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Partners update own profile" ON public.partners FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Partners read assigned customers" ON public.customers FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.services s WHERE s.customer_id = customers.id AND s.partner_id = auth.uid()));

CREATE POLICY "Partners read assigned vehicles" ON public.vehicles FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.services s WHERE s.vehicle_id = vehicles.id AND s.partner_id = auth.uid()));

CREATE POLICY "Partners read own services" ON public.services FOR SELECT TO authenticated USING (partner_id = auth.uid());
CREATE POLICY "Partners update own services" ON public.services FOR UPDATE TO authenticated USING (partner_id = auth.uid()) WITH CHECK (partner_id = auth.uid());

CREATE POLICY "Partners read own service photos" ON public.service_photos FOR SELECT TO authenticated USING (partner_id = auth.uid());
CREATE POLICY "Partners insert own service photos" ON public.service_photos FOR INSERT TO authenticated WITH CHECK (partner_id = auth.uid());

CREATE POLICY "Partners read own referrals" ON public.partner_referrals FOR SELECT TO authenticated USING (referrer_id = auth.uid());
CREATE POLICY "Partners insert own referrals" ON public.partner_referrals FOR INSERT TO authenticated WITH CHECK (referrer_id = auth.uid());

CREATE POLICY "Partners read own customer referrals" ON public.customer_referrals FOR SELECT TO authenticated USING (partner_id = auth.uid());
CREATE POLICY "Partners insert own customer referrals" ON public.customer_referrals FOR INSERT TO authenticated WITH CHECK (partner_id = auth.uid());

CREATE POLICY "Partners read own earnings" ON public.earnings FOR SELECT TO authenticated USING (partner_id = auth.uid());
CREATE POLICY "Partners read own payouts" ON public.payouts FOR SELECT TO authenticated USING (partner_id = auth.uid());
CREATE POLICY "Partners read own complaints" ON public.complaints FOR SELECT TO authenticated USING (partner_id = auth.uid());

CREATE POLICY "Partners read own attendance" ON public.attendance FOR SELECT TO authenticated USING (partner_id = auth.uid());
CREATE POLICY "Partners insert own attendance" ON public.attendance FOR INSERT TO authenticated WITH CHECK (partner_id = auth.uid());
CREATE POLICY "Partners update own attendance" ON public.attendance FOR UPDATE TO authenticated USING (partner_id = auth.uid()) WITH CHECK (partner_id = auth.uid());

CREATE POLICY "Anyone authenticated can read training" ON public.training_modules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Partners read own training progress" ON public.training_progress FOR SELECT TO authenticated USING (partner_id = auth.uid());
CREATE POLICY "Partners insert own training progress" ON public.training_progress FOR INSERT TO authenticated WITH CHECK (partner_id = auth.uid());

-- Triggers
CREATE TRIGGER partners_updated_at BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER complaints_updated_at BEFORE UPDATE ON public.complaints FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Auto-create partner on signup
CREATE OR REPLACE FUNCTION public.handle_new_partner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.partners (id, phone, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone, NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_partner();

-- Storage policies for service-photos bucket (private). Path: {partner_id}/{service_id}/{stage}-{angle}.jpg
CREATE POLICY "Partners upload own service photos" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'service-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Partners read own service photos storage" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'service-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Seed training modules
INSERT INTO public.training_modules (slug, title, description, category, duration_minutes, sort_order) VALUES
('daily-shine-sop','Daily Shine SOP','Standard operating procedure for the daily exterior cleaning service.','SOP',8,1),
('chemical-usage','Chemical Usage','Correct dilution, application and storage of Urban Wash chemicals.','Materials',6,2),
('microfiber-usage','Microfiber Cloth Usage','How to fold, rotate and wash microfiber cloths for streak-free finish.','Materials',5,3),
('vehicle-safety','Vehicle Safety','Protecting paint, mirrors, sensors and antenna while cleaning.','Safety',7,4),
('customer-behaviour','Customer Behaviour','Greeting, communication and dispute handling with customers.','Soft Skills',6,5),
('photo-guidelines','Photo Guidelines','How to capture verification photos: angles, lighting, framing.','Verification',5,6),
('dos-and-donts','Do''s and Don''ts','Quick rules every Urban Wash partner must follow on the field.','Policy',4,7);
