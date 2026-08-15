-- Fix ambiguous column reference "broadcast_id" in marketplace functions
-- This happens when ON CONFLICT refers to columns that exist in both the target table and the source query.

-- 1. Redefine mp_reconcile_all_partners_for_broadcast with explicit column references in ON CONFLICT
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

  INSERT INTO public.marketplace_offers (broadcast_id, partner_id, incentive, response)
  SELECT 
    v_bcast.id,
    p.id,
    v_bcast.current_incentive,
    'pending'
  FROM public.partners p
  WHERE p.home_zone_id = v_bcast.service_area_id
    AND p.availability = 'online'
    AND p.status = 'active'
    -- Exclude canceller
    AND (v_bcast.winning_partner_id IS NULL OR p.id != v_bcast.winning_partner_id) 
    -- Exclude recent decliners (5m cooldown)
    AND NOT EXISTS (
      SELECT 1 FROM public.marketplace_offers mo 
      WHERE mo.broadcast_id = v_bcast.id 
        AND mo.partner_id = p.id
        AND (
          mo.response = 'pending' 
          OR (mo.response = 'declined' AND mo.next_retry_at > now())
        )
    )
  ON CONFLICT (broadcast_id, partner_id, round) DO NOTHING;

  GET DIAGNOSTICS v_partner_count = ROW_COUNT;
  RETURN v_partner_count;
END;
$$;

-- 2. Redefine get_partner_open_offers with explicit column references in ON CONFLICT
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
  INSERT INTO public.marketplace_offers (broadcast_id, partner_id, incentive, response)
  SELECT 
    mb.id,
    p_partner_id,
    mb.current_incentive,
    'pending'
  FROM public.marketplace_broadcasts mb
  JOIN public.partners p ON p.id = p_partner_id
  WHERE mb.status = 'open'
    AND mb.winning_partner_id IS DISTINCT FROM p_partner_id
    AND p.home_zone_id = mb.service_area_id
    AND p.availability = 'online'
    AND p.status = 'active'
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
    (CASE WHEN b.assignment_id IS NOT NULL THEN 20 ELSE 1 END)::integer as customer_count, 
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
