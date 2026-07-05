
-- Admin controls for live marketplace broadcasts. All check has_role(admin).

CREATE OR REPLACE FUNCTION public.mp_admin_cancel_broadcast(p_broadcast_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT status INTO v_status FROM public.marketplace_broadcasts WHERE id = p_broadcast_id FOR UPDATE;
  IF v_status IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF v_status <> 'open' THEN RETURN jsonb_build_object('ok',false,'reason','not_open'); END IF;

  UPDATE public.marketplace_broadcasts SET status='cancelled', updated_at=now() WHERE id = p_broadcast_id;
  UPDATE public.marketplace_offers SET response='superseded', responded_at=now()
    WHERE broadcast_id = p_broadcast_id AND response='pending';
  UPDATE public.marketplace_round_history SET ended_at=now(), reason=COALESCE(reason,'') || ' | admin_cancel:' || COALESCE(p_reason,'')
    WHERE broadcast_id = p_broadcast_id AND ended_at IS NULL;
  RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.mp_admin_extend_timer(p_broadcast_id uuid, p_seconds integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_seconds IS NULL OR p_seconds < 5 OR p_seconds > 900 THEN RAISE EXCEPTION 'invalid_seconds'; END IF;
  UPDATE public.marketplace_broadcasts
    SET round_expires_at = round_expires_at + make_interval(secs => p_seconds), updated_at = now()
    WHERE id = p_broadcast_id AND status='open';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_open'); END IF;
  RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.mp_admin_set_incentive(p_broadcast_id uuid, p_incentive numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_round int;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_incentive IS NULL OR p_incentive < 0 OR p_incentive > 500 THEN RAISE EXCEPTION 'invalid_incentive'; END IF;

  UPDATE public.marketplace_broadcasts SET current_incentive = p_incentive, updated_at = now()
    WHERE id = p_broadcast_id AND status='open'
    RETURNING current_round INTO v_round;
  IF v_round IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_open'); END IF;

  -- Bump the incentive on the current round's pending offers so partners see the new figure.
  UPDATE public.marketplace_offers SET incentive = p_incentive
    WHERE broadcast_id = p_broadcast_id AND round = v_round AND response = 'pending';
  RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.mp_admin_set_radius(p_broadcast_id uuid, p_radius_m integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bcast record; v_inserted int;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_radius_m IS NULL OR p_radius_m < 0 OR p_radius_m > 100000 THEN RAISE EXCEPTION 'invalid_radius'; END IF;

  SELECT * INTO v_bcast FROM public.marketplace_broadcasts WHERE id = p_broadcast_id FOR UPDATE;
  IF v_bcast IS NULL OR v_bcast.status <> 'open' THEN RETURN jsonb_build_object('ok',false,'reason','not_open'); END IF;

  UPDATE public.marketplace_broadcasts SET current_radius_m = p_radius_m, updated_at = now()
    WHERE id = p_broadcast_id;

  -- Push offers to any newly-eligible partners at the widened radius (idempotent via unique index).
  WITH picks AS (
    SELECT partner_id, distance_m
    FROM public.mp_eligible_partners(p_broadcast_id, p_radius_m, false)
  ), ins AS (
    INSERT INTO public.marketplace_offers (broadcast_id, partner_id, round, incentive, distance_from_route_m)
    SELECT p_broadcast_id, partner_id, v_bcast.current_round, v_bcast.current_incentive, COALESCE(distance_m,0)::int FROM picks
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  RETURN jsonb_build_object('ok',true,'new_offers',COALESCE(v_inserted,0));
END $$;

CREATE OR REPLACE FUNCTION public.mp_admin_rebroadcast(p_broadcast_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg record; v_bcast record; v_round int; v_inserted int;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO cfg FROM public.marketplace_settings WHERE id = true;
  SELECT * INTO v_bcast FROM public.marketplace_broadcasts WHERE id = p_broadcast_id FOR UPDATE;
  IF v_bcast IS NULL OR v_bcast.status <> 'open' THEN RETURN jsonb_build_object('ok',false,'reason','not_open'); END IF;

  -- Expire current round pending offers
  UPDATE public.marketplace_offers SET response='expired', responded_at=now()
    WHERE broadcast_id = p_broadcast_id AND round = v_bcast.current_round AND response='pending';
  UPDATE public.marketplace_round_history SET ended_at=now(), reason=COALESCE(reason,'') || ' | admin_rebroadcast'
    WHERE broadcast_id = p_broadcast_id AND round = v_bcast.current_round AND ended_at IS NULL;

  v_round := v_bcast.current_round + 1;
  UPDATE public.marketplace_broadcasts
    SET current_round = v_round,
        round_started_at = now(),
        round_expires_at = now() + make_interval(secs => cfg.round_duration_sec),
        updated_at = now()
    WHERE id = p_broadcast_id;

  WITH picks AS (
    SELECT partner_id, distance_m
    FROM public.mp_eligible_partners(p_broadcast_id, v_bcast.current_radius_m, cfg.neighbour_polygon_expansion)
  ), ins AS (
    INSERT INTO public.marketplace_offers (broadcast_id, partner_id, round, incentive, distance_from_route_m)
    SELECT p_broadcast_id, partner_id, v_round, v_bcast.current_incentive, COALESCE(distance_m,0)::int FROM picks
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  INSERT INTO public.marketplace_round_history (broadcast_id, round, incentive, radius_m, offers_sent, reason)
  VALUES (p_broadcast_id, v_round, v_bcast.current_incentive, v_bcast.current_radius_m, COALESCE(v_inserted,0), 'admin_rebroadcast');

  RETURN jsonb_build_object('ok',true,'round',v_round,'offers',COALESCE(v_inserted,0));
END $$;

CREATE OR REPLACE FUNCTION public.mp_admin_force_assign(p_broadcast_id uuid, p_partner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bcast record; v_assign uuid; v_partner_name text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO v_bcast FROM public.marketplace_broadcasts WHERE id = p_broadcast_id FOR UPDATE;
  IF v_bcast IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF v_bcast.status <> 'open' THEN RETURN jsonb_build_object('ok',false,'reason','not_open'); END IF;

  UPDATE public.marketplace_broadcasts
    SET status='assigned', winning_partner_id=p_partner_id, updated_at=now()
    WHERE id = p_broadcast_id AND status='open';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','race'); END IF;

  UPDATE public.subscriptions SET partner_id = p_partner_id, updated_at = now()
    WHERE id = v_bcast.subscription_id;

  UPDATE public.marketplace_offers SET response='superseded', responded_at=now()
    WHERE broadcast_id = p_broadcast_id AND response='pending';
  UPDATE public.marketplace_round_history SET ended_at=now(), reason=COALESCE(reason,'') || ' | admin_force_assign'
    WHERE broadcast_id = p_broadcast_id AND ended_at IS NULL;

  SELECT full_name INTO v_partner_name FROM public.partners WHERE id = p_partner_id;

  INSERT INTO public.customer_notifications (user_id, type, title, body, link, vehicle_id, category, metadata)
  VALUES (
    v_bcast.customer_id, 'partner_assigned',
    'Your Urban Wash Partner has been assigned',
    COALESCE(v_partner_name,'Your partner') || '. Service starts from tomorrow.',
    '/c/home', v_bcast.vehicle_id, 'daily_shine',
    jsonb_build_object('broadcast_id', p_broadcast_id, 'partner_id', p_partner_id, 'subscription_id', v_bcast.subscription_id, 'source','admin_force')
  );

  RETURN jsonb_build_object('ok',true,'partner_id',p_partner_id);
END $$;

GRANT EXECUTE ON FUNCTION public.mp_admin_cancel_broadcast(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mp_admin_extend_timer(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mp_admin_set_incentive(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mp_admin_set_radius(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mp_admin_rebroadcast(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mp_admin_force_assign(uuid, uuid) TO authenticated;

-- Health snapshot: live counts + longest waiting broadcast (last 30d for context)
CREATE OR REPLACE VIEW public.mp_health AS
WITH open_bc AS (
  SELECT id, created_at, current_round
  FROM public.marketplace_broadcasts
  WHERE status = 'open'
),
recent AS (
  SELECT status FROM public.marketplace_broadcasts
   WHERE created_at > now() - interval '30 days'
)
SELECT
  (SELECT count(*) FROM open_bc)                                 AS live_broadcasts,
  (SELECT count(*) FROM open_bc WHERE current_round = 1)         AS waiting_round1,
  (SELECT count(*) FROM recent WHERE status = 'assigned')        AS assigned_30d,
  (SELECT count(*) FROM recent WHERE status IN ('expired','admin_alert')) AS expired_30d,
  (SELECT count(*) FROM recent WHERE status = 'cancelled')       AS cancelled_30d,
  (SELECT COALESCE(EXTRACT(EPOCH FROM (now() - min(created_at)))::int, 0) FROM open_bc) AS longest_wait_seconds,
  (SELECT id FROM open_bc ORDER BY created_at ASC LIMIT 1)       AS longest_wait_broadcast_id;

GRANT SELECT ON public.mp_health TO authenticated;
