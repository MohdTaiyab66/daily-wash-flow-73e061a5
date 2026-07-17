
-- 1) Column for retry schedule
ALTER TABLE public.subscription_assignment_queue
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

-- 2) offer_next_for_queue: waiting_for_partner instead of terminal failed
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
BEGIN
  SELECT COALESCE((value::text)::boolean, true) INTO v_enabled FROM public.platform_settings WHERE key='auto_assign_enabled';
  IF NOT v_enabled THEN RETURN NULL; END IF;

  SELECT * INTO q FROM public.subscription_assignment_queue WHERE id = p_queue_id;
  -- Skip if terminal-assigned; waiting_for_partner and failed are both re-tryable
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
    -- No eligible partner right now — park queue for automatic retry.
    -- Clear tried_partner_ids so partners who come online later are considered.
    UPDATE public.subscription_assignment_queue
      SET status = 'waiting_for_partner',
          current_offer_partner_id = NULL,
          offer_expires_at = NULL,
          next_retry_at = now() + interval '45 seconds',
          tried_partner_ids = ARRAY[]::uuid[]
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

-- 3) Sweeper: also retry queues waiting for a partner once next_retry_at elapsed
CREATE OR REPLACE FUNCTION public.sweep_subscription_offers()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; n int := 0;
BEGIN
  -- (a) Expire offers with no response
  FOR r IN SELECT * FROM public.subscription_offers
           WHERE response='pending' AND expires_at < now()
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
  LOOP
    PERFORM public.offer_next_for_queue(r.id);
    n := n + 1;
  END LOOP;

  RETURN n;
END $function$;

-- 4) Migrate recent paid-booking queues that were terminally 'failed' into waiting_for_partner
UPDATE public.subscription_assignment_queue q
   SET status = 'waiting_for_partner',
       next_retry_at = now(),
       tried_partner_ids = ARRAY[]::uuid[]
  FROM public.bookings b
 WHERE q.booking_id = b.id
   AND q.status = 'failed'
   AND b.payment_status = 'paid'
   AND b.status NOT IN ('cancelled','completed');
