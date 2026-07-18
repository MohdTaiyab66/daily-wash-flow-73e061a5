
-- ============================================================
-- P0 fix: stop infinite offer retry loop
-- ============================================================

-- 1) Rewrite offer_next_for_queue:
--    * take a transactional row lock (SELECT ... FOR UPDATE) so
--      concurrent sweep workers cannot double-process a queue
--    * guard: if a pending offer already exists for this queue,
--      do nothing (idempotent)
--    * do NOT reset tried_partner_ids when parking. The reset
--      was the direct cause of the infinite loop: after every
--      timeout/decline the same partner was picked again.
--    * back off 5 minutes when no partner is available (was 45s)
--    * cap total attempts at 25 -> mark queue failed_no_partner
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
  v_existing_pending uuid;
  v_tried_count int;
  v_max_tries int := 25;
BEGIN
  SELECT COALESCE((value::text)::boolean, true) INTO v_enabled
    FROM public.platform_settings WHERE key='auto_assign_enabled';
  IF NOT v_enabled THEN RETURN NULL; END IF;

  -- Row-level lock: only one worker may drive this queue at a time.
  -- If another worker already holds it, skip (SKIP LOCKED) — the other
  -- worker will finish the state transition.
  SELECT * INTO q
    FROM public.subscription_assignment_queue
    WHERE id = p_queue_id
    FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR q.status IN ('assigned','cancelled','failed_no_partner') THEN
    RETURN NULL;
  END IF;

  IF q.locked_partner_id IS NOT NULL AND q.lock_until IS NOT NULL AND q.lock_until >= CURRENT_DATE THEN
    RETURN NULL;
  END IF;

  -- If a live pending offer already exists for this queue, do nothing.
  SELECT id INTO v_existing_pending
    FROM public.subscription_offers
    WHERE queue_id = p_queue_id
      AND response = 'pending'
      AND expires_at > now()
    LIMIT 1;
  IF v_existing_pending IS NOT NULL THEN
    RETURN v_existing_pending;
  END IF;

  -- Cap total attempts; after this the queue is parked terminally.
  v_tried_count := COALESCE(array_length(q.tried_partner_ids, 1), 0);
  IF v_tried_count >= v_max_tries THEN
    UPDATE public.subscription_assignment_queue
      SET status = 'failed_no_partner',
          current_offer_partner_id = NULL,
          offer_expires_at = NULL,
          next_retry_at = NULL
      WHERE id = p_queue_id;
    RETURN NULL;
  END IF;

  SELECT COALESCE((value::text)::int, 90) INTO v_timeout
    FROM public.platform_settings WHERE key='auto_assign_timeout_sec';
  SELECT value INTO v_steps
    FROM public.platform_settings WHERE key='auto_assign_radius_steps';

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
    -- No eligible partner. Park the queue but KEEP tried_partner_ids
    -- so we do not re-offer the same partner on the next sweep.
    -- Longer backoff (5 min) drastically reduces sweep churn.
    UPDATE public.subscription_assignment_queue
      SET status = 'waiting_for_partner',
          current_offer_partner_id = NULL,
          offer_expires_at = NULL,
          next_retry_at = now() + interval '5 minutes'
      WHERE id = p_queue_id;
    RETURN NULL;
  END IF;

  -- Skip if the chosen partner already has a live pending offer elsewhere.
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
          next_retry_at = now() + interval '60 seconds'
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

-- 2) sweep: use SKIP LOCKED so concurrent cron ticks cannot process
-- the same queue twice.
CREATE OR REPLACE FUNCTION public.sweep_subscription_offers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record; n int := 0;
BEGIN
  -- (a) Expire offers with no response
  FOR r IN SELECT id, queue_id FROM public.subscription_offers
           WHERE response='pending' AND expires_at < now()
           FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.subscription_offers SET response='timeout', responded_at=now() WHERE id = r.id;
    PERFORM public.offer_next_for_queue(r.queue_id);
    n := n + 1;
  END LOOP;

  -- (b) Retry queues waiting for an eligible partner
  FOR r IN SELECT q.id
           FROM public.subscription_assignment_queue q
           JOIN public.bookings b ON b.id = q.booking_id
           WHERE q.status = 'waiting_for_partner'
             AND (q.next_retry_at IS NULL OR q.next_retry_at <= now())
             AND b.payment_status = 'paid'
             AND b.status NOT IN ('cancelled','completed')
           ORDER BY q.created_at ASC
           LIMIT 100
           FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.offer_next_for_queue(r.id);
    n := n + 1;
  END LOOP;

  RETURN n;
END $function$;

-- 3) One-time flood cleanup:
--    a) Timeout the single live pending offer so nothing pushes.
UPDATE public.subscription_offers
  SET response = 'timeout', responded_at = now()
  WHERE response = 'pending' AND expires_at > now();

--    b) For every currently-live queue, pre-populate tried_partner_ids
--       with the partners who have already been offered this queue,
--       so the fixed loop does NOT immediately re-offer them.
UPDATE public.subscription_assignment_queue q
  SET tried_partner_ids = COALESCE(sub.partners, ARRAY[]::uuid[]),
      status = 'waiting_for_partner',
      current_offer_partner_id = NULL,
      offer_expires_at = NULL,
      next_retry_at = now() + interval '10 minutes'
  FROM (
    SELECT queue_id, array_agg(DISTINCT partner_id) AS partners
      FROM public.subscription_offers
      GROUP BY queue_id
  ) sub
  WHERE q.id = sub.queue_id
    AND q.status IN ('waiting_for_partner','offered');
