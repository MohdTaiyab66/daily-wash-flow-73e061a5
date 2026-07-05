
-- 1. Exclude declined partners + rough route impact in eligibility
CREATE OR REPLACE FUNCTION public.mp_eligible_partners(
  p_broadcast_id uuid,
  p_radius_m integer,
  p_include_neighbours boolean DEFAULT false
) RETURNS TABLE (
  partner_id uuid,
  distance_m numeric,
  today_cars integer,
  remaining_capacity integer
) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
           COALESCE(a.fulfilled_cars,0) AS today_cars,
           GREATEST(0, COALESCE(a.target_cars,0) - COALESCE(a.fulfilled_cars,0)) AS remaining_capacity
    FROM public.partners p
    LEFT JOIN LATERAL (
      SELECT * FROM public.assignments aa
      WHERE aa.partner_id = p.id AND aa.status='active'
        AND CURRENT_DATE BETWEEN aa.start_date AND aa.end_date
      ORDER BY aa.start_date DESC LIMIT 1
    ) a ON true
    WHERE p.status = 'active'
      AND p.availability = 'online'
      AND COALESCE(p.accepting_new, true) = true
      AND a.id IS NOT NULL
      -- exclude partners who have already declined this broadcast in any prior round
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
      p_radius_m <= 0
      OR b.distance_m IS NULL
      OR b.distance_m <= p_radius_m
      OR (p_include_neighbours AND COALESCE(z.neighbour_expand, false))
    )
  ORDER BY b.distance_m NULLS LAST, b.today_cars ASC, b.remaining_capacity DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.mp_eligible_partners(uuid,integer,boolean) TO authenticated, service_role;

-- 2. Populate rough route impact when offers are inserted (heuristic: ~2× straight-line)
CREATE OR REPLACE FUNCTION public.tg_mp_offer_defaults()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.route_impact_m IS NULL AND NEW.distance_from_route_m IS NOT NULL THEN
    NEW.route_impact_m := GREATEST(50, (NEW.distance_from_route_m * 2)::int);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_mp_offer_defaults ON public.marketplace_offers;
CREATE TRIGGER trg_mp_offer_defaults BEFORE INSERT ON public.marketplace_offers
  FOR EACH ROW EXECUTE FUNCTION public.tg_mp_offer_defaults();

-- 3. Accept: also send customer + admin notifications
CREATE OR REPLACE FUNCTION public.mp_accept_offer(p_broadcast_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_offer   record;
  v_bcast   record;
  v_assign  uuid;
  v_updated int;
  v_partner_name text;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT o.* INTO v_offer FROM public.marketplace_offers o
    JOIN public.marketplace_broadcasts b ON b.id = o.broadcast_id
   WHERE o.broadcast_id = p_broadcast_id
     AND o.partner_id = v_partner
     AND o.response='pending'
     AND o.round = b.current_round;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason','no_pending_offer');
  END IF;

  UPDATE public.marketplace_broadcasts
     SET status='assigned', winning_partner_id = v_partner, updated_at = now()
   WHERE id = p_broadcast_id AND status='open'
  RETURNING * INTO v_bcast;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    UPDATE public.marketplace_offers SET response='superseded', responded_at=now()
      WHERE id = v_offer.id AND response='pending';
    RETURN jsonb_build_object('ok', false, 'reason','already_taken');
  END IF;

  SELECT id INTO v_assign FROM public.assignments
   WHERE partner_id = v_partner AND status='active'
     AND CURRENT_DATE BETWEEN start_date AND end_date
   ORDER BY start_date DESC LIMIT 1;

  UPDATE public.marketplace_broadcasts SET assignment_id = v_assign WHERE id = p_broadcast_id;

  UPDATE public.subscriptions
     SET assigned_partner_id = v_partner,
         assigned_at = now(),
         status = 'assigned',
         updated_at = now()
   WHERE id = v_bcast.subscription_id;

  UPDATE public.marketplace_offers SET response='accepted', responded_at=now()
    WHERE id = v_offer.id;
  UPDATE public.marketplace_offers SET response='superseded', responded_at=now()
    WHERE broadcast_id = p_broadcast_id AND response='pending' AND id <> v_offer.id;

  UPDATE public.marketplace_round_history SET ended_at = now()
    WHERE broadcast_id = p_broadcast_id AND ended_at IS NULL;

  SELECT COALESCE(full_name, 'Your Urban Wash Partner') INTO v_partner_name
    FROM public.partners WHERE id = v_partner;

  -- Customer notification
  INSERT INTO public.customer_notifications (user_id, type, title, body, link, vehicle_id, category, metadata)
  VALUES (
    v_bcast.customer_id,
    'partner_assigned',
    'Your Urban Wash Partner has been assigned',
    COALESCE(v_partner_name, 'Your partner') || '. Service starts from tomorrow.',
    '/c/home',
    v_bcast.vehicle_id,
    'daily_shine',
    jsonb_build_object('broadcast_id', p_broadcast_id, 'partner_id', v_partner, 'subscription_id', v_bcast.subscription_id)
  );

  -- Admin notification
  INSERT INTO public.admin_notifications (category, title, body, link, subject_type, subject_id, metadata)
  VALUES (
    'marketplace',
    'Customer Assigned via Marketplace',
    COALESCE(v_partner_name,'Partner') || ' accepted at ₹' || v_offer.incentive || '/day in round ' || v_offer.round,
    '/admin/marketplace/' || p_broadcast_id,
    'marketplace_broadcast',
    p_broadcast_id,
    jsonb_build_object(
      'partner_id', v_partner,
      'subscription_id', v_bcast.subscription_id,
      'round', v_offer.round,
      'incentive', v_offer.incentive
    )
  );

  RETURN jsonb_build_object(
    'ok', true, 'broadcast_id', p_broadcast_id,
    'assignment_id', v_assign, 'subscription_id', v_bcast.subscription_id,
    'incentive', v_offer.incentive, 'round', v_offer.round
  );
END $$;
GRANT EXECUTE ON FUNCTION public.mp_accept_offer(uuid) TO authenticated;

-- 4. Cancel broadcast when subscription is cancelled
CREATE OR REPLACE FUNCTION public.tg_mp_cancel_on_subscription_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status IN ('cancelled','refunded') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.marketplace_broadcasts
       SET status='cancelled', updated_at=now()
     WHERE subscription_id = NEW.id AND status = 'open';
    UPDATE public.marketplace_offers o
       SET response='superseded', responded_at=now()
      FROM public.marketplace_broadcasts b
     WHERE o.broadcast_id = b.id
       AND b.subscription_id = NEW.id
       AND b.status = 'cancelled'
       AND o.response = 'pending';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_mp_cancel_on_sub_cancel ON public.subscriptions;
CREATE TRIGGER trg_mp_cancel_on_sub_cancel AFTER UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_mp_cancel_on_subscription_cancel();
