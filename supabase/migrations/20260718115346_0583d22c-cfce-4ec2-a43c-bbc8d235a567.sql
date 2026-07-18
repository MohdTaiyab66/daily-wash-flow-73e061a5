-- P0: hard-stop duplicate Daily Shine offer generation and make the pipeline traceable.

-- 1) Mark currently expired pending offers as timed out before adding stricter uniqueness.
UPDATE public.subscription_offers
SET response = 'timeout', responded_at = COALESCE(responded_at, now())
WHERE response = 'pending'
  AND expires_at <= now();

-- If any duplicate still-live pending offers exist for the same queue, keep the newest and supersede the rest.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY queue_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.subscription_offers
  WHERE response = 'pending'
)
UPDATE public.subscription_offers o
SET response = 'superseded', responded_at = COALESCE(o.responded_at, now())
FROM ranked r
WHERE o.id = r.id
  AND r.rn > 1;

-- Remove duplicate Daily Shine partner notifications for the same offer, keeping the earliest row.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY (metadata->>'offer_id')
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.partner_notifications
  WHERE type = 'daily_shine_offer'
    AND metadata ? 'offer_id'
)
DELETE FROM public.partner_notifications pn
USING ranked r
WHERE pn.id = r.id
  AND r.rn > 1;

-- Remove duplicate push result rows for the same offer, keeping the earliest terminal push row.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY offer_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.offer_delivery_events
  WHERE stage IN ('push_sent', 'push_failed')
)
DELETE FROM public.offer_delivery_events ode
USING ranked r
WHERE ode.id = r.id
  AND r.rn > 1;

-- 2) Database constraints: duplicates must fail even if code calls the RPC twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_offers_one_pending_per_queue
  ON public.subscription_offers(queue_id)
  WHERE response = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_offers_one_pending_per_queue_partner
  ON public.subscription_offers(queue_id, partner_id)
  WHERE response = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_notifications_daily_shine_offer_once
  ON public.partner_notifications((metadata->>'offer_id'))
  WHERE type = 'daily_shine_offer'
    AND metadata ? 'offer_id';

CREATE UNIQUE INDEX IF NOT EXISTS uq_offer_delivery_events_one_terminal_push_per_offer
  ON public.offer_delivery_events(offer_id)
  WHERE stage IN ('push_sent', 'push_failed');

-- 3) Guard trigger: never allow inserting another pending offer for a queue.
CREATE OR REPLACE FUNCTION public.tg_offer_no_duplicate_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.response = 'pending' THEN
    IF EXISTS (
      SELECT 1
      FROM public.subscription_offers o
      WHERE o.queue_id = NEW.queue_id
        AND o.response = 'pending'
        AND o.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RAISE EXCEPTION 'Duplicate pending offer blocked for queue %', NEW.queue_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_offer_no_duplicate_pending ON public.subscription_offers;
CREATE TRIGGER trg_offer_no_duplicate_pending
BEFORE INSERT OR UPDATE OF response, queue_id
ON public.subscription_offers
FOR EACH ROW
EXECUTE FUNCTION public.tg_offer_no_duplicate_pending();

-- 4) Rewrite offer_next_for_queue as a fully idempotent, locked state transition.
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

  -- Queue lock. If another worker is processing this queue, skip.
  SELECT * INTO q
  FROM public.subscription_assignment_queue
  WHERE id = p_queue_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Closed queues are terminal. Cron and app refreshes must never reopen them.
  IF q.status IN ('assigned','cancelled','failed_no_partner') THEN
    RETURN NULL;
  END IF;

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

  -- Existing pending offer is authoritative, even if it is already past expires_at.
  -- The sweeper must first mark it timeout/declined before another offer may be created.
  SELECT id INTO v_existing_pending
  FROM public.subscription_offers
  WHERE queue_id = q.id
    AND response = 'pending'
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_existing_pending IS NOT NULL THEN
    RETURN v_existing_pending;
  END IF;

  -- If the queue was already accepted by any path, close it permanently.
  SELECT id INTO v_existing_terminal
  FROM public.subscription_offers
  WHERE queue_id = q.id
    AND response = 'accepted'
  ORDER BY responded_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF v_existing_terminal IS NOT NULL THEN
    UPDATE public.subscription_assignment_queue
       SET status = 'assigned',
           current_offer_partner_id = NULL,
           offer_expires_at = NULL,
           next_retry_at = NULL,
           updated_at = now()
     WHERE id = q.id;
    RETURN NULL;
  END IF;

  -- Optional queue-level lock marker; prevents external code paths from treating it as idle.
  UPDATE public.subscription_assignment_queue
     SET status = 'processing',
         current_offer_partner_id = NULL,
         offer_expires_at = NULL,
         next_retry_at = NULL,
         updated_at = now()
   WHERE id = q.id;

  v_tried_count := COALESCE(array_length(q.tried_partner_ids, 1), 0);
  IF v_tried_count >= v_max_tries THEN
    UPDATE public.subscription_assignment_queue
       SET status = 'failed_no_partner',
           current_offer_partner_id = NULL,
           offer_expires_at = NULL,
           next_retry_at = NULL,
           attempts_log = COALESCE(attempts_log, '[]'::jsonb) || jsonb_build_object('event','failed_no_partner','at',now(),'tried_count',v_tried_count),
           updated_at = now()
     WHERE id = q.id;
    RETURN NULL;
  END IF;

  SELECT COALESCE((value::text)::int, 90) INTO v_timeout
    FROM public.platform_settings WHERE key='auto_assign_timeout_sec';
  SELECT value INTO v_steps
    FROM public.platform_settings WHERE key='auto_assign_radius_steps';

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
       SET status = 'waiting_for_partner',
           current_offer_partner_id = NULL,
           offer_expires_at = NULL,
           next_retry_at = now() + interval '10 minutes',
           attempts_log = COALESCE(attempts_log, '[]'::jsonb) || jsonb_build_object('event','waiting_no_partner','at',now(),'tried_count',v_tried_count),
           updated_at = now()
     WHERE id = q.id;
    RETURN NULL;
  END IF;

  -- A partner may have only one live offer at a time. Do not reassign busy partners.
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
       SET status = 'waiting_for_partner',
           current_offer_partner_id = NULL,
           offer_expires_at = NULL,
           next_retry_at = now() + interval '2 minutes',
           attempts_log = COALESCE(attempts_log, '[]'::jsonb) || jsonb_build_object('event','waiting_partner_busy','at',now(),'partner_id',v_pick.partner_id),
           updated_at = now()
     WHERE id = q.id;
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
    q.id, v_pick.partner_id,
    CASE WHEN q.radius_km = 0 THEN 'priority' ELSE 'city' END,
    now() + (v_timeout || ' seconds')::interval,
    (v_pick.dist_km * 1000)::int, v_rate * 30,
    v_pick.route_delta_sec, v_pick.distance_from_route_m,
    (v_rate * 100)::int, (v_rate * 30 * 100)::int,
    v_pick.score,
    COALESCE(v_pick.score_breakdown, '{}'::jsonb) || jsonb_build_object('created_by','offer_next_for_queue','queue_id',q.id,'booking_id',q.booking_id)
  )
  ON CONFLICT ON CONSTRAINT subscription_offers_pkey DO NOTHING
  RETURNING id INTO v_offer;

  -- Unique partial indexes cannot be referenced by ON CONFLICT ON CONSTRAINT.
  -- If the partial unique index rejected the insert, fetch and return the existing pending offer.
  IF v_offer IS NULL THEN
    SELECT id INTO v_offer
    FROM public.subscription_offers
    WHERE queue_id = q.id AND response = 'pending'
    ORDER BY created_at DESC, id DESC
    LIMIT 1;
    RETURN v_offer;
  END IF;

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

-- 5) Rewrite sweeper to only inspect queues and move expired pending offers to timeout before retry.
CREATE OR REPLACE FUNCTION public.sweep_subscription_offers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  -- Expire stale pending offers. Lock offer rows and their queue before retrying.
  FOR r IN
    SELECT o.id, o.queue_id
    FROM public.subscription_offers o
    JOIN public.subscription_assignment_queue q ON q.id = o.queue_id
    JOIN public.bookings b ON b.id = q.booking_id
    WHERE o.response = 'pending'
      AND o.expires_at <= now()
      AND q.status NOT IN ('assigned','cancelled','failed_no_partner')
      AND b.payment_status = 'paid'
      AND b.status NOT IN ('cancelled','failed')
    ORDER BY o.expires_at ASC
    LIMIT 100
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    UPDATE public.subscription_offers
       SET response = 'timeout', responded_at = COALESCE(responded_at, now())
     WHERE id = r.id
       AND response = 'pending';

    UPDATE public.offer_delivery_events
       SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('expired_by','sweep_subscription_offers')
     WHERE offer_id = r.id
       AND stage = 'created';

    PERFORM public.offer_next_for_queue(r.queue_id);
    n := n + 1;
  END LOOP;

  -- Retry parked queues only after their backoff, never while pending/accepted/processing/offered.
  FOR r IN
    SELECT q.id
    FROM public.subscription_assignment_queue q
    JOIN public.bookings b ON b.id = q.booking_id
    WHERE q.status = 'waiting_for_partner'
      AND (q.next_retry_at IS NULL OR q.next_retry_at <= now())
      AND b.payment_status = 'paid'
      AND b.status NOT IN ('cancelled','failed')
      AND NOT EXISTS (
        SELECT 1 FROM public.subscription_offers o
        WHERE o.queue_id = q.id
          AND o.response IN ('pending','accepted')
      )
    ORDER BY q.created_at ASC
    LIMIT 50
    FOR UPDATE OF q SKIP LOCKED
  LOOP
    PERFORM public.offer_next_for_queue(r.id);
    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

-- 6) Ensure accept/decline closes or parks queues with no accidental immediate loop.
CREATE OR REPLACE FUNCTION public.respond_subscription_offer(p_offer_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_offer public.subscription_offers%ROWTYPE;
  q public.subscription_assignment_queue%ROWTYPE;
  v_assignment uuid;
  v_service_id uuid;
  v_seq int;
  v_book record;
  v_partner_name text;
  v_customer_name text;
  v_sched date;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_offer
  FROM public.subscription_offers
  WHERE id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND OR v_offer.partner_id <> v_partner THEN RAISE EXCEPTION 'Offer not found'; END IF;
  IF v_offer.response <> 'pending' THEN RAISE EXCEPTION 'Offer already %', v_offer.response; END IF;

  SELECT * INTO q FROM public.subscription_assignment_queue WHERE id = v_offer.queue_id FOR UPDATE;
  IF q.status = 'assigned' THEN RAISE EXCEPTION 'Already assigned'; END IF;

  IF NOT p_accept THEN
    UPDATE public.subscription_offers SET response='declined', responded_at=now() WHERE id = p_offer_id;
    UPDATE public.subscription_assignment_queue
      SET status='waiting_for_partner',
          current_offer_partner_id=NULL,
          offer_expires_at=NULL,
          next_retry_at=now() + interval '2 minutes',
          attempts_log = COALESCE(attempts_log, '[]'::jsonb) || jsonb_build_object('event','partner_declined','at',now(),'offer_id',p_offer_id,'partner_id',v_partner),
          updated_at=now()
      WHERE id=q.id;
    INSERT INTO public.partner_notifications(partner_id, type, category, title, body, link, metadata)
    VALUES (v_partner, 'offer_declined', 'dar', 'Lead declined',
            'You declined the Daily Shine lead in ' || COALESCE(q.area,'your area'),
            '/app/notifications', jsonb_build_object('offer_id', p_offer_id, 'queue_id', q.id))
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('ok', true, 'accepted', false);
  END IF;

  SELECT b.id AS booking_id, b.vehicle_id, b.scheduled_date, b.preferred_before_time, b.user_id, b.total_amount
    INTO v_book FROM public.bookings b WHERE b.id = q.booking_id;
  PERFORM public.ensure_ops_customer_for_booking(q.booking_id);

  SELECT id INTO v_assignment FROM public.assignments
   WHERE partner_id = v_partner AND status='active' AND end_date >= CURRENT_DATE
   ORDER BY start_date DESC LIMIT 1;

  IF v_assignment IS NULL THEN
    INSERT INTO public.assignments
      (partner_id, area, target_cars, status, rate_per_car, scheduled_date,
       duration_days, start_date, end_date, working_days, expected_start_time, estimated_earnings, estimated_hours, estimated_distance_km, search_radius_km, total_earnings)
    VALUES (v_partner, COALESCE(q.area,'Auto'), 1, 'active', 17, CURRENT_DATE, 30, CURRENT_DATE, CURRENT_DATE + 29, 26, '07:00', 17, 0.5, 0, 0, 17*26)
    RETURNING id INTO v_assignment;
  ELSE
    UPDATE public.assignments
      SET target_cars = target_cars + 1,
          total_earnings = COALESCE(total_earnings,0) + rate_per_car * 26
      WHERE id = v_assignment;
  END IF;

  v_sched := COALESCE(v_book.scheduled_date, CURRENT_DATE);

  SELECT id INTO v_service_id
    FROM public.services
   WHERE customer_id = v_book.user_id
     AND scheduled_date = v_sched
     AND status IN ('pending','in_progress','completed')
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_service_id IS NULL THEN
    SELECT COALESCE(max(sequence_no),0)+1 INTO v_seq
      FROM public.services WHERE assignment_id = v_assignment AND scheduled_date = v_sched;

    BEGIN
      INSERT INTO public.services
        (partner_id, customer_id, vehicle_id, assignment_id, scheduled_date, time_slot, sequence_no, rate_per_car, status)
      VALUES (v_partner, v_book.user_id, v_book.vehicle_id, v_assignment,
              v_sched,
              COALESCE(v_book.preferred_before_time, '07:00'),
              v_seq, 17, 'pending')
      RETURNING id INTO v_service_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_service_id
        FROM public.services
       WHERE customer_id = v_book.user_id
         AND scheduled_date = v_sched
         AND status IN ('pending','in_progress','completed')
       ORDER BY created_at ASC
       LIMIT 1;
    END;
  ELSE
    UPDATE public.services
       SET partner_id = v_partner,
           assignment_id = v_assignment,
           vehicle_id = COALESCE(vehicle_id, v_book.vehicle_id)
     WHERE id = v_service_id
       AND status = 'pending';
  END IF;

  UPDATE public.bookings
    SET ops_service_id = v_service_id, status='active', partner_id=v_partner, claimed_at=now(), updated_at=now()
    WHERE id = q.booking_id;

  UPDATE public.subscription_offers SET response='accepted', responded_at=now() WHERE id = p_offer_id;
  UPDATE public.subscription_offers SET response='superseded', responded_at = COALESCE(responded_at, now()) WHERE queue_id = q.id AND response='pending' AND id <> p_offer_id;

  UPDATE public.subscription_assignment_queue
    SET status='assigned', assigned_partner_id=v_partner, current_offer_partner_id=NULL, offer_expires_at=NULL, next_retry_at=NULL,
        attempts_log = COALESCE(attempts_log, '[]'::jsonb) || jsonb_build_object('event','accepted_closed','at',now(),'offer_id',p_offer_id,'partner_id',v_partner),
        updated_at=now()
    WHERE id = q.id;

  UPDATE public.subscriptions
    SET status='assigned', assigned_partner_id=v_partner, assigned_at=now(), service_start_date=v_sched, updated_at=now()
    WHERE booking_id = q.booking_id;

  PERFORM public.generate_services_for_queue(q.id);

  SELECT full_name INTO v_partner_name FROM public.partners WHERE id = v_partner;
  SELECT COALESCE(cp.full_name, c.full_name)
    INTO v_customer_name
    FROM public.customer_profiles cp
    FULL OUTER JOIN public.customers c ON c.id = cp.user_id
    WHERE cp.user_id = v_book.user_id OR c.id = v_book.user_id
    LIMIT 1;

  INSERT INTO public.customer_notifications(user_id, type, category, title, body, link, metadata)
  VALUES (
    v_book.user_id, 'partner_assigned', 'assignments',
    'Your Urban Wash Partner has been assigned',
    COALESCE(v_partner_name, 'Your partner') || ' will start your Daily Shine service on ' || v_sched::text || '.',
    '/c/subscriptions',
    jsonb_build_object('booking_id', q.booking_id, 'partner_id', v_partner, 'assignment_id', v_assignment, 'service_id', v_service_id)
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.partner_notifications(partner_id, type, category, title, body, link, metadata)
  VALUES (
    v_partner, 'new_assignments', 'assignments',
    'New customer added to your route',
    COALESCE(v_customer_name,'Customer') || ' • ' || COALESCE(q.area,'Area'),
    '/app/my-assignment',
    jsonb_build_object('booking_id', q.booking_id, 'assignment_id', v_assignment, 'service_id', v_service_id)
  )
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'accepted', true, 'assignment_id', v_assignment, 'service_id', v_service_id);
END;
$$;

-- 7) Trace view requested by UAT: every offer creation point and delivery state.
CREATE OR REPLACE VIEW public.v_offer_debug AS
SELECT
  b.id AS booking_id,
  b.created_at AS booking_created_at,
  b.payment_status,
  b.status AS booking_status,
  q.id AS queue_id,
  q.created_at AS queue_created_at,
  q.status AS queue_status,
  cardinality(q.tried_partner_ids) AS retry_count,
  q.next_retry_at,
  q.current_offer_partner_id,
  o.id AS offer_id,
  o.partner_id,
  o.created_at AS offer_created_at,
  o.offered_at,
  o.expires_at,
  o.response AS offer_status,
  o.responded_at,
  COALESCE(o.score_breakdown->>'created_by', 'unknown') AS created_by,
  CASE
    WHEN o.score_breakdown ? 'created_by' THEN o.score_breakdown->>'created_by'
    WHEN o.scope = 'admin_force' THEN 'admin_force_assign_queue'
    ELSE 'legacy_or_unknown'
  END AS rpc,
  pn.id AS partner_notification_id,
  pn.created_at AS partner_notification_at,
  pn.pushed_at AS partner_notification_pushed_at,
  ode.id AS offer_delivery_event_id,
  ode.stage AS push_stage,
  ode.created_at AS push_event_at,
  ode.meta AS push_meta,
  q.attempts_log
FROM public.bookings b
LEFT JOIN public.subscription_assignment_queue q ON q.booking_id = b.id
LEFT JOIN public.subscription_offers o ON o.queue_id = q.id
LEFT JOIN public.partner_notifications pn
  ON pn.type = 'daily_shine_offer'
 AND pn.metadata->>'offer_id' = o.id::text
LEFT JOIN LATERAL (
  SELECT e.*
  FROM public.offer_delivery_events e
  WHERE e.offer_id = o.id
  ORDER BY e.created_at DESC
  LIMIT 1
) ode ON true;

GRANT SELECT ON public.v_offer_debug TO authenticated;
GRANT SELECT ON public.v_offer_debug TO service_role;

-- 8) Stop existing flood immediately: expire live pending offers and park churned queues with a long backoff.
UPDATE public.subscription_offers
SET response = 'timeout', responded_at = COALESCE(responded_at, now())
WHERE response = 'pending'
  AND queue_id IN (
    SELECT queue_id
    FROM public.subscription_offers
    WHERE created_at > now() - interval '24 hours'
    GROUP BY queue_id
    HAVING count(*) > 3
  );

UPDATE public.subscription_assignment_queue q
SET status = 'waiting_for_partner',
    current_offer_partner_id = NULL,
    offer_expires_at = NULL,
    next_retry_at = now() + interval '30 minutes',
    updated_at = now(),
    attempts_log = COALESCE(attempts_log, '[]'::jsonb) || jsonb_build_object('event','p0_flood_parked','at',now())
WHERE q.id IN (
  SELECT queue_id
  FROM public.subscription_offers
  WHERE created_at > now() - interval '24 hours'
  GROUP BY queue_id
  HAVING count(*) > 3
)
AND q.status NOT IN ('assigned','cancelled','failed_no_partner');