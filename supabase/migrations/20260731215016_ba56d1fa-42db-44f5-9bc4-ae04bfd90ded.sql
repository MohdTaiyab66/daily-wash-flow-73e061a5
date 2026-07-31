CREATE OR REPLACE FUNCTION public.mp_accept_offer_legacy_impl(p_broadcast_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_partner uuid := auth.uid();
  v_offer   record;
  v_bcast   record;
  v_assign  uuid;
  v_updated int;
  v_created int := 0;
  v_partner_name text;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT o.* INTO v_offer FROM public.marketplace_offers o
    JOIN public.marketplace_broadcasts b ON b.id = o.broadcast_id
   WHERE o.broadcast_id = p_broadcast_id
     AND o.partner_id = v_partner
     AND o.response = 'pending'
     AND o.round = b.current_round;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_offer');
  END IF;

  UPDATE public.marketplace_broadcasts
     SET status = 'assigned', winning_partner_id = v_partner, updated_at = now()
   WHERE id = p_broadcast_id AND status = 'open'
  RETURNING * INTO v_bcast;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    UPDATE public.marketplace_offers SET response = 'superseded', responded_at = now()
      WHERE id = v_offer.id AND response = 'pending';
    RETURN jsonb_build_object('ok', false, 'reason', 'already_taken');
  END IF;

  UPDATE public.subscriptions
     SET assigned_partner_id = v_partner, assigned_at = now(),
         status = 'assigned', updated_at = now()
   WHERE id = v_bcast.subscription_id;

  UPDATE public.marketplace_offers SET response = 'accepted', responded_at = now()
    WHERE id = v_offer.id;
  UPDATE public.marketplace_offers SET response = 'superseded', responded_at = now()
    WHERE broadcast_id = p_broadcast_id AND response = 'pending' AND id <> v_offer.id;

  UPDATE public.marketplace_round_history SET ended_at = now()
    WHERE broadcast_id = p_broadcast_id AND ended_at IS NULL;

  v_created := public.mp_generate_services_for_broadcast(p_broadcast_id);
  SELECT assignment_id INTO v_assign FROM public.marketplace_broadcasts WHERE id = p_broadcast_id;

  SELECT COALESCE(full_name, 'Your Urban Wash Partner') INTO v_partner_name
    FROM public.partners WHERE id = v_partner;

  INSERT INTO public.customer_notifications (user_id, type, title, body, link, vehicle_id, category, metadata)
  SELECT
    v_bcast.customer_id, 'partner_accepted', 'Partner assigned',
    COALESCE(v_partner_name, 'Your partner') || ' accepted your service.',
    '/c/home', v_bcast.vehicle_id, 'daily_shine',
    jsonb_build_object('broadcast_id', p_broadcast_id, 'partner_id', v_partner, 'subscription_id', v_bcast.subscription_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.customer_notifications cn
     WHERE cn.user_id = v_bcast.customer_id
       AND cn.type = 'partner_accepted'
       AND cn.metadata->>'subscription_id' = v_bcast.subscription_id::text
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.admin_notifications (category, title, body, link, subject_type, subject_id, metadata)
  VALUES (
    'marketplace', 'Customer Assigned via Marketplace',
    COALESCE(v_partner_name, 'Partner') || ' accepted at ₹' || v_offer.incentive || '/day in round ' || v_offer.round,
    '/admin/marketplace/' || p_broadcast_id, 'marketplace_broadcast', p_broadcast_id,
    jsonb_build_object('partner_id', v_partner, 'subscription_id', v_bcast.subscription_id,
                       'round', v_offer.round, 'incentive', v_offer.incentive)
  );

  RETURN jsonb_build_object(
    'ok', true, 'broadcast_id', p_broadcast_id, 'assignment_id', v_assign,
    'subscription_id', v_bcast.subscription_id, 'services_created', v_created,
    'incentive', v_offer.incentive, 'round', v_offer.round
  );
END $function$;
