-- ====================================================================
-- MARKETPLACE BROADCAST RELIABILITY & RE-BROADCAST LOOP
--
-- 1. Identify all OPEN bookings needing a broadcast.
-- 2. Recalculate eligible partners on every sweep.
-- 3. Atomic acceptance to ensure exactly one winner.
-- ====================================================================

-- 1. Recovery function for all open bookings
CREATE OR REPLACE FUNCTION public.get_all_open_broadcast_bookings()
RETURNS TABLE(
  booking_id uuid,
  broadcast_id uuid,
  area text,
  vehicle_category text,
  incentive numeric,
  customer_lat numeric,
  customer_lng numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id as booking_id,
    mb.id as broadcast_id,
    cz.name as area,
    b.vehicle_category,
    mb.current_incentive as incentive,
    cp.latitude as customer_lat,
    cp.longitude as customer_lng
  FROM public.bookings b
  JOIN public.marketplace_broadcasts mb ON mb.booking_id = b.id
  JOIN public.coverage_zones cz ON cz.id = mb.service_area_id
  JOIN public.customer_profiles cp ON cp.user_id = b.user_id
  WHERE b.status = 'paid'
    AND mb.status = 'open'
    AND mb.winning_partner_id IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_open_broadcast_bookings() TO service_role;

-- 2. Partner reconciliation function (Internal use for tick)
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
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Logic to insert pending offers for all eligible partners who don't have one yet
  INSERT INTO public.marketplace_offers (broadcast_id, partner_id, incentive, response)
  SELECT 
    v_bcast.id,
    pp.user_id,
    v_bcast.current_incentive,
    'pending'
  FROM public.partner_profiles pp
  WHERE pp.home_zone_id = v_bcast.service_area_id -- Simple area match for now
    AND pp.availability = 'online'
    AND NOT EXISTS (
      SELECT 1 FROM public.marketplace_offers mo 
      WHERE mo.broadcast_id = v_bcast.id AND mo.partner_id = pp.user_id
    )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_partner_count = ROW_COUNT;
  RETURN v_partner_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mp_reconcile_all_partners_for_broadcast(uuid) TO service_role;

-- 3. Atomic acceptance update
CREATE OR REPLACE FUNCTION public.mark_booking_accepted(
  p_booking_id uuid,
  p_partner_id uuid,
  p_broadcast_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- 1. Try to claim the broadcast
  UPDATE public.marketplace_broadcasts
  SET winning_partner_id = p_partner_id,
      status = 'closed',
      updated_at = now()
  WHERE id = p_broadcast_id 
    AND status = 'open'
    AND winning_partner_id IS NULL;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- 2. Update the booking
  UPDATE public.bookings
  SET partner_id = p_partner_id,
      status = 'active',
      claimed_at = now(),
      updated_at = now()
  WHERE id = p_booking_id
    AND partner_id IS NULL;

  -- 3. Close other offers
  UPDATE public.marketplace_offers
  SET response = 'superseded',
      responded_at = now()
  WHERE broadcast_id = p_broadcast_id
    AND partner_id != p_partner_id
    AND response = 'pending';

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_booking_accepted(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_booking_accepted(uuid, uuid, uuid) TO authenticated;
