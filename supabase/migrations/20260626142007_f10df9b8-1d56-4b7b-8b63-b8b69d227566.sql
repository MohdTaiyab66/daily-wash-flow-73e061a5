
-- 1) push_tokens: add device_id, app, last_seen, invalid_at + unique(user_id, device_id, app)
ALTER TABLE public.push_tokens
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS app text NOT NULL DEFAULT 'partner',
  ADD COLUMN IF NOT EXISTS last_seen timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS invalid_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_user_device_app_uidx
  ON public.push_tokens (user_id, COALESCE(device_id,''), app);

CREATE INDEX IF NOT EXISTS push_tokens_active_idx
  ON public.push_tokens (user_id) WHERE invalid_at IS NULL;

-- 2) offer_delivery_events
CREATE TABLE IF NOT EXISTS public.offer_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid REFERENCES public.subscription_offers(id) ON DELETE CASCADE,
  queue_id uuid REFERENCES public.subscription_assignment_queue(id) ON DELETE CASCADE,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  stage text NOT NULL CHECK (stage IN (
    'created','queued','selected','push_sent','push_delivered','opened',
    'popup_displayed','accepted','declined','timed_out','reassigned','completed','push_failed'
  )),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ode_offer_idx ON public.offer_delivery_events(offer_id, created_at);
CREATE INDEX IF NOT EXISTS ode_queue_idx ON public.offer_delivery_events(queue_id, created_at);
CREATE INDEX IF NOT EXISTS ode_partner_idx ON public.offer_delivery_events(partner_id, created_at);
CREATE INDEX IF NOT EXISTS ode_stage_idx ON public.offer_delivery_events(stage, created_at);

GRANT SELECT ON public.offer_delivery_events TO authenticated;
GRANT ALL ON public.offer_delivery_events TO service_role;
ALTER TABLE public.offer_delivery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read all delivery events"
  ON public.offer_delivery_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "partner reads own delivery events"
  ON public.offer_delivery_events FOR SELECT TO authenticated
  USING (partner_id = auth.uid());

-- Trigger: on new offer, log 'created' + 'selected'
CREATE OR REPLACE FUNCTION public.log_offer_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.offer_delivery_events(offer_id, queue_id, partner_id, stage, meta)
  VALUES (NEW.id, NEW.queue_id, NEW.partner_id, 'created', jsonb_build_object('scope', NEW.scope));
  INSERT INTO public.offer_delivery_events(offer_id, queue_id, partner_id, stage, meta)
  VALUES (NEW.id, NEW.queue_id, NEW.partner_id, 'selected', '{}'::jsonb);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_offer_created ON public.subscription_offers;
CREATE TRIGGER trg_log_offer_created
  AFTER INSERT ON public.subscription_offers
  FOR EACH ROW EXECUTE FUNCTION public.log_offer_created();

-- Trigger: on offer response update, log accepted/declined/timed_out
CREATE OR REPLACE FUNCTION public.log_offer_response()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.response IS DISTINCT FROM OLD.response AND NEW.response IN ('accepted','declined','timeout','superseded') THEN
    INSERT INTO public.offer_delivery_events(offer_id, queue_id, partner_id, stage, meta)
    VALUES (
      NEW.id, NEW.queue_id, NEW.partner_id,
      CASE NEW.response
        WHEN 'accepted' THEN 'accepted'
        WHEN 'declined' THEN 'declined'
        WHEN 'timeout' THEN 'timed_out'
        WHEN 'superseded' THEN 'reassigned'
      END,
      jsonb_build_object('responded_at', NEW.responded_at)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_offer_response ON public.subscription_offers;
CREATE TRIGGER trg_log_offer_response
  AFTER UPDATE ON public.subscription_offers
  FOR EACH ROW EXECUTE FUNCTION public.log_offer_response();

-- 3) admin_alerts
CREATE TABLE IF NOT EXISTS public.admin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  title text NOT NULL,
  body text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_alerts_open_idx ON public.admin_alerts(created_at DESC) WHERE resolved_at IS NULL;

GRANT SELECT, UPDATE ON public.admin_alerts TO authenticated;
GRANT ALL ON public.admin_alerts TO service_role;
ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read alerts"
  ON public.admin_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins resolve alerts"
  ON public.admin_alerts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4) Hardened partner picker — require online + recent last_seen + valid push token
CREATE OR REPLACE FUNCTION public.pick_scored_partner_for_queue(p_queue_id uuid, p_scope text DEFAULT 'priority'::text, p_radius_km numeric DEFAULT NULL::numeric)
 RETURNS TABLE(partner_id uuid, dist_km numeric, route_delta_sec integer, distance_from_route_m integer, score numeric, score_breakdown jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q public.subscription_assignment_queue%ROWTYPE;
  v_max_cap int;
  v_radius numeric;
  v_deadline_min int;
  v_now_min int;
  v_urgency numeric;
  v_heartbeat_min int;
BEGIN
  SELECT * INTO q FROM public.subscription_assignment_queue WHERE id = p_queue_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE((value::text)::int, 30) INTO v_max_cap
    FROM public.platform_settings WHERE key='auto_assign_max_per_partner';
  SELECT COALESCE((value::text)::int, 3) INTO v_heartbeat_min
    FROM public.platform_settings WHERE key='partner_heartbeat_minutes';
  v_radius := COALESCE(p_radius_km, 15);

  v_deadline_min := COALESCE(
    NULLIF(regexp_replace(COALESCE(q.service_required_before,''), '^.*?(\d{1,2}).*$', '\1'), '')::int * 60,
    8 * 60
  );
  v_now_min := EXTRACT(hour FROM now() AT TIME ZONE 'Asia/Kolkata')::int * 60
             + EXTRACT(minute FROM now() AT TIME ZONE 'Asia/Kolkata')::int;
  v_urgency := CASE
    WHEN v_deadline_min - v_now_min <= 120 THEN 1.0
    WHEN v_deadline_min - v_now_min <= 360 THEN 0.6
    ELSE 0.3
  END;

  RETURN QUERY
  WITH eligible AS (
    SELECT p.id AS pid,
           COALESCE(p.rating, 4.5) AS rating,
           p.max_daily_cars,
           COALESCE((
             SELECT count(*) FROM public.services s
             WHERE s.partner_id = p.id AND s.scheduled_date = CURRENT_DATE
           ), 0) AS today_load,
           CASE
             WHEN q.lat IS NULL OR q.lng IS NULL OR p.home_lat IS NULL OR p.home_lng IS NULL THEN 0::numeric
             ELSE COALESCE(public.haversine_km(p.home_lat, p.home_lng, q.lat, q.lng), 0)
           END AS d_km,
           CASE WHEN lower(trim(coalesce(p.home_area,''))) = lower(trim(coalesce(q.area,''))) THEN 1 ELSE 0 END AS same_area
    FROM public.partners p
    WHERE p.status = 'active'::partner_status
      AND COALESCE(p.accepting_new, true) = true
      AND p.availability = 'online'::partner_availability
      AND p.last_seen IS NOT NULL
      AND p.last_seen > now() - (v_heartbeat_min || ' minutes')::interval
      AND EXISTS (
        SELECT 1 FROM public.push_tokens t
        WHERE t.user_id = p.id AND t.invalid_at IS NULL
      )
      AND NOT (p.id = ANY(q.tried_partner_ids))
      AND (
        (p_scope = 'priority' AND lower(trim(coalesce(p.home_area,''))) = lower(trim(coalesce(q.area,''))))
        OR p_scope IN ('area','city')
      )
      AND (
        p_radius_km IS NULL
        OR q.lat IS NULL OR q.lng IS NULL OR p.home_lat IS NULL OR p.home_lng IS NULL
        OR COALESCE(public.haversine_km(p.home_lat, p.home_lng, q.lat, q.lng), 999) <= p_radius_km
      )
  ),
  scored AS (
    SELECT
      pid,
      d_km,
      CASE WHEN d_km = 0 THEN 8 * 60 ELSE (d_km * 2 * 60)::int END AS r_delta_sec,
      CASE WHEN d_km = 0 THEN 150 ELSE (d_km * 1000)::int END AS d_from_route_m,
      today_load,
      max_daily_cars,
      rating,
      same_area,
      GREATEST(0, LEAST(1, 1 - (d_km * 2) / 20.0)) AS s_route,
      GREATEST(0, LEAST(1, CASE WHEN d_km = 0 THEN 0.9 ELSE 1 - d_km / GREATEST(v_radius, 0.1) END)) AS s_prox,
      GREATEST(0, LEAST(1, rating / 5.0)) AS s_rel,
      GREATEST(0, LEAST(1, 1 - today_load::numeric / GREATEST(max_daily_cars, 1))) AS s_cap,
      v_urgency AS s_urg
    FROM eligible
    WHERE today_load < LEAST(max_daily_cars, v_max_cap)
  )
  SELECT
    pid,
    d_km,
    r_delta_sec,
    d_from_route_m,
    (0.45*s_route + 0.20*s_prox + 0.15*s_rel + 0.10*s_cap + 0.10*s_urg)::numeric AS final_score,
    jsonb_build_object(
      'route', round(s_route::numeric, 3),
      'proximity', round(s_prox::numeric, 3),
      'reliability', round(s_rel::numeric, 3),
      'capacity', round(s_cap::numeric, 3),
      'urgency', round(s_urg::numeric, 3),
      'same_area', same_area,
      'route_delta_min', round((r_delta_sec/60.0)::numeric, 1),
      'today_load', today_load,
      'max_daily_cars', max_daily_cars,
      'rating', rating
    )
  FROM scored
  ORDER BY same_area DESC, final_score DESC, d_km ASC
  LIMIT 1;
END $function$;

REVOKE EXECUTE ON FUNCTION public.pick_scored_partner_for_queue(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pick_scored_partner_for_queue(uuid, text, numeric) TO authenticated, service_role;

-- 5) Enable realtime for new tables
ALTER TABLE public.offer_delivery_events REPLICA IDENTITY FULL;
ALTER TABLE public.admin_alerts REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='offer_delivery_events';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.offer_delivery_events; END IF;
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='admin_alerts';
  IF NOT FOUND THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_alerts; END IF;
END $$;

-- 6) Seed default heartbeat minutes setting
INSERT INTO public.platform_settings(key, value)
VALUES ('partner_heartbeat_minutes', '3'::jsonb)
ON CONFLICT (key) DO NOTHING;
