
-- =========================================================================
-- Daily Shine: persistent assignments, per-day route generation, visibility
-- =========================================================================

-- 1. Columns on assignments
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS route_visibility_hours integer,
  ADD COLUMN IF NOT EXISTS hours_per_day numeric,
  ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT false;

-- 2. Default platform settings for the new admin controls
INSERT INTO public.platform_settings (key, value)
VALUES
  ('route_visibility_hours', to_jsonb(6)),
  ('assignment_min_days', to_jsonb(7)),
  ('assignment_max_days', to_jsonb(90)),
  ('assignment_default_days', to_jsonb(30)),
  ('assignment_hours_options', '[2,3,4,5,6]'::jsonb),
  ('assignment_auto_renew_allowed', to_jsonb(false))
ON CONFLICT (key) DO NOTHING;

-- 3. Compute route visibility for a partner (today's route unlock time)
CREATE OR REPLACE FUNCTION public.get_route_visibility(p_partner uuid)
RETURNS TABLE(visible boolean, unlock_at timestamptz, shift_start text, assignment_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a public.assignments%ROWTYPE;
  v_hours int;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_shift_ts timestamptz;
  v_unlock timestamptz;
BEGIN
  SELECT * INTO v_a
  FROM public.assignments
  WHERE partner_id = p_partner
    AND status = 'active'
    AND start_date <= v_today
    AND end_date >= v_today
  ORDER BY start_date DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::timestamptz, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  v_hours := COALESCE(v_a.route_visibility_hours,
    (SELECT (value::text)::int FROM public.platform_settings WHERE key='route_visibility_hours'),
    6);

  v_shift_ts := ((v_today::text || ' ' || COALESCE(v_a.expected_start_time,'07:00'))::timestamp
                AT TIME ZONE 'Asia/Kolkata');
  v_unlock := v_shift_ts - (v_hours || ' hours')::interval;

  RETURN QUERY SELECT (now() >= v_unlock), v_unlock, v_a.expected_start_time, v_a.id;
END $$;

GRANT EXECUTE ON FUNCTION public.get_route_visibility(uuid) TO authenticated, service_role;

-- 4. Materialise per-day services for a subscription queue row that has been
--    accepted (locked) to a partner. Idempotent thanks to the existing partial
--    unique index on services(customer_id, scheduled_date).
CREATE OR REPLACE FUNCTION public.generate_services_for_queue(p_queue_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q public.subscription_assignment_queue%ROWTYPE;
  v_a public.assignments%ROWTYPE;
  v_book record;
  v_day date;
  v_dow int;
  v_off int;
  v_off_name text;
  v_slot text;
  v_seq int;
  v_inserted int := 0;
  v_today date := CURRENT_DATE;
BEGIN
  SELECT * INTO q FROM public.subscription_assignment_queue WHERE id = p_queue_id;
  IF NOT FOUND OR q.status <> 'assigned' OR q.assigned_partner_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_a FROM public.assignments
   WHERE partner_id = q.assigned_partner_id
     AND status = 'active'
     AND end_date >= v_today
   ORDER BY start_date DESC LIMIT 1;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT b.id AS booking_id, b.vehicle_id, b.preferred_before_time, b.user_id
    INTO v_book FROM public.bookings b WHERE b.id = q.booking_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Weekly off (default Monday=1)
  SELECT lower(value::text) INTO v_off_name FROM public.platform_settings WHERE key='weekly_off_day';
  v_off := CASE trim(both '"' from COALESCE(v_off_name,'"monday"'))
    WHEN 'sunday' THEN 0 WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2
    WHEN 'wednesday' THEN 3 WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5
    WHEN 'saturday' THEN 6 ELSE 1 END;

  v_slot := COALESCE(v_book.preferred_before_time, '06:00 - 09:00');

  FOR v_day IN
    SELECT d::date FROM generate_series(GREATEST(v_a.start_date, v_today), v_a.end_date, interval '1 day') d
  LOOP
    v_dow := extract(dow FROM v_day)::int;
    IF v_dow = v_off THEN CONTINUE; END IF;

    SELECT COALESCE(max(sequence_no),0)+1 INTO v_seq
      FROM public.services WHERE assignment_id = v_a.id AND scheduled_date = v_day;

    BEGIN
      INSERT INTO public.services
        (partner_id, customer_id, vehicle_id, assignment_id, scheduled_date, time_slot, sequence_no, rate_per_car, status)
      VALUES
        (q.assigned_partner_id, v_book.user_id, v_book.vehicle_id, v_a.id,
         v_day, v_slot, v_seq, v_a.rate_per_car, 'pending');
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN unique_violation THEN
      -- already scheduled for this customer/day, skip
      NULL;
    END;
  END LOOP;

  -- Lock the queue row for the whole assignment window so future offer sweeps
  -- do not re-offer this customer.
  UPDATE public.subscription_assignment_queue
     SET locked_partner_id = q.assigned_partner_id,
         lock_until = v_a.end_date
   WHERE id = q.id;

  RETURN v_inserted;
END $$;

GRANT EXECUTE ON FUNCTION public.generate_services_for_queue(uuid) TO authenticated, service_role;

-- 5. Update respond_subscription_offer to materialise the full period on accept
--    (keeps the existing single-day insert for today so behaviour is compatible,
--    but also generates the remaining working days).
CREATE OR REPLACE FUNCTION public.respond_subscription_offer(p_offer_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_offer FROM public.subscription_offers WHERE id = p_offer_id;
  IF NOT FOUND OR v_offer.partner_id <> v_partner THEN RAISE EXCEPTION 'Offer not found'; END IF;
  IF v_offer.response <> 'pending' THEN RAISE EXCEPTION 'Offer already %', v_offer.response; END IF;

  SELECT * INTO q FROM public.subscription_assignment_queue WHERE id = v_offer.queue_id FOR UPDATE;
  IF q.status = 'assigned' THEN RAISE EXCEPTION 'Already assigned'; END IF;

  IF NOT p_accept THEN
    UPDATE public.subscription_offers SET response='declined', responded_at=now() WHERE id = p_offer_id;
    UPDATE public.subscription_assignment_queue
      SET status='awaiting', current_offer_partner_id=NULL, offer_expires_at=NULL
      WHERE id=q.id;
    PERFORM public.offer_next_for_queue(q.id);
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
          total_earnings = COALESCE(total_earnings, 0) + (17 * 26),
          estimated_earnings = COALESCE(estimated_earnings, 0) + 17
      WHERE id = v_assignment;
  END IF;

  SELECT COALESCE(max(sequence_no),0)+1 INTO v_seq
    FROM public.services WHERE assignment_id = v_assignment AND scheduled_date = COALESCE(v_book.scheduled_date, CURRENT_DATE);

  INSERT INTO public.services
    (partner_id, customer_id, vehicle_id, assignment_id, scheduled_date, time_slot, sequence_no, rate_per_car, status)
  VALUES (v_partner, v_book.user_id, v_book.vehicle_id, v_assignment,
          COALESCE(v_book.scheduled_date, CURRENT_DATE),
          COALESCE(v_book.preferred_before_time, '07:00'),
          v_seq, 17, 'pending')
  RETURNING id INTO v_service_id;

  UPDATE public.bookings
    SET ops_service_id = v_service_id, status='active', partner_id=v_partner, claimed_at=now(), updated_at=now()
    WHERE id = q.booking_id;

  UPDATE public.subscription_offers SET response='accepted', responded_at=now() WHERE id = p_offer_id;
  UPDATE public.subscription_offers SET response='superseded' WHERE queue_id = q.id AND response='pending' AND id <> p_offer_id;

  UPDATE public.subscription_assignment_queue
    SET status='assigned', assigned_partner_id=v_partner, current_offer_partner_id=NULL, offer_expires_at=NULL
    WHERE id = q.id;

  UPDATE public.subscriptions
    SET status='assigned', assigned_partner_id=v_partner, assigned_at=now(), service_start_date=COALESCE(v_book.scheduled_date, CURRENT_DATE), updated_at=now()
    WHERE booking_id = q.booking_id;

  -- Persistent recurring materialisation for the whole assignment window
  PERFORM public.generate_services_for_queue(q.id);

  SELECT full_name INTO v_partner_name FROM public.partners WHERE id = v_partner;
  INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
  VALUES (
    v_book.user_id,
    'partner_assigned',
    'Your Urban Wash Partner has been assigned',
    COALESCE(v_partner_name, 'Your partner') || ' will start your Daily Shine service on ' || COALESCE(v_book.scheduled_date, CURRENT_DATE)::text || '.',
    '/c/subscriptions',
    jsonb_build_object('booking_id', q.booking_id, 'partner_id', v_partner, 'assignment_id', v_assignment, 'service_id', v_service_id)
  );

  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY time_slot NULLS LAST, created_at) AS rn
    FROM public.services WHERE assignment_id = v_assignment AND scheduled_date = COALESCE(v_book.scheduled_date, CURRENT_DATE)
  )
  UPDATE public.services s SET sequence_no = ranked.rn FROM ranked WHERE s.id = ranked.id;

  RETURN jsonb_build_object('ok', true, 'accepted', true, 'service_id', v_service_id, 'assignment_id', v_assignment);
END $$;

-- 6. Skip already-locked queue rows in the offer picker.
CREATE OR REPLACE FUNCTION public.offer_next_for_queue(p_queue_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF NOT FOUND OR q.status IN ('assigned','failed') THEN RETURN NULL; END IF;

  -- NEW: never re-offer a queue row that is still locked to a partner.
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
      SET status = 'failed', current_offer_partner_id = NULL, offer_expires_at = NULL
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
        tried_partner_ids = array_append(tried_partner_ids, v_pick.partner_id)
    WHERE id = p_queue_id;

  INSERT INTO public.partner_notifications(partner_id, type, title, body, link, metadata)
  VALUES (v_pick.partner_id, 'daily_shine_offer',
          'New Daily Shine Customer Available',
          'Area ' || COALESCE(q.area,'(nearby)') || ' · +' || round((v_pick.route_delta_sec/60.0)::numeric,0) || ' min route impact · +₹' || (v_rate*30)::int || '/mo',
          '/app/assignments',
          jsonb_build_object('queue_id', p_queue_id, 'offer_id', v_offer, 'booking_id', q.booking_id));

  RETURN v_offer;
END $$;

-- 7. Back-fill: existing assigned queue rows get locked to their partner for the
--    duration of the covering active assignment, and services are materialised
--    for the remaining window so the partner sees them every day.
DO $$
DECLARE r record; BEGIN
  FOR r IN
    SELECT q.id
    FROM public.subscription_assignment_queue q
    WHERE q.status = 'assigned'
      AND q.assigned_partner_id IS NOT NULL
      AND (q.lock_until IS NULL OR q.lock_until < CURRENT_DATE)
  LOOP
    PERFORM public.generate_services_for_queue(r.id);
  END LOOP;
END $$;

-- 8. Daily generator: for every active assignment, re-materialise today's stops
--    for every locked queue row. Idempotent.
CREATE OR REPLACE FUNCTION public.generate_daily_routes(p_date date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record; v_count int := 0; BEGIN
  FOR r IN
    SELECT q.id
    FROM public.subscription_assignment_queue q
    JOIN public.assignments a
      ON a.partner_id = q.assigned_partner_id
     AND a.status = 'active'
     AND p_date BETWEEN a.start_date AND a.end_date
    WHERE q.status = 'assigned'
      AND q.locked_partner_id IS NOT NULL
      AND q.lock_until >= p_date
  LOOP
    v_count := v_count + public.generate_services_for_queue(r.id);
  END LOOP;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.generate_daily_routes(date) TO service_role;
