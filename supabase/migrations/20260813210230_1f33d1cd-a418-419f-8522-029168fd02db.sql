
CREATE OR REPLACE FUNCTION public.mp_eligible_partners(p_broadcast_id uuid, p_radius_m integer, p_include_neighbours boolean DEFAULT false)
RETURNS TABLE(partner_id uuid, distance_m numeric, today_cars integer, remaining_capacity integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lat numeric; v_lng numeric; v_zone uuid;
BEGIN
  SELECT customer_lat, customer_lng, service_area_id
    INTO v_lat, v_lng, v_zone
  FROM public.marketplace_broadcasts WHERE id = p_broadcast_id;

  RETURN QUERY
  WITH base AS (
    SELECT p.id AS partner_id,
           public.mp_haversine_m(v_lat, v_lng, p.current_lat, p.current_lng) AS distance_m,
           COALESCE(a.fulfilled_cars, 0) AS today_cars,
           -- FIX: COALESCE(a.target_cars, 25) - COALESCE(a.fulfilled_cars, 0)
           -- ensuring that if no assignment row exists, we default to 25.
           (COALESCE(a.target_cars, 25) - COALESCE(a.fulfilled_cars, 0)) AS remaining_capacity,
           p.home_zone_id
    FROM public.partners p
    LEFT JOIN LATERAL (
      SELECT aa.target_cars, aa.fulfilled_cars FROM public.assignments aa
      WHERE aa.partner_id = p.id AND aa.status='active'
        AND CURRENT_DATE BETWEEN aa.start_date AND aa.end_date
      ORDER BY aa.start_date DESC LIMIT 1
    ) a ON true
    WHERE (p.status = 'active' OR p.status = 'pending_verification')
      AND p.availability = 'online'
      AND COALESCE(p.accepting_new, true) = true
      AND NOT EXISTS (
        SELECT 1 FROM public.marketplace_offers o
         WHERE o.broadcast_id = p_broadcast_id
           AND o.partner_id = p.id
           AND o.response = 'declined'
      )
  )
  SELECT b.partner_id, b.distance_m, b.today_cars, b.remaining_capacity
  FROM base b
  LEFT JOIN public.coverage_zones z ON z.id = v_zone
  WHERE b.remaining_capacity > 0
    AND (
      b.home_zone_id = v_zone
      OR p_radius_m <= 0
      OR b.distance_m IS NULL
      OR b.distance_m <= p_radius_m
      OR (p_include_neighbours AND COALESCE(z.neighbour_expand, false))
    )
  ORDER BY
    (b.home_zone_id = v_zone) DESC,
    b.distance_m NULLS LAST,
    b.today_cars ASC,
    b.remaining_capacity DESC;
END $function$;

CREATE OR REPLACE FUNCTION public.mp_eligible_partners(p_broadcast_id uuid)
RETURNS TABLE(partner_id uuid, distance_from_route_m integer, route_impact_m integer, remaining_capacity integer, is_exact_zone_match boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_broadcast record;
    v_round_radius integer;
BEGIN
    SELECT * INTO v_broadcast FROM marketplace_broadcasts WHERE id = p_broadcast_id;
    IF NOT FOUND THEN RETURN; END IF;

    SELECT radius_per_round_m[v_broadcast.current_round] INTO v_round_radius
    FROM marketplace_settings
    LIMIT 1;

    RETURN QUERY
    WITH partner_metrics AS (
        SELECT
            p.id as pid,
            p.home_zone_id = v_broadcast.service_area_id as zone_match,
            0 as dist,
            0 as impact,
            (COALESCE(a.target_cars, 25) - COALESCE(a.fulfilled_cars, 0)) as cap
        FROM public.partners p
        LEFT JOIN LATERAL (
            SELECT aa.target_cars, aa.fulfilled_cars FROM public.assignments aa
            WHERE aa.partner_id = p.id AND aa.status = 'active'
              AND CURRENT_DATE BETWEEN aa.start_date AND aa.end_date
            ORDER BY aa.created_at DESC
            LIMIT 1
        ) a ON true
        WHERE (p.status = 'active' OR p.status = 'pending_verification')
          AND p.availability = 'online'
          AND (
            p.home_zone_id = v_broadcast.service_area_id
            OR
            (v_round_radius > 0 AND public.mp_haversine_m(v_broadcast.customer_lat, v_broadcast.customer_lng, p.current_lat, p.current_lng) <= v_round_radius)
          )
    )
    SELECT
        pid,
        dist,
        impact,
        cap,
        zone_match
    FROM partner_metrics
    WHERE cap > 0;
END;
$function$;
