
-- =========== Enrich subscription_offers ===========
ALTER TABLE public.subscription_offers
  ADD COLUMN IF NOT EXISTS route_delta_seconds int,
  ADD COLUMN IF NOT EXISTS distance_from_route_m int,
  ADD COLUMN IF NOT EXISTS extra_per_day_paise int,
  ADD COLUMN IF NOT EXISTS extra_per_month_paise int,
  ADD COLUMN IF NOT EXISTS score numeric,
  ADD COLUMN IF NOT EXISTS score_breakdown jsonb;

-- =========== Smart-score helper: returns top partner + metrics ===========
-- Score components:
--   route impact (0.45) — fewer added minutes is better
--   proximity   (0.20)
--   reliability (0.15) — partner.rating
--   capacity    (0.10) — headroom vs max_daily_cars
--   urgency     (0.10) — deadline today
CREATE OR REPLACE FUNCTION public.pick_scored_partner_for_queue(
  p_queue_id uuid,
  p_scope text DEFAULT 'priority',
  p_radius_km numeric DEFAULT NULL
) RETURNS TABLE (
  partner_id uuid,
  dist_km numeric,
  route_delta_sec int,
  distance_from_route_m int,
  score numeric,
  score_breakdown jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q public.subscription_assignment_queue%ROWTYPE;
  v_max_cap int;
  v_radius numeric;
  v_deadline_min int;
  v_now_min int;
  v_urgency numeric;
BEGIN
  SELECT * INTO q FROM public.subscription_assignment_queue WHERE id = p_queue_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE((value::text)::int, 30) INTO v_max_cap
    FROM public.platform_settings WHERE key='auto_assign_max_per_partner';
  v_radius := COALESCE(p_radius_km, 15);

  -- Deadline parsing: extract first 1-2 digit number from service_required_before
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
           COALESCE(public.haversine_km(p.home_lat, p.home_lng, q.lat, q.lng), 999) AS d_km
    FROM public.partners p
    WHERE p.status = 'active'::partner_status
      AND COALESCE(p.accepting_new, true) = true
      AND NOT (p.id = ANY(q.tried_partner_ids))
      AND (
        (p_scope = 'priority' AND lower(trim(coalesce(p.home_area,''))) = lower(trim(coalesce(q.area,''))))
        OR p_scope IN ('area','city')
      )
      AND (p_radius_km IS NULL OR COALESCE(public.haversine_km(p.home_lat, p.home_lng, q.lat, q.lng), 999) <= p_radius_km)
  ),
  scored AS (
    SELECT
      pid,
      d_km,
      -- approximate detour: 2 min per km (round trip stop add)
      (d_km * 2 * 60)::int AS r_delta_sec,
      (d_km * 1000)::int    AS d_from_route_m,
      today_load,
      max_daily_cars,
      rating,
      -- normalized components (clamped 0..1)
      GREATEST(0, LEAST(1, 1 - (d_km * 2) / 20.0)) AS s_route,
      GREATEST(0, LEAST(1, 1 - d_km / GREATEST(v_radius, 0.1))) AS s_prox,
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
      'route_delta_min', round((r_delta_sec/60.0)::numeric, 1),
      'today_load', today_load,
      'max_daily_cars', max_daily_cars,
      'rating', rating
    )
  FROM scored
  ORDER BY final_score DESC, d_km ASC
  LIMIT 1;
END $$;

GRANT EXECUTE ON FUNCTION public.pick_scored_partner_for_queue(uuid, text, numeric) TO authenticated;

-- =========== Updated offer_next_for_queue with enriched fields ===========
CREATE OR REPLACE FUNCTION public.offer_next_for_queue(p_queue_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  q public.subscription_assignment_queue%ROWTYPE;
  v_pick record;
  v_timeout int;
  v_steps jsonb;
  v_offer uuid;
  v_enabled boolean;
  v_rate numeric := 17; -- ₹17/day baseline
BEGIN
  SELECT COALESCE((value::text)::boolean, true) INTO v_enabled FROM public.platform_settings WHERE key='auto_assign_enabled';
  IF NOT v_enabled THEN RETURN NULL; END IF;

  SELECT * INTO q FROM public.subscription_assignment_queue WHERE id = p_queue_id;
  IF NOT FOUND OR q.status IN ('assigned','failed') THEN RETURN NULL; END IF;

  SELECT COALESCE((value::text)::int, 90) INTO v_timeout FROM public.platform_settings WHERE key='auto_assign_timeout_sec';
  SELECT value INTO v_steps FROM public.platform_settings WHERE key='auto_assign_radius_steps';

  -- Try priority (home_area match)
  SELECT * INTO v_pick FROM public.pick_scored_partner_for_queue(p_queue_id, 'priority', NULL) LIMIT 1;

  IF v_pick.partner_id IS NULL THEN
    DECLARE step numeric;
    BEGIN
      FOR step IN SELECT (jsonb_array_elements_text(coalesce(v_steps,'[2,5,10,15]'::jsonb)))::numeric LOOP
        IF step <= q.radius_km THEN CONTINUE; END IF;
        SELECT * INTO v_pick FROM public.pick_scored_partner_for_queue(p_queue_id, 'city', step) LIMIT 1;
        IF v_pick.partner_id IS NOT NULL THEN
          UPDATE public.subscription_assignment_queue SET radius_km = step WHERE id = p_queue_id;
          EXIT;
        END IF;
      END LOOP;
    END;
  END IF;

  IF v_pick.partner_id IS NULL THEN
    UPDATE public.subscription_assignment_queue
      SET status = 'failed', current_offer_partner_id = NULL, offer_expires_at = NULL
      WHERE id = p_queue_id;
    RETURN NULL;
  END IF;

  INSERT INTO public.subscription_offers(
    queue_id, partner_id, scope, expires_at,
    distance_m, projected_extra_earnings,
    route_delta_seconds, distance_from_route_m,
    extra_per_day_paise, extra_per_month_paise,
    score, score_breakdown
  )
  VALUES (
    p_queue_id, v_pick.partner_id,
    CASE WHEN q.radius_km = 0 THEN 'priority' ELSE 'city' END,
    now() + (v_timeout || ' seconds')::interval,
    (v_pick.dist_km * 1000)::int, v_rate * 30,
    v_pick.route_delta_sec, v_pick.distance_from_route_m,
    (v_rate * 100)::int, (v_rate * 30 * 100)::int,
    v_pick.score, v_pick.score_breakdown
  )
  RETURNING id INTO v_offer;

  UPDATE public.subscription_assignment_queue
    SET status = 'offered',
        current_offer_partner_id = v_pick.partner_id,
        offer_expires_at = now() + (v_timeout || ' seconds')::interval,
        tried_partner_ids = array_append(tried_partner_ids, v_pick.partner_id)
    WHERE id = p_queue_id;

  INSERT INTO public.partner_notifications(partner_id, type, title, body, link, metadata)
  VALUES (v_pick.partner_id, 'daily_shine_offer',
          'New Daily Shine Customer Available',
          'Area ' || COALESCE(q.area,'(nearby)') || ' · +' || round((v_pick.route_delta_sec/60.0)::numeric,0) || ' min route impact · +₹' || (v_rate*30)::int || '/mo',
          '/app/assignments',
          jsonb_build_object('queue_id', p_queue_id, 'offer_id', v_offer, 'booking_id', q.booking_id));

  RETURN v_offer;
END $$;

GRANT EXECUTE ON FUNCTION public.offer_next_for_queue(uuid) TO authenticated;
