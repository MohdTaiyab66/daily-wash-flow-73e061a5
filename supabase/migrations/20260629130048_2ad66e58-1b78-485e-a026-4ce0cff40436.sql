CREATE OR REPLACE FUNCTION public.enforce_partner_self_update_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;
  NEW.rate_per_car      := OLD.rate_per_car;
  NEW.reliability_score := OLD.reliability_score;
  NEW.lifetime_earnings := OLD.lifetime_earnings;
  NEW.aadhaar_verified  := OLD.aadhaar_verified;
  NEW.pan_verified      := OLD.pan_verified;
  NEW.bank_verified     := OLD.bank_verified;
  NEW.level             := OLD.level;
  NEW.status            := OLD.status;
  RETURN NEW;
END;
$function$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='guard_partner_self_update') THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.guard_partner_self_update()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO 'public'
      AS $body$
      BEGIN
        IF public.has_role(auth.uid(), 'admin'::app_role) OR auth.uid() IS NULL THEN
          RETURN NEW;
        END IF;
        IF NEW.id IS DISTINCT FROM auth.uid() THEN
          RETURN NEW;
        END IF;
        NEW.status := OLD.status;
        RETURN NEW;
      END;
      $body$;
    $f$;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.partner_expansion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  area_name text NOT NULL,
  latitude double precision NULL,
  longitude double precision NULL,
  vehicle text NULL,
  experience_years int NULL,
  preferred_cars_per_day int NULL,
  expected_joining_date date NULL,
  status text NOT NULL DEFAULT 'pending',
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.partner_expansion_requests TO authenticated;
GRANT ALL ON public.partner_expansion_requests TO service_role;

ALTER TABLE public.partner_expansion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can register interest" ON public.partner_expansion_requests;
CREATE POLICY "Anyone can register interest"
  ON public.partner_expansion_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins read all expansion requests" ON public.partner_expansion_requests;
CREATE POLICY "Admins read all expansion requests"
  ON public.partner_expansion_requests
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ops_manager'::app_role));

DROP POLICY IF EXISTS "Admins update expansion requests" ON public.partner_expansion_requests;
CREATE POLICY "Admins update expansion requests"
  ON public.partner_expansion_requests
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ops_manager'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'ops_manager'::app_role));

CREATE INDEX IF NOT EXISTS idx_partner_expansion_requests_status
  ON public.partner_expansion_requests (status, created_at DESC);

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_expansion_requests';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

INSERT INTO public.platform_settings (key, value, description)
VALUES
  ('dar.enabled', 'true'::jsonb, 'Dynamic Assignment Recovery: master switch'),
  ('dar.min_remaining_capacity', '1'::jsonb, 'Minimum free capacity (cars) a partner must have to receive extras'),
  ('dar.max_extra_cars', '8'::jsonb, 'Maximum extra cars offered per partner per recovery cycle'),
  ('dar.search_radius_km', '5'::jsonb, 'Radius around released customer to find candidate partners (km)'),
  ('dar.max_travel_increase_km', '4'::jsonb, 'Maximum route-distance increase accepted (km)'),
  ('dar.min_earnings_per_offer', '100'::jsonb, 'Minimum additional earning to bother offering (₹)'),
  ('dar.auto_suggest', 'true'::jsonb, 'Push offer automatically vs. require admin approval'),
  ('dar.auto_optimize', 'true'::jsonb, 'Re-optimize route automatically after acceptance'),
  ('dar.partner_notification_timeout_sec', '120'::jsonb, 'Seconds before offer expires for a partner'),
  ('dar.retry_count', '3'::jsonb, 'Number of partners to try sequentially before manual escalation'),
  ('dar.emergency_mode', 'false'::jsonb, 'Bypass radius/earning thresholds when true')
ON CONFLICT (key) DO NOTHING;