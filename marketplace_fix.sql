-- 1. Ensure mp_eligible_partners is robust and simple
CREATE OR REPLACE FUNCTION public.mp_eligible_partners(p_broadcast_id uuid)
RETURNS TABLE(partner_id uuid, distance_from_route_m integer, route_impact_m integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bcast record;
BEGIN
  SELECT * INTO v_bcast FROM public.marketplace_broadcasts WHERE id = p_broadcast_id;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT 
    pp.user_id as partner_id,
    0 as distance_from_route_m,
    0 as route_impact_m
  FROM public.partner_profiles pp
  WHERE pp.home_zone_id = v_bcast.service_area_id
    AND pp.availability = 'online'
    AND pp.status = 'active';
END;
$$;

-- 2. Update mp_reconcile_all_partners_for_broadcast (Tick-based fan-out)
CREATE OR REPLACE FUNCTION public.mp_reconcile_all_partners_for_broadcast(p_broadcast_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bcast record;
  v_partner_count integer := 0;
BEGIN
  SELECT * INTO v_bcast FROM public.marketplace_broadcasts WHERE id = p_broadcast_id;
  IF NOT FOUND OR v_bcast.status != 'open' THEN RETURN 0; END IF;

  -- [BOOKING-PUSH:AREA:03] ELIGIBLE_PARTNERS_QUERY_STARTED
  -- Logic to insert pending offers for all eligible partners
  -- honors the 5-minute decline cooldown and excludes the canceller
  INSERT INTO public.marketplace_offers (broadcast_id, partner_id, incentive, response)
  SELECT 
    v_bcast.id,
    pp.user_id,
    v_bcast.current_incentive,
    'pending'
  FROM public.partner_profiles pp
  WHERE pp.home_zone_id = v_bcast.service_area_id
    AND pp.availability = 'online'
    AND pp.status = 'active'
    -- Exclude canceller/winning partner if it was a release
    AND (v_bcast.winning_partner_id IS NULL OR pp.user_id != v_bcast.winning_partner_id) 
    -- Exclude partners who already have a pending/accepted offer
    -- OR those who declined within the last 5 minutes
    AND NOT EXISTS (
      SELECT 1 FROM public.marketplace_offers mo 
      WHERE mo.broadcast_id = v_bcast.id 
        AND mo.partner_id = pp.user_id
        AND (
          mo.response = 'pending' 
          OR mo.response = 'accepted'
          OR (mo.response = 'declined' AND mo.next_retry_at > now())
        )
    )
  ON CONFLICT (broadcast_id, partner_id, round) DO NOTHING;

  GET DIAGNOSTICS v_partner_count = ROW_COUNT;
  -- [BOOKING-PUSH:AREA:04] ELIGIBLE_PARTNERS_FOUND count=v_partner_count
  RETURN v_partner_count;
END;
$$;

-- 3. Update get_partner_open_offers for immediate recovery on login
CREATE OR REPLACE FUNCTION public.get_partner_open_offers(p_partner_id uuid)
RETURNS TABLE(
  id uuid, broadcast_id uuid, partner_id uuid, round integer, incentive numeric, 
  distance_from_route_m integer, route_impact_m integer, sent_at timestamp with time zone, 
  response text, broadcast_status text, current_round integer, current_incentive numeric, 
  current_radius_m integer, round_expires_at timestamp with time zone, 
  customer_lat numeric, customer_lng numeric, vehicle_id uuid, 
  subscription_id uuid, booking_id uuid, server_now timestamp with time zone,
  customer_count integer, earning_monthly numeric, earning_amount numeric,
  distance_display text, area text, assignment_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Perform reconciliation for this specific partner across all open broadcasts
  -- This handles the case where a partner logs in mid-broadcast
  INSERT INTO public.marketplace_offers (broadcast_id, partner_id, incentive, response)
  SELECT 
    mb.id,
    p_partner_id,
    mb.current_incentive,
    'pending'
  FROM public.marketplace_broadcasts mb
  JOIN public.partner_profiles pp ON pp.user_id = p_partner_id
  WHERE mb.status = 'open'
    AND mb.winning_partner_id IS DISTINCT FROM p_partner_id
    AND pp.home_zone_id = mb.service_area_id
    AND pp.availability = 'online'
    AND pp.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.marketplace_offers mo 
      WHERE mo.broadcast_id = mb.id 
        AND mo.partner_id = p_partner_id
        AND (
          mo.response = 'pending' 
          OR mo.response = 'accepted'
          OR (mo.response = 'declined' AND mo.next_retry_at > now())
        )
    )
  ON CONFLICT (broadcast_id, partner_id, round) DO NOTHING;

  RETURN QUERY
  SELECT 
    o.id, o.broadcast_id, o.partner_id, o.round, o.incentive,
    o.distance_from_route_m, o.route_impact_m, o.sent_at, o.response,
    b.status as broadcast_status, b.current_round, b.current_incentive, b.current_radius_m,
    b.round_expires_at, b.customer_lat, b.customer_lng,
    b.vehicle_id, b.subscription_id, b.booking_id,
    now() as server_now,
    (CASE WHEN b.assignment_id IS NOT NULL THEN 20 ELSE 1 END)::integer as customer_count, -- Placeholder or actual count
    (b.current_incentive * 26) as earning_monthly,
    b.current_incentive as earning_amount,
    'Nearby'::text as distance_display,
    cz.name as area,
    b.assignment_id
  FROM public.marketplace_offers o
  JOIN public.marketplace_broadcasts b ON b.id = o.broadcast_id
  LEFT JOIN public.coverage_zones cz ON cz.id = b.service_area_id
  WHERE o.partner_id = p_partner_id
    AND o.response = 'pending'
    AND b.status = 'open'
    AND (o.next_retry_at IS NULL OR o.next_retry_at <= now())
  ORDER BY o.sent_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_partner_open_offers(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mp_reconcile_all_partners_for_broadcast(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mp_eligible_partners(uuid) TO authenticated, service_role;
