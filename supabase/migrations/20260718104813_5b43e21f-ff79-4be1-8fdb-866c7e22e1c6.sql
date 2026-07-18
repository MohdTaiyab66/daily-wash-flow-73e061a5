-- Fix 1: deterministic newest-booking-first ordering in the popup RPC
CREATE OR REPLACE FUNCTION public.get_pending_offer_for_partner(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (auth.uid() = p_partner_id OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT to_jsonb(o) || jsonb_build_object(
    'subscription_assignment_queue', to_jsonb(q) || jsonb_build_object(
      'bookings', to_jsonb(b) || jsonb_build_object(
        'customer_vehicles', to_jsonb(cv),
        'customer_addresses', to_jsonb(ca)
      )
    ),
    '_customer_name', COALESCE(cp.full_name, c.full_name)
  )
  INTO v_result
  FROM public.subscription_offers o
  JOIN public.subscription_assignment_queue q ON q.id = o.queue_id
  LEFT JOIN public.bookings b ON b.id = q.booking_id
  LEFT JOIN public.customer_vehicles cv ON cv.id = b.vehicle_id
  LEFT JOIN public.customer_addresses ca ON ca.id = b.address_id
  LEFT JOIN public.customer_profiles cp ON cp.user_id = q.customer_id
  LEFT JOIN public.customers c ON c.id = q.customer_id
  WHERE o.partner_id = p_partner_id
    AND o.response = 'pending'
    AND o.expires_at > now()
    -- Only offer for bookings that are actually paid (hard gate)
    AND (b.id IS NULL OR b.payment_status = 'paid')
  -- Newest paid booking first; deterministic tiebreakers so the popup
  -- never shows a "random" older booking when offered_at ties.
  ORDER BY b.created_at DESC NULLS LAST,
           o.offered_at DESC,
           o.id DESC
  LIMIT 1;

  RETURN v_result;
END;
$function$;

-- Fix 2: don't stack concurrent offers on the same partner
CREATE OR REPLACE FUNCTION public.offer_next_for_queue(p_queue_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  q public.subscription_assignment_queue%ROWTYPE;
  v_pick record;
  v_timeout int;
  v_steps jsonb;
  v_offer uuid;
  v_enabled boolean;
  v_rate numeric := 17;
  v_partner_busy boolean;
BEGIN
  SELECT COALESCE((value::text)::boolean, true) INTO v_enabled FROM public.platform_settings WHERE key='auto_assign_enabled';
  IF NOT v_enabled THEN RETURN NULL; END IF;

  SELECT * INTO q FROM public.subscription_assignment_queue WHERE id = p_queue_id;
  IF NOT FOUND OR q.status = 'assigned' THEN RETURN NULL; END IF;

  IF q.locked_partner_id IS NOT NULL AND q.lock_until IS NOT NULL AND q.lock_until >= CURRENT_DATE THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE((value::text)::int, 90) INTO v_timeout FROM public.platform_settings WHERE key='auto_assign_timeout_sec';
  SELECT value INTO v_steps FROM public.platform_settings WHERE key='auto_assign_radius_steps';

  SELECT * INTO v_pick FROM public.pick_scored_partner_for_queue(p_queue_id, 'priority', NULL) LIMIT 1;

  IF v_pick.partner_id IS NULL THEN
    DECLARE step numeric;
    BEGIN
      FOR step IN SELECT (jsonb_array_elements_text(coalesce(v_steps,'[2,5,10,15]'::jsonb)))::numeric LOOP
        IF step <= q.radius_km THEN CONTINUE; END IF;
        SELECT * INTO v_pick FROM public.pick_scored_partner_for_queue(p_queue_id, 'city', step) LIMIT 1;
        IF v_pick.partner_id IS NOT NULL THEN
          UPDATE public.subscription_assignment_queue SET radius_km = step WHERE id = p_queue_id;
          EXIT;
        END IF;
      END LOOP;
    END;
  END IF;

  IF v_pick.partner_id IS NULL THEN
    UPDATE public.subscription_assignment_queue
      SET status = 'waiting_for_partner',
          current_offer_partner_id = NULL,
          offer_expires_at = NULL,
          next_retry_at = now() + interval '45 seconds',
          tried_partner_ids = ARRAY[]::uuid[]
      WHERE id = p_queue_id;
    RETURN NULL;
  END IF;

  -- Fix: skip if the chosen partner already has a live pending offer.
  -- Prevents 9 concurrent daily-shine offers piling up on the same
  -- partner and confusing the popup about which booking to show.
  SELECT EXISTS (
    SELECT 1 FROM public.subscription_offers
    WHERE partner_id = v_pick.partner_id
      AND response = 'pending'
      AND expires_at > now()
  ) INTO v_partner_busy;

  IF v_partner_busy THEN
    UPDATE public.subscription_assignment_queue
      SET status = 'waiting_for_partner',
          current_offer_partner_id = NULL,
          offer_expires_at = NULL,
          next_retry_at = now() + interval '20 seconds'
      WHERE id = p_queue_id;
    RETURN NULL;
  END IF;

  INSERT INTO public.subscription_offers(
    queue_id, partner_id, scope, expires_at,
    distance_m, projected_extra_earnings,
    route_delta_seconds, distance_from_route_m,
    extra_per_day_paise, extra_per_month_paise,
    score, score_breakdown
  )
  VALUES (
    p_queue_id, v_pick.partner_id,
    CASE WHEN q.radius_km = 0 THEN 'priority' ELSE 'city' END,
    now() + (v_timeout || ' seconds')::interval,
    (v_pick.dist_km * 1000)::int, v_rate * 30,
    v_pick.route_delta_sec, v_pick.distance_from_route_m,
    (v_rate * 100)::int, (v_rate * 30 * 100)::int,
    v_pick.score, v_pick.score_breakdown
  )
  RETURNING id INTO v_offer;

  UPDATE public.subscription_assignment_queue
    SET status = 'offered',
        current_offer_partner_id = v_pick.partner_id,
        offer_expires_at = now() + (v_timeout || ' seconds')::interval,
        next_retry_at = NULL,
        tried_partner_ids = array_append(tried_partner_ids, v_pick.partner_id)
    WHERE id = p_queue_id;

  INSERT INTO public.partner_notifications(partner_id, type, category, title, body, link, metadata)
  VALUES (v_pick.partner_id, 'daily_shine_offer', 'daily_shine',
          'New Daily Shine Customer',
          'Area ' || COALESCE(q.area,'(nearby)') || ' · +' || round((v_pick.route_delta_sec/60.0)::numeric,0) || ' min · +₹' || (v_rate*30)::int || '/mo',
          '/app/leads/' || v_offer::text,
          jsonb_build_object('queue_id', p_queue_id, 'offer_id', v_offer, 'booking_id', q.booking_id, 'type','offer'));

  RETURN v_offer;
END $function$;