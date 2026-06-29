
-- ============================================================
-- PHASE 1.5 — Settings cleanup
-- ============================================================

-- Helper: read a boolean platform setting safely
CREATE OR REPLACE FUNCTION public._setting_bool(_key text, _default boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT (value)::text::boolean FROM public.platform_settings WHERE key = _key), _default)
$$;

CREATE OR REPLACE FUNCTION public._setting_num(_key text, _default numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT (value)::text::numeric FROM public.platform_settings WHERE key = _key), _default)
$$;

-- Category-aware partner notification helper.
CREATE OR REPLACE FUNCTION public.send_partner_notification(
  p_partner_id uuid,
  p_category text,         -- offer|assignment|completion|wallet|attendance|reminder|route_updated|dar_offer
  p_type text,
  p_title text,
  p_body text DEFAULT NULL,
  p_link text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key text;
  v_enabled boolean := true;
  v_id uuid;
BEGIN
  v_key := CASE p_category
    WHEN 'offer'        THEN 'notify_offer'
    WHEN 'dar_offer'    THEN 'notify_offer'
    WHEN 'assignment'   THEN 'notify_assignment'
    WHEN 'completion'   THEN 'notify_completion'
    WHEN 'wallet'       THEN 'notify_wallet'
    WHEN 'attendance'   THEN 'notify_attendance'
    WHEN 'reminder'     THEN 'notify_reminder'
    ELSE NULL
  END;
  IF v_key IS NOT NULL THEN
    v_enabled := public._setting_bool(v_key, true);
  END IF;
  IF NOT v_enabled THEN RETURN NULL; END IF;

  INSERT INTO public.partner_notifications (partner_id, type, title, body, link, metadata)
  VALUES (p_partner_id, p_type, p_title, p_body, p_link, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.send_partner_notification(uuid,text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_partner_notification(uuid,text,text,text,text,text,jsonb) TO service_role;

-- UI prefs RPC for partner app.
CREATE OR REPLACE FUNCTION public.get_partner_ui_prefs()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'sound_enabled',       public._setting_bool('sound_enabled', true),
    'vibration_enabled',   public._setting_bool('vibration_enabled', true),
    'notify_offer',        public._setting_bool('notify_offer', true),
    'notify_assignment',   public._setting_bool('notify_assignment', true),
    'notify_completion',   public._setting_bool('notify_completion', true),
    'notify_wallet',       public._setting_bool('notify_wallet', true),
    'notify_attendance',   public._setting_bool('notify_attendance', true),
    'notify_reminder',     public._setting_bool('notify_reminder', true),
    'allow_partner_cancel',public._setting_bool('allow_partner_cancel', true)
  )
$$;
GRANT EXECUTE ON FUNCTION public.get_partner_ui_prefs() TO authenticated;

-- Enforce allow_partner_cancel.
CREATE OR REPLACE FUNCTION public.cancel_assignment(p_assignment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_partner uuid := auth.uid();
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public._setting_bool('allow_partner_cancel', true) THEN
    RAISE EXCEPTION 'Partner cancellation is disabled by admin';
  END IF;
  DELETE FROM public.services
   WHERE assignment_id = p_assignment_id AND partner_id = v_partner
     AND scheduled_date >= CURRENT_DATE AND status = 'pending';
  UPDATE public.assignments
     SET status = 'cancelled', completed_at = now()
   WHERE id = p_assignment_id AND partner_id = v_partner AND status = 'active';
  UPDATE public.partners SET cars_selected = 0, updated_at = now() WHERE id = v_partner;
END $$;

-- ============================================================
-- PHASE 2 — DAR schema
-- ============================================================

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS original_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recovery_event_id uuid;

CREATE TABLE IF NOT EXISTS public.dar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('absent','unavailable','cancelled','offline','suspended','manual')),
  triggered_at timestamptz NOT NULL DEFAULT now(),
  scheduled_date date NOT NULL DEFAULT CURRENT_DATE,
  affected_service_ids uuid[] NOT NULL DEFAULT '{}',
  affected_count int NOT NULL DEFAULT 0,
  recovered_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','offered','recovered','partial','expired','cancelled')),
  resolved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dar_events TO authenticated;
GRANT ALL ON public.dar_events TO service_role;
ALTER TABLE public.dar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read dar_events" ON public.dar_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_dar_events_status ON public.dar_events(status, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_dar_events_partner ON public.dar_events(partner_id, triggered_at DESC);

CREATE TABLE IF NOT EXISTS public.dar_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.dar_events(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  service_ids uuid[] NOT NULL DEFAULT '{}',
  service_count int NOT NULL DEFAULT 0,
  score numeric(8,3) NOT NULL DEFAULT 0,
  extra_distance_km numeric(6,2) NOT NULL DEFAULT 0,
  extra_time_min int NOT NULL DEFAULT 0,
  extra_monthly_earnings numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','partial','ignored','expired','cancelled')),
  accepted_service_ids uuid[] NOT NULL DEFAULT '{}',
  sent_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.dar_offers TO authenticated;
GRANT ALL ON public.dar_offers TO service_role;
ALTER TABLE public.dar_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partner reads own dar_offers" ON public.dar_offers FOR SELECT TO authenticated
  USING (partner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "partner updates own dar_offers" ON public.dar_offers FOR UPDATE TO authenticated
  USING (partner_id = auth.uid()) WITH CHECK (partner_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_dar_offers_partner_status ON public.dar_offers(partner_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_dar_offers_event ON public.dar_offers(event_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.dar_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dar_offers;

-- ============================================================
-- DAR functions
-- ============================================================

-- Haversine helper (km)
CREATE OR REPLACE FUNCTION public._haversine_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN lat1 IS NULL OR lat2 IS NULL THEN NULL ELSE
    2 * 6371 * asin(sqrt(
      sin(radians((lat2-lat1)/2))^2 +
      cos(radians(lat1)) * cos(radians(lat2)) * sin(radians((lng2-lng1)/2))^2
    )) END
$$;

-- Find candidate partners and create offers
CREATE OR REPLACE FUNCTION public.dar_find_candidates(p_event_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event public.dar_events%ROWTYPE;
  v_radius numeric;
  v_max_extra int;
  v_min_cap numeric;
  v_min_earn numeric;
  v_emergency boolean;
  v_timeout int;
  v_rate numeric;
  v_center_lat numeric;
  v_center_lng numeric;
  v_count int := 0;
  v_cand record;
BEGIN
  SELECT * INTO v_event FROM public.dar_events WHERE id = p_event_id;
  IF NOT FOUND OR array_length(v_event.affected_service_ids,1) IS NULL THEN RETURN 0; END IF;

  v_radius := public._setting_num('dar.search_radius_km', 5);
  v_max_extra := public._setting_num('dar.max_extra_cars', 8)::int;
  v_min_cap := public._setting_num('dar.min_remaining_capacity', 1);
  v_min_earn := public._setting_num('dar.min_earnings_per_offer', 100);
  v_emergency := public._setting_bool('dar.emergency_mode', false);
  v_timeout := public._setting_num('dar.partner_notification_timeout_sec', 120)::int;
  v_rate := public._setting_num('rate_per_car', 120);

  -- centroid of released services
  SELECT AVG(c.latitude)::numeric, AVG(c.longitude)::numeric
    INTO v_center_lat, v_center_lng
  FROM public.services s
  JOIN public.customers c ON c.id = s.customer_id
  WHERE s.id = ANY(v_event.affected_service_ids);

  IF v_center_lat IS NULL THEN RETURN 0; END IF;

  FOR v_cand IN
    SELECT p.id,
           p.reliability_score,
           p.max_daily_cars,
           public._haversine_km(v_center_lat, v_center_lng,
             COALESCE(p.current_lat, p.home_lat), COALESCE(p.current_lng, p.home_lng)) AS dist_km,
           (p.max_daily_cars - p.cars_selected) AS remaining_cap
    FROM public.partners p
    WHERE p.id <> v_event.partner_id
      AND p.status = 'active'
      AND p.availability = 'online'
      AND p.accepting_new = true
      AND (p.max_daily_cars - p.cars_selected) >= v_min_cap
      AND COALESCE(p.current_lat, p.home_lat) IS NOT NULL
  LOOP
    IF v_cand.dist_km IS NULL OR v_cand.dist_km > v_radius THEN CONTINUE; END IF;
    DECLARE
      v_service_ids uuid[];
      v_take int;
      v_extra_earnings numeric;
      v_extra_time int;
      v_score numeric;
    BEGIN
      v_take := LEAST(v_cand.remaining_cap::int, v_max_extra, array_length(v_event.affected_service_ids,1));
      IF v_take <= 0 THEN CONTINUE; END IF;
      v_service_ids := v_event.affected_service_ids[1:v_take];
      v_extra_earnings := v_take * v_rate * 30; -- monthly projection
      IF NOT v_emergency AND v_extra_earnings < v_min_earn THEN CONTINUE; END IF;
      v_extra_time := v_take * 15 + (v_cand.dist_km * 3)::int;
      v_score := (v_cand.reliability_score::numeric * 0.4)
               + (GREATEST(0, v_radius - v_cand.dist_km) / NULLIF(v_radius,0) * 100 * 0.4)
               + (v_cand.remaining_cap::numeric / NULLIF(v_cand.max_daily_cars,0) * 100 * 0.2);

      INSERT INTO public.dar_offers (event_id, partner_id, service_ids, service_count, score,
        extra_distance_km, extra_time_min, extra_monthly_earnings, expires_at)
      VALUES (p_event_id, v_cand.id, v_service_ids, v_take, v_score,
        v_cand.dist_km, v_extra_time, v_extra_earnings, now() + (v_timeout || ' seconds')::interval);

      PERFORM public.send_partner_notification(
        v_cand.id, 'dar_offer', 'extra_cars_offer',
        'Extra customers available',
        v_take || ' nearby customers • +₹' || round(v_extra_earnings)::text || '/month',
        '/app/live', jsonb_build_object('event_id', p_event_id)
      );
      v_count := v_count + 1;
    END;
  END LOOP;

  IF v_count > 0 THEN
    UPDATE public.dar_events SET status = 'offered' WHERE id = p_event_id AND status = 'pending';
  END IF;
  RETURN v_count;
END $$;

-- Trigger recovery for a partner
CREATE OR REPLACE FUNCTION public.dar_trigger_recovery(p_partner_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event_id uuid;
  v_ids uuid[];
BEGIN
  IF NOT public._setting_bool('dar.enabled', true) THEN RETURN NULL; END IF;

  -- Collect today's pending services owned by this partner
  SELECT array_agg(s.id) INTO v_ids
  FROM public.services s
  JOIN public.assignments a ON a.id = s.assignment_id
  WHERE s.partner_id = p_partner_id
    AND s.scheduled_date = CURRENT_DATE
    AND s.status = 'pending';
  IF v_ids IS NULL OR array_length(v_ids,1) = 0 THEN RETURN NULL; END IF;

  INSERT INTO public.dar_events (partner_id, reason, affected_service_ids, affected_count, scheduled_date)
  VALUES (p_partner_id, p_reason, v_ids, array_length(v_ids,1), CURRENT_DATE)
  RETURNING id INTO v_event_id;

  -- Release: clear partner, stamp audit columns
  UPDATE public.services
     SET original_partner_id = COALESCE(original_partner_id, partner_id),
         partner_id = NULL,
         recovery_event_id = v_event_id,
         updated_at = now()
   WHERE id = ANY(v_ids);

  PERFORM public.dar_find_candidates(v_event_id);
  RETURN v_event_id;
END $$;
GRANT EXECUTE ON FUNCTION public.dar_trigger_recovery(uuid,text) TO service_role;

-- Trigger on partners table when status/availability change
CREATE OR REPLACE FUNCTION public.tg_partner_status_dar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reason text;
BEGIN
  v_reason := NULL;
  IF NEW.status = 'suspended' AND OLD.status <> 'suspended' THEN v_reason := 'suspended';
  ELSIF NEW.status = 'offline' AND OLD.status = 'active' THEN v_reason := 'offline';
  ELSIF NEW.availability IN ('leave','emergency_leave','offline') AND OLD.availability = 'online' THEN
    v_reason := CASE NEW.availability WHEN 'emergency_leave' THEN 'absent' WHEN 'leave' THEN 'unavailable' ELSE 'offline' END;
  END IF;
  IF v_reason IS NOT NULL THEN
    PERFORM public.dar_trigger_recovery(NEW.id, v_reason);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_partner_status_dar ON public.partners;
CREATE TRIGGER trg_partner_status_dar AFTER UPDATE OF status, availability ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.tg_partner_status_dar();

-- Accept offer
CREATE OR REPLACE FUNCTION public.dar_accept_offer(p_offer_id uuid, p_service_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_offer public.dar_offers%ROWTYPE;
  v_take uuid[];
  v_assignment_id uuid;
  v_recovered int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_offer FROM public.dar_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found'; END IF;
  IF v_offer.partner_id <> auth.uid() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v_offer.status <> 'pending' THEN RAISE EXCEPTION 'Offer not pending'; END IF;
  IF v_offer.expires_at < now() THEN
    UPDATE public.dar_offers SET status = 'expired', responded_at = now() WHERE id = p_offer_id;
    RAISE EXCEPTION 'Offer expired';
  END IF;

  v_take := COALESCE(p_service_ids, v_offer.service_ids);
  -- Filter to offer's allowed list
  v_take := ARRAY(SELECT x FROM unnest(v_take) x WHERE x = ANY(v_offer.service_ids));
  IF array_length(v_take,1) IS NULL THEN RAISE EXCEPTION 'No services selected'; END IF;

  -- Find or attach to caller's active assignment for today
  SELECT id INTO v_assignment_id FROM public.assignments
   WHERE partner_id = auth.uid() AND status = 'active'
     AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE
   ORDER BY start_date DESC LIMIT 1;

  UPDATE public.services
     SET partner_id = auth.uid(),
         assignment_id = COALESCE(v_assignment_id, assignment_id),
         updated_at = now()
   WHERE id = ANY(v_take) AND partner_id IS NULL AND recovery_event_id IS NOT NULL;

  GET DIAGNOSTICS v_recovered = ROW_COUNT;

  UPDATE public.dar_offers
     SET status = CASE WHEN v_recovered = array_length(v_offer.service_ids,1) THEN 'accepted' ELSE 'partial' END,
         accepted_service_ids = v_take,
         responded_at = now()
   WHERE id = p_offer_id;

  UPDATE public.dar_events
     SET recovered_count = recovered_count + v_recovered,
         status = CASE
           WHEN recovered_count + v_recovered >= affected_count THEN 'recovered'
           ELSE 'partial' END,
         resolved_at = CASE WHEN recovered_count + v_recovered >= affected_count THEN now() ELSE resolved_at END
   WHERE id = v_offer.event_id;

  -- Cancel sibling offers if everything recovered
  UPDATE public.dar_offers SET status = 'cancelled', responded_at = now()
   WHERE event_id = v_offer.event_id AND status = 'pending' AND id <> p_offer_id
     AND (SELECT recovered_count >= affected_count FROM public.dar_events WHERE id = v_offer.event_id);

  -- Re-optimize: bump cars_selected
  UPDATE public.partners SET cars_selected = cars_selected + v_recovered, updated_at = now()
   WHERE id = auth.uid();

  RETURN jsonb_build_object('recovered', v_recovered, 'event_id', v_offer.event_id);
END $$;
GRANT EXECUTE ON FUNCTION public.dar_accept_offer(uuid, uuid[]) TO authenticated;

-- Ignore offer
CREATE OR REPLACE FUNCTION public.dar_ignore_offer(p_offer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.dar_offers SET status = 'ignored', responded_at = now()
   WHERE id = p_offer_id AND partner_id = auth.uid() AND status = 'pending';
END $$;
GRANT EXECUTE ON FUNCTION public.dar_ignore_offer(uuid) TO authenticated;

-- Expire stale offers
CREATE OR REPLACE FUNCTION public.dar_expire_offers()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  UPDATE public.dar_offers SET status = 'expired', responded_at = now()
   WHERE status = 'pending' AND expires_at < now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  -- Mark events with no live offers and zero recovery as expired
  UPDATE public.dar_events e SET status = 'expired'
   WHERE e.status = 'offered'
     AND NOT EXISTS (SELECT 1 FROM public.dar_offers o WHERE o.event_id = e.id AND o.status = 'pending')
     AND e.recovered_count = 0;
  RETURN v_n;
END $$;
GRANT EXECUTE ON FUNCTION public.dar_expire_offers() TO service_role, authenticated;

-- Admin dashboard metrics
CREATE OR REPLACE FUNCTION public.dar_dashboard_metrics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH today AS (
    SELECT * FROM public.dar_events WHERE scheduled_date = CURRENT_DATE
  )
  SELECT jsonb_build_object(
    'released_customers',  COALESCE((SELECT SUM(affected_count) FROM today), 0),
    'pending_recovery',    COALESCE((SELECT SUM(affected_count - recovered_count) FROM today WHERE status IN ('pending','offered','partial')), 0),
    'recovered_customers', COALESCE((SELECT SUM(recovered_count) FROM today), 0),
    'avg_recovery_sec',    COALESCE((SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - triggered_at)))::int FROM today WHERE resolved_at IS NOT NULL), 0),
    'active_events',       (SELECT COUNT(*) FROM today WHERE status IN ('pending','offered','partial')),
    'pending_offers',      (SELECT COUNT(*) FROM public.dar_offers WHERE status='pending' AND expires_at > now()),
    'success_rate_pct',    COALESCE((SELECT ROUND(100.0 * SUM(recovered_count)::numeric / NULLIF(SUM(affected_count),0)) FROM today), 0),
    'partner_utilization', (SELECT COUNT(DISTINCT partner_id) FROM public.dar_offers WHERE status IN ('accepted','partial') AND DATE(sent_at) = CURRENT_DATE)
  )
$$;
GRANT EXECUTE ON FUNCTION public.dar_dashboard_metrics() TO authenticated;
