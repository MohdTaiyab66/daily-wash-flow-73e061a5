-- 1. Allow the two customer-facing lifecycle notifications requested by product.
CREATE OR REPLACE FUNCTION public.tg_block_forbidden_customer_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.type IN (
    'eta_updated','route_updated','partner_changed','sequence_changed',
    'route_optimized','traffic_update','offer_sent','queue_assigned',
    'service_assigned','service_en_route'
  ) THEN
    RAISE EXCEPTION
      'customer_notifications.type=% is forbidden by product policy.', NEW.type;
  END IF;
  RETURN NEW;
END $$;

-- 2. Generate the accepted customer's route stops on the winning partner's assignment.
CREATE OR REPLACE FUNCTION public.mp_generate_services_for_broadcast(p_broadcast_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record; v_sub record; v_a record;
  v_partner uuid; v_customer uuid; v_vehicle uuid; v_pref text;
  v_area text; v_rate numeric; v_start date; v_end date; v_off int := 1;
  work_day date; v_seq int; v_inserted int := 0; v_covered boolean;
BEGIN
  SELECT * INTO b FROM public.marketplace_broadcasts WHERE id = p_broadcast_id;
  IF NOT FOUND OR b.winning_partner_id IS NULL THEN RETURN 0; END IF;
  v_partner := b.winning_partner_id;

  SELECT * INTO v_sub FROM public.subscriptions WHERE id = b.subscription_id;

  SELECT COALESCE(bk.user_id, b.customer_id), COALESCE(bk.vehicle_id, b.vehicle_id),
         COALESCE(bk.preferred_before_time, NULL)
    INTO v_customer, v_vehicle, v_pref
  FROM public.bookings bk WHERE bk.id = b.booking_id;

  IF v_customer IS NULL THEN
    v_customer := b.customer_id;
    v_vehicle  := b.vehicle_id;
  END IF;
  IF v_pref IS NULL THEN
    SELECT preferred_time INTO v_pref FROM public.customers WHERE id = v_customer;
  END IF;
  IF v_customer IS NULL OR v_vehicle IS NULL THEN RETURN 0; END IF;

  SELECT * INTO v_a FROM public.assignments
   WHERE partner_id = v_partner AND status = 'active' AND end_date >= CURRENT_DATE
   ORDER BY start_date DESC LIMIT 1;

  IF NOT FOUND THEN
    SELECT COALESCE(NULLIF(trim(home_area), ''), 'Unassigned') INTO v_area
      FROM public.partners WHERE id = v_partner;
    SELECT COALESCE((value::text)::numeric, 17) INTO v_rate
      FROM public.platform_settings WHERE key = 'rate_per_car';
    v_rate := COALESCE(v_rate, 17);
    v_start := CURRENT_DATE;
    v_end := COALESCE(v_sub.renewal_date, CURRENT_DATE + 29);
    IF v_end < v_start THEN v_end := v_start + 29; END IF;

    INSERT INTO public.assignments (
      partner_id, area, target_cars, status, rate_per_car,
      estimated_earnings, estimated_hours, estimated_distance_km,
      start_date, end_date, duration_days, scheduled_date, accepted_at
    ) VALUES (
      v_partner, COALESCE(v_area, 'Unassigned'), 1, 'active', v_rate,
      0, 0, 0, v_start, v_end, (v_end - v_start) + 1, v_start, now()
    ) RETURNING * INTO v_a;
  END IF;

  v_rate := v_a.rate_per_car;
  v_start := GREATEST(CURRENT_DATE, v_a.start_date);
  v_end := v_a.end_date;

  FOR work_day IN SELECT generate_series(v_start, v_end, interval '1 day')::date LOOP
    IF extract(dow FROM work_day)::int = v_off THEN CONTINUE; END IF;
    SELECT COALESCE(max(sequence_no), 0) + 1 INTO v_seq
      FROM public.services WHERE assignment_id = v_a.id AND scheduled_date = work_day;
    v_covered := public.customer_has_pro_booking_on(v_customer, work_day);
    BEGIN
      INSERT INTO public.services (
        partner_id, customer_id, vehicle_id, assignment_id, scheduled_date,
        time_slot, sequence_no, rate_per_car, status, delay_reason
      ) VALUES (
        v_partner, v_customer, v_vehicle, v_a.id, work_day,
        COALESCE(v_pref, '06:00 - 09:00'), v_seq,
        CASE WHEN v_covered THEN 0 ELSE v_rate END,
        (CASE WHEN v_covered THEN 'covered_by_booking' ELSE 'pending' END)::public.service_status,
        CASE WHEN v_covered THEN 'covered_by_booking'::text ELSE NULL::text END
      );
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END LOOP;

  UPDATE public.assignments a
     SET working_days = GREATEST(1, (
           SELECT count(DISTINCT s.scheduled_date) FROM public.services s WHERE s.assignment_id = a.id)),
         fulfilled_cars = (
           SELECT count(DISTINCT s.customer_id) FROM public.services s WHERE s.assignment_id = a.id),
         target_cars = GREATEST(a.target_cars, (
           SELECT count(DISTINCT s.customer_id) FROM public.services s WHERE s.assignment_id = a.id)),
         total_earnings = COALESCE((
           SELECT sum(s.rate_per_car) FROM public.services s WHERE s.assignment_id = a.id), 0)
   WHERE a.id = v_a.id;

  UPDATE public.marketplace_broadcasts SET assignment_id = v_a.id WHERE id = p_broadcast_id;

  UPDATE public.subscription_assignment_queue
     SET assigned_partner_id = v_partner,
         locked_partner_id = v_partner,
         lock_until = v_a.end_date,
         status = 'assigned',
         updated_at = now()
   WHERE booking_id = b.booking_id;

  -- Tell the partner app to refresh its route immediately.
  INSERT INTO public.partner_notifications (partner_id, type, title, body, link, category, metadata)
  VALUES (
    v_partner, 'route_updated', 'New customer added to your route',
    'A customer you accepted has been added to your route.',
    '/app/live', 'assignment',
    jsonb_build_object('broadcast_id', p_broadcast_id, 'assignment_id', v_a.id, 'services_created', v_inserted)
  );

  RETURN v_inserted;
END $$;

GRANT EXECUTE ON FUNCTION public.mp_generate_services_for_broadcast(uuid) TO authenticated, service_role;

-- 3. Wire generation + customer "accepted" notification into the accept path.
CREATE OR REPLACE FUNCTION public.mp_accept_offer_legacy_impl(p_broadcast_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- Route stops for the accepted customer (creates an assignment if needed).
  v_created := public.mp_generate_services_for_broadcast(p_broadcast_id);
  SELECT assignment_id INTO v_assign FROM public.marketplace_broadcasts WHERE id = p_broadcast_id;

  SELECT COALESCE(full_name, 'Your Urban Wash Partner') INTO v_partner_name
    FROM public.partners WHERE id = v_partner;

  INSERT INTO public.customer_notifications (user_id, type, title, body, link, vehicle_id, category, metadata)
  VALUES (
    v_bcast.customer_id, 'partner_accepted', 'Partner assigned',
    COALESCE(v_partner_name, 'Your partner') || ' accepted your service.',
    '/c/home', v_bcast.vehicle_id, 'daily_shine',
    jsonb_build_object('broadcast_id', p_broadcast_id, 'partner_id', v_partner, 'subscription_id', v_bcast.subscription_id)
  );

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
END $$;

-- 4. Customer gets a "service started" notification too.
CREATE OR REPLACE FUNCTION public.tg_notify_customer_service_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  v_user_id := public._resolve_user_id_for_customer(NEW.customer_id);
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.status = 'in_progress' AND COALESCE(OLD.status::text, '') <> 'in_progress' THEN
    INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
    VALUES (v_user_id, 'service_started', 'Your service has started',
            'Your service has started.', '/c/subscriptions',
            jsonb_build_object('service_id', NEW.id));
  END IF;

  IF NEW.status = 'completed' AND COALESCE(OLD.status::text, '') <> 'completed' THEN
    INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
    VALUES (v_user_id, 'service_completed', 'Your service has been completed',
            'Your service has been completed. Tap to see today''s photos and details.',
            '/c/subscriptions', jsonb_build_object('service_id', NEW.id));
  END IF;

  RETURN NEW;
END $$;