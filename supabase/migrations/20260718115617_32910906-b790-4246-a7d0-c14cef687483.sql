CREATE OR REPLACE FUNCTION public.offer_next_for_queue(p_queue_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  q public.subscription_assignment_queue%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_pick record;
  v_timeout int;
  v_steps jsonb;
  v_offer uuid;
  v_existing_pending uuid;
  v_existing_terminal uuid;
  v_enabled boolean;
  v_rate numeric := 17;
  v_partner_busy boolean;
  v_tried_count int;
  v_max_tries int := 25;
BEGIN
  SELECT COALESCE((value::text)::boolean, true) INTO v_enabled
    FROM public.platform_settings WHERE key='auto_assign_enabled';
  IF NOT COALESCE(v_enabled, true) THEN RETURN NULL; END IF;

  SELECT * INTO q
  FROM public.subscription_assignment_queue
  WHERE id = p_queue_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN RETURN NULL; END IF;
  IF q.status IN ('assigned','cancelled','failed_no_partner') THEN RETURN NULL; END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = q.booking_id
  FOR SHARE;

  IF NOT FOUND OR v_booking.payment_status <> 'paid' OR v_booking.status IN ('cancelled','failed') THEN
    UPDATE public.subscription_assignment_queue
       SET status = CASE WHEN v_booking.id IS NULL OR v_booking.status IN ('cancelled','failed') THEN 'cancelled' ELSE status END,
           current_offer_partner_id = NULL,
           offer_expires_at = NULL,
           next_retry_at = NULL,
           updated_at = now()
     WHERE id = q.id;
    RETURN NULL;
  END IF;

  SELECT id INTO v_existing_pending
  FROM public.subscription_offers
  WHERE queue_id = q.id
    AND response = 'pending'
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_existing_pending IS NOT NULL THEN
    RETURN v_existing_pending;
  END IF;

  SELECT id INTO v_existing_terminal
  FROM public.subscription_offers
  WHERE queue_id = q.id
    AND response = 'accepted'
  ORDER BY responded_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF v_existing_terminal IS NOT NULL THEN
    UPDATE public.subscription_assignment_queue
       SET status = 'assigned', current_offer_partner_id = NULL, offer_expires_at = NULL, next_retry_at = NULL, updated_at = now()
     WHERE id = q.id;
    RETURN NULL;
  END IF;

  UPDATE public.subscription_assignment_queue
     SET status = 'processing', current_offer_partner_id = NULL, offer_expires_at = NULL, next_retry_at = NULL, updated_at = now()
   WHERE id = q.id;

  v_tried_count := COALESCE(array_length(q.tried_partner_ids, 1), 0);
  IF v_tried_count >= v_max_tries THEN
    UPDATE public.subscription_assignment_queue
       SET status = 'failed_no_partner', current_offer_partner_id = NULL, offer_expires_at = NULL, next_retry_at = NULL,
           attempts_log = COALESCE(attempts_log, '[]'::jsonb) || jsonb_build_object('event','failed_no_partner','at',now(),'tried_count',v_tried_count),
           updated_at = now()
     WHERE id = q.id;
    RETURN NULL;
  END IF;

  SELECT COALESCE((value::text)::int, 90) INTO v_timeout FROM public.platform_settings WHERE key='auto_assign_timeout_sec';
  SELECT value INTO v_steps FROM public.platform_settings WHERE key='auto_assign_radius_steps';

  SELECT * INTO v_pick FROM public.pick_scored_partner_for_queue(q.id, 'priority', NULL) LIMIT 1;

  IF v_pick.partner_id IS NULL THEN
    DECLARE step numeric;
    BEGIN
      FOR step IN SELECT (jsonb_array_elements_text(coalesce(v_steps,'[2,5,10,15]'::jsonb)))::numeric LOOP
        IF step <= q.radius_km THEN CONTINUE; END IF;
        SELECT * INTO v_pick FROM public.pick_scored_partner_for_queue(q.id, 'city', step) LIMIT 1;
        IF v_pick.partner_id IS NOT NULL THEN
          UPDATE public.subscription_assignment_queue SET radius_km = step, updated_at = now() WHERE id = q.id;
          EXIT;
        END IF;
      END LOOP;
    END;
  END IF;

  IF v_pick.partner_id IS NULL THEN
    UPDATE public.subscription_assignment_queue
       SET status = 'waiting_for_partner', current_offer_partner_id = NULL, offer_expires_at = NULL,
           next_retry_at = now() + interval '10 minutes',
           attempts_log = COALESCE(attempts_log, '[]'::jsonb) || jsonb_build_object('event','waiting_no_partner','at',now(),'tried_count',v_tried_count),
           updated_at = now()
     WHERE id = q.id;
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.subscription_offers o
    JOIN public.subscription_assignment_queue oq ON oq.id = o.queue_id
    WHERE o.partner_id = v_pick.partner_id
      AND o.response = 'pending'
      AND oq.status IN ('offered','processing')
  ) INTO v_partner_busy;

  IF v_partner_busy THEN
    UPDATE public.subscription_assignment_queue
       SET status = 'waiting_for_partner', current_offer_partner_id = NULL, offer_expires_at = NULL,
           next_retry_at = now() + interval '2 minutes',
           attempts_log = COALESCE(attempts_log, '[]'::jsonb) || jsonb_build_object('event','waiting_partner_busy','at',now(),'partner_id',v_pick.partner_id),
           updated_at = now()
     WHERE id = q.id;
    RETURN NULL;
  END IF;

  BEGIN
    INSERT INTO public.subscription_offers(
      queue_id, partner_id, scope, expires_at,
      distance_m, projected_extra_earnings,
      route_delta_seconds, distance_from_route_m,
      extra_per_day_paise, extra_per_month_paise,
      score, score_breakdown
    )
    VALUES (
      q.id, v_pick.partner_id,
      CASE WHEN q.radius_km = 0 THEN 'priority' ELSE 'city' END,
      now() + (v_timeout || ' seconds')::interval,
      (v_pick.dist_km * 1000)::int, v_rate * 30,
      v_pick.route_delta_sec, v_pick.distance_from_route_m,
      (v_rate * 100)::int, (v_rate * 30 * 100)::int,
      v_pick.score,
      COALESCE(v_pick.score_breakdown, '{}'::jsonb) || jsonb_build_object('created_by','offer_next_for_queue','queue_id',q.id,'booking_id',q.booking_id)
    )
    RETURNING id INTO v_offer;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_offer
    FROM public.subscription_offers
    WHERE queue_id = q.id AND response = 'pending'
    ORDER BY created_at DESC, id DESC
    LIMIT 1;
    RETURN v_offer;
  END;

  UPDATE public.subscription_assignment_queue
     SET status = 'offered',
         current_offer_partner_id = v_pick.partner_id,
         offer_expires_at = now() + (v_timeout || ' seconds')::interval,
         next_retry_at = NULL,
         tried_partner_ids = CASE
           WHEN v_pick.partner_id = ANY(COALESCE(tried_partner_ids, ARRAY[]::uuid[])) THEN tried_partner_ids
           ELSE array_append(COALESCE(tried_partner_ids, ARRAY[]::uuid[]), v_pick.partner_id)
         END,
         attempts_log = COALESCE(attempts_log, '[]'::jsonb) || jsonb_build_object('event','offer_created','at',now(),'offer_id',v_offer,'partner_id',v_pick.partner_id),
         updated_at = now()
   WHERE id = q.id;

  INSERT INTO public.partner_notifications(partner_id, type, category, title, body, link, metadata)
  VALUES (v_pick.partner_id, 'daily_shine_offer', 'daily_shine',
          'New Daily Shine Customer',
          'Area ' || COALESCE(q.area,'(nearby)') || ' · +' || round((v_pick.route_delta_sec/60.0)::numeric,0) || ' min · +₹' || (v_rate*30)::int || '/mo',
          '/app/leads/' || v_offer::text,
          jsonb_build_object('queue_id', q.id, 'offer_id', v_offer, 'booking_id', q.booking_id, 'type','offer', 'created_by','offer_next_for_queue'))
  ON CONFLICT ((metadata->>'offer_id'))
  WHERE type = 'daily_shine_offer' AND metadata ? 'offer_id'
  DO NOTHING;

  RETURN v_offer;
END;
$$;