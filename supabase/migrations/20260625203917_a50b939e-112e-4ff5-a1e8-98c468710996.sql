
-- Admin marketplace operations: cancel queue, retry queue, force-assign to a chosen partner.

CREATE OR REPLACE FUNCTION public.admin_cancel_queue(p_queue_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q public.subscription_assignment_queue%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT * INTO q FROM public.subscription_assignment_queue WHERE id = p_queue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Queue not found'; END IF;
  IF q.status = 'assigned' THEN RAISE EXCEPTION 'Already assigned — cancel the assignment instead'; END IF;

  UPDATE public.subscription_offers
    SET response = 'superseded', responded_at = now()
    WHERE queue_id = p_queue_id AND response = 'pending';

  UPDATE public.subscription_assignment_queue
    SET status = 'cancelled',
        current_offer_partner_id = NULL,
        offer_expires_at = NULL,
        attempts_log = COALESCE(attempts_log, '[]'::jsonb) || jsonb_build_object(
          'event', 'admin_cancel', 'at', now(), 'by', auth.uid(), 'reason', p_reason),
        updated_at = now()
    WHERE id = p_queue_id;

  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.admin_retry_queue(p_queue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;

  UPDATE public.subscription_offers
    SET response = 'superseded', responded_at = now()
    WHERE queue_id = p_queue_id AND response = 'pending';

  UPDATE public.subscription_assignment_queue
    SET status = 'awaiting',
        current_offer_partner_id = NULL,
        offer_expires_at = NULL,
        tried_partner_ids = '{}',
        radius_km = 2,
        attempts_log = COALESCE(attempts_log, '[]'::jsonb) || jsonb_build_object(
          'event', 'admin_retry', 'at', now(), 'by', auth.uid()),
        updated_at = now()
    WHERE id = p_queue_id;

  v_offer := public.offer_next_for_queue(p_queue_id);
  RETURN jsonb_build_object('ok', true, 'offer_id', v_offer);
END $$;

CREATE OR REPLACE FUNCTION public.admin_force_assign_queue(p_queue_id uuid, p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q public.subscription_assignment_queue%ROWTYPE;
  v_book record;
  v_assignment uuid;
  v_service_id uuid;
  v_seq int;
  v_partner_name text;
  v_offer uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT * INTO q FROM public.subscription_assignment_queue WHERE id = p_queue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Queue not found'; END IF;
  IF q.status = 'assigned' THEN RAISE EXCEPTION 'Already assigned'; END IF;
  IF q.status = 'cancelled' THEN RAISE EXCEPTION 'Queue cancelled'; END IF;

  SELECT b.id AS booking_id, b.vehicle_id, b.scheduled_date, b.preferred_before_time, b.user_id, b.total_amount
    INTO v_book FROM public.bookings b WHERE b.id = q.booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;

  PERFORM public.ensure_ops_customer_for_booking(q.booking_id);

  SELECT id INTO v_assignment FROM public.assignments
   WHERE partner_id = p_partner_id AND status='active' AND end_date >= CURRENT_DATE
   ORDER BY start_date DESC LIMIT 1;

  IF v_assignment IS NULL THEN
    INSERT INTO public.assignments
      (partner_id, area, target_cars, status, rate_per_car, scheduled_date,
       duration_days, start_date, end_date, working_days, expected_start_time,
       estimated_earnings, estimated_hours, estimated_distance_km, search_radius_km, total_earnings)
    VALUES (p_partner_id, COALESCE(q.area,'Auto'), 1, 'active', 17, CURRENT_DATE,
            30, CURRENT_DATE, CURRENT_DATE + 29, 26, '07:00', 17, 0.5, 0, 0, 17*26)
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
  VALUES (p_partner_id, v_book.user_id, v_book.vehicle_id, v_assignment,
          COALESCE(v_book.scheduled_date, CURRENT_DATE),
          COALESCE(v_book.preferred_before_time, '07:00'),
          v_seq, 17, 'pending')
  RETURNING id INTO v_service_id;

  UPDATE public.bookings
    SET ops_service_id = v_service_id, status='active', partner_id=p_partner_id, claimed_at=now(), updated_at=now()
    WHERE id = q.booking_id;

  -- Record forced offer for history
  INSERT INTO public.subscription_offers(queue_id, partner_id, scope, expires_at, response, responded_at, score_breakdown)
  VALUES (p_queue_id, p_partner_id, 'admin_force', now(), 'accepted', now(), jsonb_build_object('forced_by', auth.uid()))
  RETURNING id INTO v_offer;

  UPDATE public.subscription_offers SET response='superseded' WHERE queue_id = q.id AND response='pending' AND id <> v_offer;

  UPDATE public.subscription_assignment_queue
    SET status='assigned', assigned_partner_id=p_partner_id, current_offer_partner_id=NULL, offer_expires_at=NULL,
        attempts_log = COALESCE(attempts_log, '[]'::jsonb) || jsonb_build_object(
          'event','admin_force_assign','at',now(),'by',auth.uid(),'partner_id',p_partner_id),
        updated_at = now()
    WHERE id = q.id;

  UPDATE public.subscriptions
    SET status='assigned', assigned_partner_id=p_partner_id, assigned_at=now(),
        service_start_date=COALESCE(v_book.scheduled_date, CURRENT_DATE), updated_at=now()
    WHERE booking_id = q.booking_id;

  SELECT full_name INTO v_partner_name FROM public.partners WHERE id = p_partner_id;
  INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
  VALUES (v_book.user_id, 'partner_assigned',
          'Your Urban Wash Partner has been assigned',
          COALESCE(v_partner_name, 'Your partner') || ' will start your Daily Shine service on ' || COALESCE(v_book.scheduled_date, CURRENT_DATE)::text || '.',
          '/c/subscriptions',
          jsonb_build_object('booking_id', q.booking_id, 'partner_id', p_partner_id, 'assignment_id', v_assignment, 'service_id', v_service_id, 'forced', true));

  RETURN jsonb_build_object('ok', true, 'service_id', v_service_id, 'assignment_id', v_assignment, 'offer_id', v_offer);
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_cancel_queue(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_retry_queue(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_force_assign_queue(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_queue(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_retry_queue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_force_assign_queue(uuid, uuid) TO authenticated;
