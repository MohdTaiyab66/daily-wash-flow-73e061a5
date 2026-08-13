
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
           COALESCE(GREATEST(0, a.target_cars - a.fulfilled_cars), 25) AS remaining_capacity,
           p.home_zone_id
    FROM public.partners p
    LEFT JOIN LATERAL (
      SELECT * FROM public.assignments aa
      WHERE aa.partner_id = p.id AND aa.status='active'
        AND CURRENT_DATE BETWEEN aa.start_date AND aa.end_date
      ORDER BY aa.start_date DESC LIMIT 1
    ) a ON true
    WHERE (p.status = 'active' OR p.status = 'pending_verification') -- CRITICAL: allow pending_verification for testing
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
