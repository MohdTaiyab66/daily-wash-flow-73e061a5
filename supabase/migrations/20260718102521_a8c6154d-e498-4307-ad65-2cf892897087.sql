
CREATE OR REPLACE FUNCTION public.respond_subscription_offer(p_offer_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    INSERT INTO public.partner_notifications(partner_id, type, category, title, body, link, metadata)
    VALUES (v_partner, 'offer_declined', 'dar', 'Lead declined',
            'You declined the Daily Shine lead in ' || COALESCE(q.area,'your area'),
            '/app/notifications', jsonb_build_object('offer_id', p_offer_id, 'queue_id', q.id));
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
          total_earnings = COALESCE(total_earnings,0) + rate_per_car * 26
      WHERE id = v_assignment;
  END IF;

  v_sched := COALESCE(v_book.scheduled_date, CURRENT_DATE);

  -- IDEMPOTENT: if a service already exists for (customer, scheduled_date) in
  -- an active status, reuse it. The uq_services_customer_date partial unique
  -- index covers ('pending','in_progress','completed') so any of those would
  -- have blocked a duplicate insert.
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
      -- Race: another path just created it. Reuse.
      SELECT id INTO v_service_id
        FROM public.services
       WHERE customer_id = v_book.user_id
         AND scheduled_date = v_sched
         AND status IN ('pending','in_progress','completed')
       ORDER BY created_at ASC
       LIMIT 1;
    END;
  ELSE
    -- Reusing an existing service — reassign it to this partner/assignment
    -- so the accept flow's outcome is consistent.
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
  UPDATE public.subscription_offers SET response='superseded' WHERE queue_id = q.id AND response='pending' AND id <> p_offer_id;

  UPDATE public.subscription_assignment_queue
    SET status='assigned', assigned_partner_id=v_partner, current_offer_partner_id=NULL, offer_expires_at=NULL
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
  );

  INSERT INTO public.partner_notifications(partner_id, type, category, title, body, link, metadata)
  VALUES (
    v_partner, 'new_assignments', 'assignments',
    'New customer added to your route',
    COALESCE(v_customer_name,'Customer') || ' • ' || COALESCE(q.area,'Area'),
    '/app/my-assignment',
    jsonb_build_object('booking_id', q.booking_id, 'assignment_id', v_assignment, 'service_id', v_service_id)
  );

  RETURN jsonb_build_object('ok', true, 'accepted', true, 'assignment_id', v_assignment, 'service_id', v_service_id);
END $function$;

GRANT EXECUTE ON FUNCTION public.respond_subscription_offer(uuid, boolean) TO authenticated;
