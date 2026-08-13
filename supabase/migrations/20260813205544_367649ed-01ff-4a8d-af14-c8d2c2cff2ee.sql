
CREATE OR REPLACE FUNCTION public.mp_eligible_partners(p_broadcast_id uuid)
RETURNS TABLE (
    partner_id uuid,
    distance_from_route_m integer,
    route_impact_m integer,
    remaining_capacity integer,
    is_exact_zone_match boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_broadcast record;
    v_round_radius integer;
BEGIN
    -- 1. Get broadcast details
    SELECT * INTO v_broadcast FROM marketplace_broadcasts WHERE id = p_broadcast_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- 2. Get current round radius
    SELECT radius_per_round_m[v_broadcast.current_round] INTO v_round_radius
    FROM marketplace_settings
    LIMIT 1;

    -- 3. Return eligible partners
    RETURN QUERY
    WITH partner_metrics AS (
        SELECT 
            p.id as pid,
            p.home_zone_id = v_broadcast.service_area_id as zone_match,
            0 as dist,
            0 as impact,
            COALESCE(
                (SELECT a.target_cars - a.fulfilled_cars 
                 FROM public.assignments a 
                 WHERE a.partner_id = p.id 
                   AND a.status = 'active' 
                   AND CURRENT_DATE BETWEEN a.start_date AND a.end_date
                 ORDER BY a.created_at DESC
                 LIMIT 1),
                25
            ) as cap
        FROM public.partners p
        WHERE (p.status = 'active' OR p.status = 'pending_verification')
          AND p.availability = 'online'
          AND (
            p.home_zone_id = v_broadcast.service_area_id
            OR 
            (v_round_radius > 0 AND false) 
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
$$;
