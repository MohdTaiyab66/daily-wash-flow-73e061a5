
DROP FUNCTION IF EXISTS public.get_coverage_at(double precision, double precision) CASCADE;

-- =========================================================================
-- Phase 1: Schema additions
-- =========================================================================
ALTER TABLE public.coverage_zones DROP CONSTRAINT IF EXISTS coverage_zones_status_check;
ALTER TABLE public.coverage_zones ADD CONSTRAINT coverage_zones_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'coming_soon'::text]));

ALTER TABLE public.coverage_zones
  ADD COLUMN IF NOT EXISTS max_cars_per_partner int NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS max_route_distance_km numeric NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS max_travel_time_min int NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS start_time time NOT NULL DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS finish_time time NOT NULL DEFAULT '14:00',
  ADD COLUMN IF NOT EXISTS preferred_partner_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS backup_partner_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS neighbour_expand boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.coverage_zone_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES public.coverage_zones(id) ON DELETE CASCADE,
  date_from date,
  date_to date,
  recurring_dow int[] DEFAULT '{}',
  daily_shine_on boolean NOT NULL DEFAULT true,
  premium_on boolean NOT NULL DEFAULT true,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coverage_zone_calendar TO authenticated, anon;
GRANT ALL ON public.coverage_zone_calendar TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.coverage_zone_calendar TO authenticated;
ALTER TABLE public.coverage_zone_calendar ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calendar read all" ON public.coverage_zone_calendar;
DROP POLICY IF EXISTS "calendar admin write" ON public.coverage_zone_calendar;
CREATE POLICY "calendar read all" ON public.coverage_zone_calendar FOR SELECT USING (true);
CREATE POLICY "calendar admin write" ON public.coverage_zone_calendar
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS coverage_zone_calendar_zone_idx ON public.coverage_zone_calendar(zone_id);

CREATE TABLE IF NOT EXISTS public.coverage_zone_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  reason text,
  operator uuid,
  at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.coverage_zone_history TO authenticated;
GRANT ALL ON public.coverage_zone_history TO service_role;
ALTER TABLE public.coverage_zone_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "history admin read" ON public.coverage_zone_history;
DROP POLICY IF EXISTS "history admin insert" ON public.coverage_zone_history;
CREATE POLICY "history admin read" ON public.coverage_zone_history
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "history admin insert" ON public.coverage_zone_history
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS coverage_zone_history_zone_idx ON public.coverage_zone_history(zone_id, at DESC);

CREATE TABLE IF NOT EXISTS public.coverage_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid REFERENCES public.coverage_zones(id) ON DELETE CASCADE,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  message text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.coverage_alerts TO authenticated;
GRANT ALL ON public.coverage_alerts TO service_role;
ALTER TABLE public.coverage_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "alerts admin all" ON public.coverage_alerts;
CREATE POLICY "alerts admin all" ON public.coverage_alerts
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS coverage_alerts_open_idx ON public.coverage_alerts(zone_id, kind) WHERE resolved_at IS NULL;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.coverage_zone_calendar; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.coverage_alerts; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.coverage_zone_history; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

CREATE OR REPLACE FUNCTION public.tg_coverage_zones_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE op uuid;
BEGIN
  BEGIN op := auth.uid(); EXCEPTION WHEN OTHERS THEN op := NULL; END;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.coverage_zone_history(zone_id, action, after, operator)
    VALUES (NEW.id, 'created', to_jsonb(NEW), op);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.coverage_zone_history(zone_id, action, before, after, operator)
    VALUES (NEW.id,
      CASE WHEN OLD.status <> NEW.status AND NEW.status='paused' THEN 'paused'
           WHEN OLD.status <> NEW.status AND NEW.status='active' THEN 'resumed'
           ELSE 'updated' END,
      to_jsonb(OLD), to_jsonb(NEW), op);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.coverage_zone_history(zone_id, action, before, operator)
    VALUES (OLD.id, 'deleted', to_jsonb(OLD), op);
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_coverage_zones_history ON public.coverage_zones;
CREATE TRIGGER trg_coverage_zones_history
  AFTER INSERT OR UPDATE OR DELETE ON public.coverage_zones
  FOR EACH ROW EXECUTE FUNCTION public.tg_coverage_zones_history();

-- =========================================================================
-- Phase 2: Core RPCs
-- =========================================================================
CREATE OR REPLACE FUNCTION public.zone_calendar_mask(p_zone uuid, p_date date)
RETURNS TABLE(daily_shine_on boolean, premium_on boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH eff AS (
    SELECT c.daily_shine_on, c.premium_on
    FROM coverage_zone_calendar c
    WHERE c.zone_id = p_zone
      AND (
        (c.date_from IS NOT NULL AND c.date_to IS NOT NULL AND p_date BETWEEN c.date_from AND c.date_to)
        OR (c.date_from IS NOT NULL AND c.date_to IS NULL AND p_date = c.date_from)
        OR (c.recurring_dow IS NOT NULL AND EXTRACT(DOW FROM p_date)::int = ANY(c.recurring_dow))
      )
  )
  SELECT COALESCE(bool_and(daily_shine_on), true),
         COALESCE(bool_and(premium_on), true)
  FROM eff;
$$;
GRANT EXECUTE ON FUNCTION public.zone_calendar_mask(uuid, date) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.get_zone_capacity(p_zone uuid, p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE(daily_capacity int, booked int, remaining int, used_pct numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE z public.coverage_zones%ROWTYPE; partner_count int := 0; cap int := 0; bkd int := 0;
BEGIN
  SELECT * INTO z FROM coverage_zones WHERE id = p_zone;
  IF z.id IS NULL THEN RETURN; END IF;
  SELECT COUNT(*) INTO partner_count FROM partners p
  WHERE p.status = 'approved' AND p.home_lat IS NOT NULL AND p.home_lng IS NOT NULL
    AND (z.bbox_min_lat IS NULL OR p.home_lat BETWEEN z.bbox_min_lat AND z.bbox_max_lat)
    AND (z.bbox_min_lng IS NULL OR p.home_lng BETWEEN z.bbox_min_lng AND z.bbox_max_lng);
  cap := COALESCE(z.max_daily_capacity, partner_count * z.max_cars_per_partner);
  SELECT COUNT(*) INTO bkd FROM assignments a
  WHERE a.scheduled_date = p_date AND a.status::text IN ('pending','in_progress','completed')
    AND a.customer_id IN (
      SELECT c.id FROM customers c
      WHERE c.latitude IS NOT NULL AND c.longitude IS NOT NULL
        AND (z.bbox_min_lat IS NULL OR c.latitude BETWEEN z.bbox_min_lat AND z.bbox_max_lat)
        AND (z.bbox_min_lng IS NULL OR c.longitude BETWEEN z.bbox_min_lng AND z.bbox_max_lng)
    );
  daily_capacity := cap; booked := bkd; remaining := GREATEST(cap - bkd, 0);
  used_pct := CASE WHEN cap > 0 THEN ROUND((bkd::numeric / cap) * 100, 1) ELSE 0 END;
  RETURN NEXT;
END $$;
GRANT EXECUTE ON FUNCTION public.get_zone_capacity(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_daily_shine_open(p_zone uuid, p_date date DEFAULT CURRENT_DATE)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE z public.coverage_zones%ROWTYPE; m record; cap record;
BEGIN
  SELECT * INTO z FROM coverage_zones WHERE id = p_zone;
  IF z.id IS NULL OR z.status <> 'active' OR NOT z.daily_shine_enabled THEN RETURN false; END IF;
  SELECT * INTO m FROM zone_calendar_mask(p_zone, p_date);
  IF NOT m.daily_shine_on THEN RETURN false; END IF;
  SELECT * INTO cap FROM get_zone_capacity(p_zone, p_date);
  RETURN cap.remaining > 0;
END $$;
GRANT EXECUTE ON FUNCTION public.is_daily_shine_open(uuid, date) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.get_zone_dashboard()
RETURNS TABLE(
  zone_id uuid, zone_name text, status text,
  daily_shine_enabled boolean, premium_enabled boolean,
  active_customers int, ds_customers int, premium_customers int,
  active_partners int, available_partners int,
  marketplace_queue int, leads_pending int,
  services_today int, services_completed int,
  revenue_today numeric, revenue_month numeric,
  renewals_today int, complaints_open int, avg_rating numeric,
  daily_capacity int, booked int, remaining int, capacity_used_pct numeric,
  calendar_ds_on boolean, calendar_premium_on boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE z record; cap record; mask record;
BEGIN
  FOR z IN SELECT * FROM coverage_zones ORDER BY priority DESC, name LOOP
    SELECT * INTO cap FROM get_zone_capacity(z.id, CURRENT_DATE);
    SELECT * INTO mask FROM zone_calendar_mask(z.id, CURRENT_DATE);
    zone_id := z.id; zone_name := z.name; status := z.status;
    daily_shine_enabled := z.daily_shine_enabled; premium_enabled := z.premium_enabled;

    SELECT COUNT(*) INTO active_customers FROM customers c
      WHERE c.is_active = true AND c.latitude IS NOT NULL
        AND (z.bbox_min_lat IS NULL OR c.latitude BETWEEN z.bbox_min_lat AND z.bbox_max_lat)
        AND (z.bbox_min_lng IS NULL OR c.longitude BETWEEN z.bbox_min_lng AND z.bbox_max_lng);

    SELECT COUNT(*) INTO ds_customers FROM subscriptions s
      LEFT JOIN customer_profiles cp ON cp.user_id = s.user_id
      WHERE s.status='active'
        AND (cp.lat IS NULL OR z.bbox_min_lat IS NULL
             OR (cp.lat BETWEEN z.bbox_min_lat AND z.bbox_max_lat
                 AND cp.lng BETWEEN z.bbox_min_lng AND z.bbox_max_lng));

    premium_customers := GREATEST(active_customers - ds_customers, 0);

    SELECT COUNT(*) INTO active_partners FROM partners p
      WHERE p.status='approved' AND p.home_lat IS NOT NULL
        AND (z.bbox_min_lat IS NULL OR p.home_lat BETWEEN z.bbox_min_lat AND z.bbox_max_lat)
        AND (z.bbox_min_lng IS NULL OR p.home_lng BETWEEN z.bbox_min_lng AND z.bbox_max_lng);
    SELECT COUNT(*) INTO available_partners FROM partners p
      WHERE p.status='approved' AND COALESCE(p.accepting_new,true) AND p.home_lat IS NOT NULL
        AND (z.bbox_min_lat IS NULL OR p.home_lat BETWEEN z.bbox_min_lat AND z.bbox_max_lat)
        AND (z.bbox_min_lng IS NULL OR p.home_lng BETWEEN z.bbox_min_lng AND z.bbox_max_lng);

    SELECT COUNT(*) INTO marketplace_queue FROM subscription_assignment_queue q
      WHERE q.status IN ('pending','offered') AND q.lat IS NOT NULL
        AND (z.bbox_min_lat IS NULL OR q.lat BETWEEN z.bbox_min_lat AND z.bbox_max_lat)
        AND (z.bbox_min_lng IS NULL OR q.lng BETWEEN z.bbox_min_lng AND z.bbox_max_lng);

    SELECT COUNT(*) INTO leads_pending FROM service_leads l
      WHERE l.status IN ('pending','assigned');

    SELECT COUNT(*) INTO services_today FROM assignments a
      WHERE a.scheduled_date = CURRENT_DATE
        AND a.customer_id IN (SELECT id FROM customers c WHERE c.latitude IS NOT NULL
          AND (z.bbox_min_lat IS NULL OR c.latitude BETWEEN z.bbox_min_lat AND z.bbox_max_lat)
          AND (z.bbox_min_lng IS NULL OR c.longitude BETWEEN z.bbox_min_lng AND z.bbox_max_lng));
    SELECT COUNT(*) INTO services_completed FROM assignments a
      WHERE a.scheduled_date = CURRENT_DATE AND a.status::text='completed'
        AND a.customer_id IN (SELECT id FROM customers c WHERE c.latitude IS NOT NULL
          AND (z.bbox_min_lat IS NULL OR c.latitude BETWEEN z.bbox_min_lat AND z.bbox_max_lat)
          AND (z.bbox_min_lng IS NULL OR c.longitude BETWEEN z.bbox_min_lng AND z.bbox_max_lng));

    SELECT COALESCE(SUM(p.amount),0) INTO revenue_today FROM payments p
      WHERE p.status='captured' AND p.created_at::date = CURRENT_DATE;
    SELECT COALESCE(SUM(p.amount),0) INTO revenue_month FROM payments p
      WHERE p.status='captured' AND p.created_at >= date_trunc('month', CURRENT_DATE);

    SELECT COUNT(*) INTO renewals_today FROM customers c
      WHERE c.subscription_end = CURRENT_DATE AND c.latitude IS NOT NULL
        AND (z.bbox_min_lat IS NULL OR c.latitude BETWEEN z.bbox_min_lat AND z.bbox_max_lat);

    SELECT COUNT(*) INTO complaints_open FROM complaints co
      WHERE co.status::text IN ('open','pending','investigating');

    SELECT COALESCE(AVG(p.rating),0) INTO avg_rating FROM partners p
      WHERE p.status='approved' AND p.home_lat IS NOT NULL
        AND (z.bbox_min_lat IS NULL OR p.home_lat BETWEEN z.bbox_min_lat AND z.bbox_max_lat);

    daily_capacity := cap.daily_capacity; booked := cap.booked;
    remaining := cap.remaining; capacity_used_pct := cap.used_pct;
    calendar_ds_on := mask.daily_shine_on; calendar_premium_on := mask.premium_on;
    RETURN NEXT;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.get_zone_dashboard() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_coverage_at(p_lat double precision, p_lng double precision)
RETURNS TABLE(
  matched boolean, status text, zone_id uuid, zone_name text,
  daily_shine boolean, premium boolean,
  washing boolean, interior boolean, exterior boolean, int_ext boolean,
  deep_clean boolean, polish boolean, cutter_polish boolean,
  roof_cleaning boolean, seat_cleaning boolean, corporate_fleet boolean, emergency boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE z record; m record;
BEGIN
  SELECT * INTO z FROM coverage_zones cz
  WHERE cz.status IN ('active','paused')
    AND (cz.bbox_min_lat IS NULL OR p_lat BETWEEN cz.bbox_min_lat AND cz.bbox_max_lat)
    AND (cz.bbox_min_lng IS NULL OR p_lng BETWEEN cz.bbox_min_lng AND cz.bbox_max_lng)
    AND (
      cz.zone_type='polygon'
      OR (cz.zone_type='radius' AND cz.center_lat IS NOT NULL
          AND 6371000 * 2 * asin(sqrt(
            sin(radians((p_lat - cz.center_lat)/2))^2
            + cos(radians(cz.center_lat)) * cos(radians(p_lat))
              * sin(radians((p_lng - cz.center_lng)/2))^2
          )) <= cz.radius_m)
    )
  ORDER BY cz.priority DESC LIMIT 1;
  IF z.id IS NULL THEN matched := false; RETURN NEXT; RETURN; END IF;
  SELECT * INTO m FROM zone_calendar_mask(z.id, CURRENT_DATE);
  matched := true; status := z.status;
  zone_id := z.id; zone_name := z.name;
  daily_shine := z.daily_shine_enabled AND z.status='active' AND m.daily_shine_on
                 AND is_daily_shine_open(z.id, CURRENT_DATE);
  premium := z.premium_enabled AND z.status='active' AND m.premium_on;
  washing := z.washing_enabled AND premium;
  interior := z.interior_enabled AND premium;
  exterior := z.exterior_enabled AND premium;
  int_ext := z.int_ext_enabled AND premium;
  deep_clean := z.deep_clean_enabled AND premium;
  polish := z.polish_enabled AND premium;
  cutter_polish := z.cutter_polish_enabled AND premium;
  roof_cleaning := z.roof_cleaning_enabled AND premium;
  seat_cleaning := z.seat_cleaning_enabled AND premium;
  corporate_fleet := z.corporate_fleet_enabled AND premium;
  emergency := z.emergency_enabled AND premium;
  RETURN NEXT;
END $$;
GRANT EXECUTE ON FUNCTION public.get_coverage_at(double precision, double precision) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.admin_zone_calendar_upsert(
  p_id uuid, p_zone uuid, p_from date, p_to date, p_dow int[],
  p_ds boolean, p_premium boolean, p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO coverage_zone_calendar(zone_id,date_from,date_to,recurring_dow,daily_shine_on,premium_on,reason,created_by)
    VALUES (p_zone,p_from,p_to,COALESCE(p_dow,'{}'),COALESCE(p_ds,true),COALESCE(p_premium,true),p_reason,auth.uid())
    RETURNING id INTO rid;
  ELSE
    UPDATE coverage_zone_calendar SET zone_id=p_zone, date_from=p_from, date_to=p_to,
      recurring_dow=COALESCE(p_dow,'{}'), daily_shine_on=COALESCE(p_ds,true),
      premium_on=COALESCE(p_premium,true), reason=p_reason WHERE id=p_id RETURNING id INTO rid;
  END IF;
  RETURN rid;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_zone_calendar_upsert(uuid,uuid,date,date,int[],boolean,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_zone_calendar_delete(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM coverage_zone_calendar WHERE id = p_id;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_zone_calendar_delete(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_zone_rollback(p_history_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h record; zid uuid;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO h FROM coverage_zone_history WHERE id = p_history_id;
  IF h.before IS NULL THEN RAISE EXCEPTION 'no prior snapshot'; END IF;
  zid := (h.before->>'id')::uuid;
  UPDATE coverage_zones SET
    name = h.before->>'name',
    status = h.before->>'status',
    daily_shine_enabled = (h.before->>'daily_shine_enabled')::boolean,
    premium_enabled = (h.before->>'premium_enabled')::boolean,
    radius_m = NULLIF(h.before->>'radius_m','')::int,
    center_lat = NULLIF(h.before->>'center_lat','')::double precision,
    center_lng = NULLIF(h.before->>'center_lng','')::double precision,
    polygon = h.before->'polygon',
    priority = (h.before->>'priority')::int,
    max_cars_per_partner = COALESCE(NULLIF(h.before->>'max_cars_per_partner','')::int, 30),
    updated_at = now()
  WHERE id = zid;
  RETURN zid;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_zone_rollback(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_resolve_alert(p_alert uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE coverage_alerts SET resolved_at = now() WHERE id = p_alert;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_resolve_alert(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.simulate_zone_change(p_zone uuid, p_patch jsonb)
RETURNS TABLE(
  delta_houses int, delta_customers int, delta_requests int,
  delta_partners int, est_monthly_revenue numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE z public.coverage_zones%ROWTYPE; new_radius numeric;
  cur_partners int; new_partners int; cur_cust int; new_cust int; cur_req int; new_req int;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO z FROM coverage_zones WHERE id = p_zone;
  IF z.id IS NULL THEN RETURN; END IF;
  new_radius := COALESCE((p_patch->>'radius_m')::numeric, z.radius_m);
  IF z.zone_type='radius' AND z.center_lat IS NOT NULL THEN
    SELECT COUNT(*) INTO cur_partners FROM partners p WHERE p.status='approved' AND p.home_lat IS NOT NULL
      AND 6371000 * 2 * asin(sqrt(sin(radians((p.home_lat - z.center_lat)/2))^2
        + cos(radians(z.center_lat))*cos(radians(p.home_lat))
          * sin(radians((p.home_lng - z.center_lng)/2))^2)) <= z.radius_m;
    SELECT COUNT(*) INTO new_partners FROM partners p WHERE p.status='approved' AND p.home_lat IS NOT NULL
      AND 6371000 * 2 * asin(sqrt(sin(radians((p.home_lat - z.center_lat)/2))^2
        + cos(radians(z.center_lat))*cos(radians(p.home_lat))
          * sin(radians((p.home_lng - z.center_lng)/2))^2)) <= new_radius;
    SELECT COUNT(*) INTO cur_cust FROM customers c WHERE c.is_active AND c.latitude IS NOT NULL
      AND 6371000 * 2 * asin(sqrt(sin(radians((c.latitude - z.center_lat)/2))^2
        + cos(radians(z.center_lat))*cos(radians(c.latitude))
          * sin(radians((c.longitude - z.center_lng)/2))^2)) <= z.radius_m;
    SELECT COUNT(*) INTO new_cust FROM customers c WHERE c.is_active AND c.latitude IS NOT NULL
      AND 6371000 * 2 * asin(sqrt(sin(radians((c.latitude - z.center_lat)/2))^2
        + cos(radians(z.center_lat))*cos(radians(c.latitude))
          * sin(radians((c.longitude - z.center_lng)/2))^2)) <= new_radius;
    SELECT COUNT(*) INTO cur_req FROM expansion_requests e WHERE e.lat IS NOT NULL
      AND 6371000 * 2 * asin(sqrt(sin(radians((e.lat - z.center_lat)/2))^2
        + cos(radians(z.center_lat))*cos(radians(e.lat))
          * sin(radians((e.lng - z.center_lng)/2))^2)) <= z.radius_m;
    SELECT COUNT(*) INTO new_req FROM expansion_requests e WHERE e.lat IS NOT NULL
      AND 6371000 * 2 * asin(sqrt(sin(radians((e.lat - z.center_lat)/2))^2
        + cos(radians(z.center_lat))*cos(radians(e.lat))
          * sin(radians((e.lng - z.center_lng)/2))^2)) <= new_radius;
  ELSE
    cur_partners := 0; new_partners := 0; cur_cust := 0; new_cust := 0; cur_req := 0; new_req := 0;
  END IF;
  delta_houses := (new_cust - cur_cust) * 4;
  delta_customers := new_cust - cur_cust;
  delta_requests := new_req - cur_req;
  delta_partners := new_partners - cur_partners;
  est_monthly_revenue := delta_customers * 899;
  RETURN NEXT;
END $$;
GRANT EXECUTE ON FUNCTION public.simulate_zone_change(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.rank_expansion_requests()
RETURNS TABLE(
  area text, requests int, ds_count int, premium_count int,
  nearest_zone text, nearest_distance_km numeric,
  potential_revenue numeric, suggested_priority text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; z record; d numeric; best_d numeric; best_name text;
BEGIN
  FOR r IN
    SELECT COALESCE(area_name, pincode, 'Unknown') AS area,
           COUNT(*)::int AS requests,
           SUM(CASE WHEN interested_service='daily_shine' THEN 1 ELSE 0 END)::int AS ds_count,
           SUM(CASE WHEN interested_service='premium' THEN 1 ELSE 0 END)::int AS premium_count,
           AVG(lat) AS lat, AVG(lng) AS lng
    FROM expansion_requests GROUP BY 1
  LOOP
    area := r.area; requests := r.requests; ds_count := r.ds_count; premium_count := r.premium_count;
    best_d := NULL; best_name := NULL;
    IF r.lat IS NOT NULL THEN
      FOR z IN SELECT name, center_lat, center_lng FROM coverage_zones WHERE center_lat IS NOT NULL LOOP
        d := 6371 * 2 * asin(sqrt(sin(radians((r.lat - z.center_lat)/2))^2
          + cos(radians(z.center_lat)) * cos(radians(r.lat))
            * sin(radians((r.lng - z.center_lng)/2))^2));
        IF best_d IS NULL OR d < best_d THEN best_d := d; best_name := z.name; END IF;
      END LOOP;
    END IF;
    nearest_zone := best_name;
    nearest_distance_km := ROUND(COALESCE(best_d,0)::numeric, 2);
    potential_revenue := r.requests * 899;
    suggested_priority := CASE WHEN r.requests >= 20 THEN 'high'
      WHEN r.requests >= 5 THEN 'medium' ELSE 'low' END;
    RETURN NEXT;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.rank_expansion_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.compute_coverage_alerts()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE z record; cap record; n int := 0; ap int;
BEGIN
  FOR z IN SELECT * FROM coverage_zones WHERE status='active' LOOP
    SELECT * INTO cap FROM get_zone_capacity(z.id, CURRENT_DATE);
    IF cap.daily_capacity > 0 AND cap.used_pct >= 90 THEN
      INSERT INTO coverage_alerts(zone_id, kind, severity, message, payload)
      SELECT z.id, 'capacity_90', 'warning',
             z.name||' is at '||cap.used_pct||'% capacity',
             jsonb_build_object('used_pct', cap.used_pct, 'remaining', cap.remaining)
      WHERE NOT EXISTS (SELECT 1 FROM coverage_alerts a WHERE a.zone_id=z.id AND a.kind='capacity_90' AND a.resolved_at IS NULL);
      n := n + 1;
    END IF;
    SELECT COUNT(*) INTO ap FROM partners p WHERE p.status='approved' AND p.home_lat IS NOT NULL
      AND (z.bbox_min_lat IS NULL OR p.home_lat BETWEEN z.bbox_min_lat AND z.bbox_max_lat);
    IF ap = 0 THEN
      INSERT INTO coverage_alerts(zone_id, kind, severity, message)
      SELECT z.id, 'no_partners', 'critical', z.name||' has no active partners'
      WHERE NOT EXISTS (SELECT 1 FROM coverage_alerts a WHERE a.zone_id=z.id AND a.kind='no_partners' AND a.resolved_at IS NULL);
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.compute_coverage_alerts() TO authenticated, service_role;
