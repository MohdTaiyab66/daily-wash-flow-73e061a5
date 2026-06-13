
-- =========================================================================
-- 1. Platform settings seeds
-- =========================================================================
INSERT INTO public.platform_settings (key, value, description) VALUES
  ('gps_radius_meters', '50'::jsonb, 'Max allowed distance (m) between service photo GPS and customer location'),
  ('modify_cooldown_days', '2'::jsonb, 'Min days between partner-initiated assignment modifications'),
  ('max_modifications_per_assignment', '3'::jsonb, 'Cap on partner-initiated modifications per assignment')
ON CONFLICT (key) DO NOTHING;

-- =========================================================================
-- 2. Service-level fraud / GPS columns
-- =========================================================================
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS gps_flag text,
  ADD COLUMN IF NOT EXISTS gps_distance_m numeric,
  ADD COLUMN IF NOT EXISTS fraud_review boolean NOT NULL DEFAULT false;

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS modification_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_modified_at timestamptz;

-- =========================================================================
-- 3. wallet_ledger
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('earning','deduction','penalty','bonus','payout')),
  amount numeric NOT NULL,
  balance_after numeric,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_partner ON public.wallet_ledger(partner_id, created_at DESC);

GRANT SELECT ON public.wallet_ledger TO authenticated;
GRANT ALL ON public.wallet_ledger TO service_role;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners view own ledger" ON public.wallet_ledger
  FOR SELECT TO authenticated USING (partner_id = auth.uid());
CREATE POLICY "Admins view all ledger" ON public.wallet_ledger
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- =========================================================================
-- 4. assignment_changes audit
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.assignment_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  change_type text NOT NULL CHECK (change_type IN ('increase','decrease')),
  delta_cars integer NOT NULL,
  previous_target integer NOT NULL,
  new_target integer NOT NULL,
  released_customer_ids uuid[],
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assignment_changes_a ON public.assignment_changes(assignment_id, created_at DESC);

GRANT SELECT ON public.assignment_changes TO authenticated;
GRANT ALL ON public.assignment_changes TO service_role;
ALTER TABLE public.assignment_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners view own changes" ON public.assignment_changes
  FOR SELECT TO authenticated USING (partner_id = auth.uid());
CREATE POLICY "Admins view all changes" ON public.assignment_changes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- =========================================================================
-- 5. modify_assignment RPC
-- =========================================================================
CREATE OR REPLACE FUNCTION public.modify_assignment(p_assignment_id uuid, p_delta integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_a record;
  v_cooldown int;
  v_max int;
  v_today date := CURRENT_DATE;
  v_change_type text;
  v_released uuid[] := ARRAY[]::uuid[];
  v_new_target int;
  v_lat numeric; v_lng numeric;
  r record;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_delta = 0 THEN RAISE EXCEPTION 'Delta must be non-zero'; END IF;

  SELECT (value::text)::int INTO v_cooldown FROM platform_settings WHERE key='modify_cooldown_days';
  SELECT (value::text)::int INTO v_max FROM platform_settings WHERE key='max_modifications_per_assignment';

  SELECT * INTO v_a FROM assignments
    WHERE id = p_assignment_id AND partner_id = v_partner AND status='active'
    FOR UPDATE;
  IF v_a.id IS NULL THEN RAISE EXCEPTION 'Assignment not found or not active'; END IF;

  IF v_a.modification_count >= v_max THEN
    RAISE EXCEPTION 'Reached maximum % modifications for this assignment', v_max;
  END IF;
  IF v_a.last_modified_at IS NOT NULL AND v_a.last_modified_at > now() - (v_cooldown || ' days')::interval THEN
    RAISE EXCEPTION 'Wait at least % days between modifications', v_cooldown;
  END IF;

  v_new_target := v_a.target_cars + p_delta;
  IF v_new_target < 15 OR v_new_target > 30 THEN
    RAISE EXCEPTION 'Car count must stay between 15 and 30';
  END IF;
  v_change_type := CASE WHEN p_delta > 0 THEN 'increase' ELSE 'decrease' END;

  IF p_delta < 0 THEN
    -- Release the last (-p_delta) customers from each future day; collect customer ids
    SELECT array_agg(DISTINCT customer_id) INTO v_released
    FROM (
      SELECT s.customer_id, s.id,
             row_number() OVER (PARTITION BY s.scheduled_date ORDER BY s.sequence_no DESC) AS rn
      FROM services s
      WHERE s.assignment_id = p_assignment_id
        AND s.scheduled_date >= v_today
        AND s.status = 'pending'
    ) ranked
    WHERE rn <= -p_delta;

    DELETE FROM services
    WHERE assignment_id = p_assignment_id
      AND scheduled_date >= v_today
      AND status = 'pending'
      AND customer_id = ANY(COALESCE(v_released, ARRAY[]::uuid[]));
  ELSE
    -- Increase: pull nearest unassigned customers from pool, add to future days
    SELECT home_lat, home_lng INTO v_lat, v_lng FROM partners WHERE id = v_partner;
    IF v_lat IS NULL THEN v_lat := 26.8467; v_lng := 80.9462; END IF;

    FOR r IN
      SELECT c.id AS customer_id, v.id AS vehicle_id, c.preferred_time
      FROM customers c JOIN vehicles v ON v.customer_id = c.id
      WHERE c.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM services s2
          WHERE s2.customer_id = c.id
            AND s2.scheduled_date >= v_today
            AND s2.partner_id IS NOT NULL
        )
      ORDER BY public.haversine_km(v_lat, v_lng, c.latitude, c.longitude) ASC
      LIMIT p_delta
    LOOP
      INSERT INTO services (partner_id, customer_id, vehicle_id, assignment_id,
                            scheduled_date, time_slot, sequence_no, rate_per_car, status)
      SELECT v_partner, r.customer_id, r.vehicle_id, p_assignment_id,
             d, COALESCE(r.preferred_time, '06:00 - 09:00'),
             COALESCE((SELECT max(sequence_no) FROM services WHERE assignment_id=p_assignment_id AND scheduled_date=d),0)+1,
             v_a.rate_per_car, 'pending'
      FROM generate_series(v_today, v_a.end_date, interval '1 day') AS g(d)
      WHERE extract(dow FROM d) <> 1;
    END LOOP;
  END IF;

  UPDATE assignments
    SET target_cars = v_new_target,
        modification_count = modification_count + 1,
        last_modified_at = now(),
        total_earnings = (SELECT count(*) * rate_per_car FROM services WHERE assignment_id = p_assignment_id)
    WHERE id = p_assignment_id;

  INSERT INTO assignment_changes(assignment_id, partner_id, change_type, delta_cars, previous_target, new_target, released_customer_ids)
  VALUES (p_assignment_id, v_partner, v_change_type, p_delta, v_a.target_cars, v_new_target, v_released);

  RETURN jsonb_build_object(
    'ok', true,
    'new_target', v_new_target,
    'released_count', COALESCE(array_length(v_released,1),0),
    'modifications_used', v_a.modification_count + 1,
    'modifications_remaining', v_max - (v_a.modification_count + 1)
  );
END $$;

-- =========================================================================
-- 6. partner_reliability score
-- =========================================================================
CREATE OR REPLACE FUNCTION public.partner_reliability(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int; v_completed int; v_ontime int;
  v_present int; v_absent int; v_late int; v_attendance_days int;
  v_complaints int;
  v_attendance_pct numeric; v_completion_pct numeric; v_ontime_pct numeric;
  v_score numeric;
BEGIN
  SELECT count(*) FILTER (WHERE scheduled_date <= CURRENT_DATE),
         count(*) FILTER (WHERE status='completed'),
         count(*) FILTER (WHERE status='completed' AND completed_at::time <= '10:00'::time)
    INTO v_total, v_completed, v_ontime
    FROM services WHERE partner_id = p_partner_id;

  SELECT count(*) FILTER (WHERE status='present'),
         count(*) FILTER (WHERE status='absent'),
         count(*) FILTER (WHERE status='late'),
         count(*)
    INTO v_present, v_absent, v_late, v_attendance_days
    FROM attendance WHERE partner_id = p_partner_id;

  SELECT count(*) INTO v_complaints FROM complaints WHERE partner_id = p_partner_id;

  v_attendance_pct := CASE WHEN v_attendance_days>0 THEN round(100.0*v_present/v_attendance_days,1) ELSE 100 END;
  v_completion_pct := CASE WHEN v_total>0 THEN round(100.0*v_completed/v_total,1) ELSE 100 END;
  v_ontime_pct := CASE WHEN v_completed>0 THEN round(100.0*v_ontime/v_completed,1) ELSE 100 END;
  v_score := round(
    (v_attendance_pct*0.3) + (v_completion_pct*0.4) + (v_ontime_pct*0.3) - LEAST(v_complaints*2, 20),
    1);

  RETURN jsonb_build_object(
    'score', GREATEST(v_score,0),
    'attendance_pct', v_attendance_pct,
    'completion_pct', v_completion_pct,
    'ontime_pct', v_ontime_pct,
    'present', v_present, 'absent', v_absent, 'late', v_late,
    'complaints', v_complaints,
    'total_services', v_total, 'completed_services', v_completed
  );
END $$;

-- =========================================================================
-- 7. GPS validation trigger on service_photos
-- =========================================================================
CREATE OR REPLACE FUNCTION public.validate_service_photo_gps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_radius_m numeric;
  v_cust_lat numeric; v_cust_lng numeric;
  v_dist_km numeric; v_dist_m numeric;
  v_flag text;
BEGIN
  IF NEW.stage <> 'after' THEN RETURN NEW; END IF;

  SELECT (value::text)::numeric INTO v_radius_m FROM platform_settings WHERE key='gps_radius_meters';
  v_radius_m := COALESCE(v_radius_m, 50);

  SELECT c.latitude, c.longitude INTO v_cust_lat, v_cust_lng
  FROM services s JOIN customers c ON c.id = s.customer_id
  WHERE s.id = NEW.service_id;

  IF NEW.lat IS NULL OR NEW.lng IS NULL THEN
    v_flag := 'missing_gps';
    v_dist_m := NULL;
  ELSIF v_cust_lat IS NULL OR v_cust_lng IS NULL THEN
    v_flag := 'missing_gps';
    v_dist_m := NULL;
  ELSE
    v_dist_km := public.haversine_km(NEW.lat, NEW.lng, v_cust_lat, v_cust_lng);
    v_dist_m := round(v_dist_km * 1000, 1);
    v_flag := CASE WHEN v_dist_m <= v_radius_m THEN 'ok' ELSE 'out_of_range' END;
  END IF;

  UPDATE services
    SET gps_flag = v_flag,
        gps_distance_m = v_dist_m,
        fraud_review = (v_flag <> 'ok')
    WHERE id = NEW.service_id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_service_photo_gps ON public.service_photos;
CREATE TRIGGER trg_validate_service_photo_gps
  AFTER INSERT ON public.service_photos
  FOR EACH ROW EXECUTE FUNCTION public.validate_service_photo_gps();

-- =========================================================================
-- 8. Helpful view for live ops counters
-- =========================================================================
CREATE OR REPLACE VIEW public.v_live_ops_today AS
SELECT
  (SELECT count(*) FROM services WHERE scheduled_date = CURRENT_DATE AND partner_id IS NOT NULL) AS assigned_today,
  (SELECT count(*) FROM services WHERE scheduled_date = CURRENT_DATE AND status='completed') AS completed_today,
  (SELECT count(*) FROM services WHERE scheduled_date = CURRENT_DATE AND status IN ('pending','in_progress')) AS pending_today,
  (SELECT count(*) FROM services WHERE scheduled_date = CURRENT_DATE AND status='unavailable') AS unavailable_today,
  (SELECT count(*) FROM dirty_vehicle_reports WHERE created_at::date = CURRENT_DATE) AS dirty_today,
  (SELECT count(*) FROM parking_reports WHERE created_at::date = CURRENT_DATE) AS parking_today,
  (SELECT count(*) FROM services WHERE fraud_review = true AND scheduled_date >= CURRENT_DATE - 7) AS fraud_flags_week;

GRANT SELECT ON public.v_live_ops_today TO authenticated, service_role;
