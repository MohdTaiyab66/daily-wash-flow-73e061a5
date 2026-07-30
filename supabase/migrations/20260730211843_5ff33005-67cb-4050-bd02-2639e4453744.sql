CREATE OR REPLACE FUNCTION public.mp_generate_services_for_broadcast(p_broadcast_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record; v_sub record; v_a record; s record;
  v_partner uuid; v_customer uuid; v_vehicle uuid; v_pref text;
  v_area text; v_rate numeric; v_start date; v_end date; v_off int := 1;
  work_day date; v_seq int; v_inserted int := 0; v_moved int := 0; v_covered boolean;
BEGIN
  SELECT * INTO b FROM public.marketplace_broadcasts WHERE id = p_broadcast_id;
  IF NOT FOUND OR b.winning_partner_id IS NULL THEN RETURN 0; END IF;
  v_partner := b.winning_partner_id;

  SELECT * INTO v_sub FROM public.subscriptions WHERE id = b.subscription_id;

  SELECT COALESCE(bk.user_id, b.customer_id), COALESCE(bk.vehicle_id, b.vehicle_id), bk.preferred_before_time
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

  -- Ownership transfer: upcoming, not-yet-started stops that still belong to a
  -- previous partner move onto the accepting partner's assignment.
  FOR s IN
    SELECT id, scheduled_date FROM public.services
     WHERE customer_id = v_customer
       AND scheduled_date BETWEEN v_start AND v_end
       AND status = 'pending'
       AND started_at IS NULL
       AND (partner_id IS DISTINCT FROM v_partner OR assignment_id IS DISTINCT FROM v_a.id)
     ORDER BY scheduled_date
  LOOP
    SELECT COALESCE(max(sequence_no), 0) + 1 INTO v_seq
      FROM public.services WHERE assignment_id = v_a.id AND scheduled_date = s.scheduled_date;
    BEGIN
      UPDATE public.services
         SET partner_id = v_partner, assignment_id = v_a.id,
             vehicle_id = COALESCE(vehicle_id, v_vehicle),
             sequence_no = v_seq, rate_per_car = v_rate, updated_at = now()
       WHERE id = s.id;
      v_moved := v_moved + 1;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END LOOP;

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
           SELECT count(DISTINCT s2.scheduled_date) FROM public.services s2 WHERE s2.assignment_id = a.id)),
         fulfilled_cars = (
           SELECT count(DISTINCT s2.customer_id) FROM public.services s2 WHERE s2.assignment_id = a.id),
         target_cars = GREATEST(a.target_cars, (
           SELECT count(DISTINCT s2.customer_id) FROM public.services s2 WHERE s2.assignment_id = a.id)),
         total_earnings = COALESCE((
           SELECT sum(s2.rate_per_car) FROM public.services s2 WHERE s2.assignment_id = a.id), 0)
   WHERE a.id = v_a.id;

  UPDATE public.marketplace_broadcasts SET assignment_id = v_a.id WHERE id = p_broadcast_id;

  UPDATE public.subscription_assignment_queue
     SET assigned_partner_id = v_partner,
         locked_partner_id = v_partner,
         lock_until = v_a.end_date,
         status = 'assigned',
         updated_at = now()
   WHERE booking_id = b.booking_id;

  INSERT INTO public.partner_notifications (partner_id, type, title, body, link, category, metadata)
  VALUES (
    v_partner, 'route_updated', 'New customer added to your route',
    'A customer you accepted has been added to your route.',
    '/app/live', 'assignment',
    jsonb_build_object('broadcast_id', p_broadcast_id, 'assignment_id', v_a.id,
                       'services_created', v_inserted, 'services_moved', v_moved)
  );

  RETURN v_inserted + v_moved;
END $$;

GRANT EXECUTE ON FUNCTION public.mp_generate_services_for_broadcast(uuid) TO authenticated, service_role;