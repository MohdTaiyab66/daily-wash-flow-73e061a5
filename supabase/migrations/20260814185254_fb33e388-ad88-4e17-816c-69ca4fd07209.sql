-- Recovery: make still-open, unclaimed marketplace work visible to eligible
-- partners who were logged out when the broadcast was created.
CREATE OR REPLACE FUNCTION public.mp_reconcile_partner_offers(p_partner_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_b record;
  v_dur integer;
  v_recovered integer := 0;
BEGIN
  IF p_partner_id IS NULL THEN RETURN 0; END IF;
  IF p_partner_id IS DISTINCT FROM auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COALESCE(round_duration_sec, 120) INTO v_dur FROM public.marketplace_settings LIMIT 1;
  v_dur := COALESCE(v_dur, 120);

  FOR v_b IN
    SELECT b.*
    FROM public.marketplace_broadcasts b
    WHERE b.status = 'open'
      AND b.winning_partner_id IS NULL
      AND b.assignment_id IS NULL
  LOOP
    -- Never duplicate a live opportunity the partner already has.
    IF EXISTS (
      SELECT 1 FROM public.marketplace_offers o
      WHERE o.broadcast_id = v_b.id
        AND o.partner_id = p_partner_id
        AND o.round = v_b.current_round
        AND o.response IN ('pending', 'accepted', 'declined')
    ) THEN
      CONTINUE;
    END IF;

    -- Eligibility is evaluated live against the current marketplace rules.
    IF NOT EXISTS (
      SELECT 1 FROM public.mp_eligible_partners(v_b.id) e
      WHERE e.partner_id = p_partner_id
    ) THEN
      CONTINUE;
    END IF;

    -- The opportunity is still unclaimed: refresh a lapsed round window so the
    -- work stays visible instead of vanishing for a returning partner.
    IF v_b.round_expires_at <= now() THEN
      UPDATE public.marketplace_broadcasts
      SET round_started_at = now(),
          round_expires_at = now() + make_interval(secs => v_dur),
          updated_at = now()
      WHERE id = v_b.id AND status = 'open' AND winning_partner_id IS NULL;
    END IF;

    -- Revive an expired row for this round rather than inserting a duplicate.
    UPDATE public.marketplace_offers
    SET response = 'pending', responded_at = NULL, sent_at = now()
    WHERE broadcast_id = v_b.id
      AND partner_id = p_partner_id
      AND round = v_b.current_round
      AND response = 'expired';

    IF NOT FOUND THEN
      INSERT INTO public.marketplace_offers
        (broadcast_id, partner_id, round, incentive, distance_from_route_m, route_impact_m, sent_at, response)
      SELECT v_b.id, p_partner_id, v_b.current_round, v_b.current_incentive,
             e.distance_from_route_m, e.route_impact_m, now(), 'pending'
      FROM public.mp_eligible_partners(v_b.id) e
      WHERE e.partner_id = p_partner_id
      LIMIT 1;
    END IF;

    v_recovered := v_recovered + 1;
  END LOOP;

  RETURN v_recovered;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mp_reconcile_partner_offers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mp_reconcile_partner_offers(uuid) TO service_role;

-- Run recovery before the expiry sweep so returning partners see open work.
CREATE OR REPLACE FUNCTION public.get_partner_open_offers(p_partner_id uuid)
RETURNS TABLE(id uuid, broadcast_id uuid, partner_id uuid, round integer, incentive numeric, distance_from_route_m integer, route_impact_m integer, sent_at timestamp with time zone, response text, broadcast_status text, current_round integer, current_incentive numeric, current_radius_m integer, round_expires_at timestamp with time zone, customer_lat numeric, customer_lng numeric, vehicle_id uuid, subscription_id uuid, booking_id uuid, server_now timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_partner_id IS DISTINCT FROM auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Login-time reconciliation: database/marketplace state is the source of
  -- truth for available work, never FCM delivery history.
  PERFORM public.mp_reconcile_partner_offers(p_partner_id);

  -- Then sweep so nothing genuinely expired leaves the API.
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
$function$;