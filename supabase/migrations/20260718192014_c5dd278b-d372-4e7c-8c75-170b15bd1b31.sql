
-- 1. One-shot cleanup: expire any currently-stale pending marketplace offers
UPDATE public.marketplace_offers o
SET response = 'expired', responded_at = now()
FROM public.marketplace_broadcasts b
WHERE o.broadcast_id = b.id
  AND o.response = 'pending'
  AND (
    b.round_expires_at <= now()
    OR b.status <> 'open'
    OR b.current_round <> o.round
  );

-- If any partner still has >1 pending after that (shouldn't, but be safe),
-- keep the newest and expire the rest so the unique index below can build.
WITH ranked AS (
  SELECT id, partner_id,
         row_number() OVER (PARTITION BY partner_id ORDER BY sent_at DESC) AS rn
  FROM public.marketplace_offers
  WHERE response = 'pending'
)
UPDATE public.marketplace_offers o
SET response = 'expired', responded_at = now()
FROM ranked r
WHERE o.id = r.id AND r.rn > 1;

-- 2. Auto-expire helper. SECURITY DEFINER so it can update rows even when
--    called by a partner's RLS-scoped session.
CREATE OR REPLACE FUNCTION public.mp_expire_stale_offers()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.marketplace_offers o
  SET response = 'expired', responded_at = now()
  FROM public.marketplace_broadcasts b
  WHERE o.broadcast_id = b.id
    AND o.response = 'pending'
    AND (
      b.round_expires_at <= now()
      OR b.status <> 'open'
      OR b.current_round <> o.round
    );
$$;

REVOKE ALL ON FUNCTION public.mp_expire_stale_offers() FROM public;
GRANT EXECUTE ON FUNCTION public.mp_expire_stale_offers() TO authenticated, service_role;

-- 3. Server-authoritative partner offers RPC. Runs the sweep first, then
--    returns only rows that are truly actionable RIGHT NOW.
CREATE OR REPLACE FUNCTION public.get_partner_open_offers(p_partner_id uuid)
RETURNS TABLE (
  id uuid,
  broadcast_id uuid,
  partner_id uuid,
  round integer,
  incentive numeric,
  distance_from_route_m integer,
  route_impact_m integer,
  sent_at timestamptz,
  response text,
  broadcast_status text,
  current_round integer,
  current_incentive numeric,
  current_radius_m integer,
  round_expires_at timestamptz,
  customer_lat numeric,
  customer_lng numeric,
  vehicle_id uuid,
  subscription_id uuid,
  booking_id uuid,
  server_now timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Partners may only ask about their own offers.
  IF p_partner_id IS DISTINCT FROM auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Always sweep first so nothing expired leaves the API.
  PERFORM public.mp_expire_stale_offers();

  RETURN QUERY
  SELECT o.id, o.broadcast_id, o.partner_id, o.round, o.incentive,
         o.distance_from_route_m, o.route_impact_m, o.sent_at, o.response,
         b.status, b.current_round, b.current_incentive, b.current_radius_m,
         b.round_expires_at, b.customer_lat, b.customer_lng,
         b.vehicle_id, b.subscription_id, b.booking_id,
         now()
  FROM public.marketplace_offers o
  JOIN public.marketplace_broadcasts b ON b.id = o.broadcast_id
  WHERE o.partner_id = p_partner_id
    AND o.response = 'pending'
    AND b.status = 'open'
    AND b.current_round = o.round
    AND b.round_expires_at > now()
  ORDER BY o.sent_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_partner_open_offers(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_partner_open_offers(uuid) TO authenticated, service_role;

-- 4. DB invariant: at most one live pending offer per partner.
DROP INDEX IF EXISTS public.uq_mp_offers_one_pending_per_partner;
CREATE UNIQUE INDEX uq_mp_offers_one_pending_per_partner
  ON public.marketplace_offers (partner_id)
  WHERE response = 'pending';

-- 5. Trigger safety net (covers concurrent inserts that race the index build
--    window and gives a clear error message).
CREATE OR REPLACE FUNCTION public.tg_mp_offer_single_pending()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.response = 'pending' THEN
    -- First, opportunistically expire any stale row for this partner so a
    -- legitimate new broadcast is not blocked by a zombie pending offer.
    UPDATE public.marketplace_offers o
    SET response = 'expired', responded_at = now()
    FROM public.marketplace_broadcasts b
    WHERE o.broadcast_id = b.id
      AND o.partner_id = NEW.partner_id
      AND o.id <> NEW.id
      AND o.response = 'pending'
      AND (b.round_expires_at <= now()
           OR b.status <> 'open'
           OR b.current_round <> o.round);

    IF EXISTS (
      SELECT 1 FROM public.marketplace_offers
      WHERE partner_id = NEW.partner_id
        AND response = 'pending'
        AND id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'Partner % already has a live pending offer', NEW.partner_id
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mp_offer_single_pending ON public.marketplace_offers;
CREATE TRIGGER trg_mp_offer_single_pending
  BEFORE INSERT OR UPDATE OF response, partner_id
  ON public.marketplace_offers
  FOR EACH ROW EXECUTE FUNCTION public.tg_mp_offer_single_pending();
