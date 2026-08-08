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
    LEFT JOIN public.subscription_offer_partner_state st
      ON st.queue_id = q.id AND st.partner_id = p.id
    WHERE p.status = 'active'::public.partner_status
      AND COALESCE(p.accepting_new, true) = true
      AND p.availability = 'online'::public.availability_status
      AND p.last_seen IS NOT NULL
      AND p.last_seen > now() - (v_heartbeat_min || ' minutes')::interval
      -- Declined: hidden for that partner only until next_retry_at passes.
      -- Ignored: no penalty, eligible again on the very next retry.
      AND (st.next_retry_at IS NULL OR st.next_retry_at <= now())
      -- Skip only partners already holding a live offer for ANOTHER active
      -- Daily Shine lead. Unrelated offers must not block eligibility.
      AND NOT EXISTS (
        SELECT 1
        FROM public.subscription_offers o2
        JOIN public.subscription_assignment_queue q2 ON q2.id = o2.queue_id
        WHERE o2.partner_id = p.id
          AND o2.response = 'pending'
          AND o2.expires_at > now()
          AND q2.status IN ('offered','processing')
      )
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
      pid, d_km,
      CASE WHEN d_km = 0 THEN 8 * 60 ELSE (d_km * 2 * 60)::int END AS r_delta_sec,
      CASE WHEN d_km = 0 THEN 150 ELSE (d_km * 1000)::int END AS d_from_route_m,
      today_load, max_daily_cars, rating, same_area,
      GREATEST(0, LEAST(1, 1 - (d_km * 2) / 20.0)) AS s_route,
      GREATEST(0, LEAST(1, CASE WHEN d_km = 0 THEN 0.9 ELSE 1 - d_km / GREATEST(v_radius, 0.1) END)) AS s_prox,
      GREATEST(0, LEAST(1, rating / 5.0)) AS s_rel,
      GREATEST(0, LEAST(1, 1 - today_load::numeric / GREATEST(max_daily_cars, 1))) AS s_cap,
      v_urgency AS s_urg
    FROM eligible
    WHERE today_load < LEAST(max_daily_cars, v_max_cap)
  )
  SELECT
    pid, d_km, r_delta_sec, d_from_route_m,
    (0.45*s_route + 0.20*s_prox + 0.15*s_rel + 0.10*s_cap + 0.10*s_urg)::numeric,
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
  ORDER BY same_area DESC, 5 DESC, d_km ASC
  LIMIT 1;
END $function$;