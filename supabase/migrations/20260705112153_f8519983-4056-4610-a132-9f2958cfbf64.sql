
-- 1) Enforce one-service-per-vehicle-per-day within an assignment.
--    First, dedupe any legacy rows that would collide, keeping the oldest.
DELETE FROM public.services s USING public.services k
WHERE s.assignment_id IS NOT NULL
  AND s.assignment_id = k.assignment_id
  AND s.vehicle_id    = k.vehicle_id
  AND s.scheduled_date = k.scheduled_date
  AND s.created_at > k.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS services_assignment_vehicle_date_uniq
  ON public.services (assignment_id, vehicle_id, scheduled_date)
  WHERE assignment_id IS NOT NULL;

-- 2) Safety-net trigger: keep subscriptions + queue in sync with whatever
--    partner is actually servicing a vehicle. Any code path that inserts a
--    service (manual admin assign, DAR reassign, daily generator) now
--    automatically flips the subscription to active+assigned_partner_id
--    and clears the marketplace queue row for that vehicle.
CREATE OR REPLACE FUNCTION public.tg_sync_subscription_from_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub record;
BEGIN
  IF NEW.partner_id IS NULL OR NEW.vehicle_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, booking_id, assigned_partner_id, status
    INTO v_sub
  FROM public.subscriptions
  WHERE vehicle_id = NEW.vehicle_id
    AND status IN ('active','awaiting_partner_assignment','assigned')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_sub.id IS NOT NULL THEN
    UPDATE public.subscriptions
       SET assigned_partner_id = NEW.partner_id,
           assigned_at = COALESCE(assigned_at, now()),
           service_start_date = COALESCE(service_start_date, NEW.scheduled_date),
           status = 'active',
           updated_at = now()
     WHERE id = v_sub.id
       AND (assigned_partner_id IS DISTINCT FROM NEW.partner_id
            OR status <> 'active');

    UPDATE public.subscription_assignment_queue
       SET assigned_partner_id = NEW.partner_id,
           status = 'assigned',
           updated_at = now()
     WHERE booking_id = v_sub.booking_id
       AND (status IN ('awaiting','failed','offered')
            OR assigned_partner_id IS DISTINCT FROM NEW.partner_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_subscription_from_service ON public.services;
CREATE TRIGGER trg_sync_subscription_from_service
AFTER INSERT OR UPDATE OF partner_id, vehicle_id ON public.services
FOR EACH ROW
EXECUTE FUNCTION public.tg_sync_subscription_from_service();

-- 3) Rewrite admin_create_manual_assignment so it iterates every SUBSCRIBED
--    vehicle per customer (not just the oldest), and dedupes per vehicle.
CREATE OR REPLACE FUNCTION public.admin_create_manual_assignment(
  p_partner_id uuid,
  p_customer_ids uuid[],
  p_duration integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_assignment uuid;
  v_start date := CURRENT_DATE;
  v_end date;
  v_partner_area text;
  v_rate numeric := 17;
  v_count int;
  v_reserved int;
  v_working_days int;
  v_total_stops int;
  r record;
  work_day date;
  seq int;
BEGIN
  IF p_partner_id IS NULL THEN RAISE EXCEPTION 'Partner required'; END IF;
  IF p_customer_ids IS NULL OR array_length(p_customer_ids,1) IS NULL THEN
    RAISE EXCEPTION 'Select at least one customer';
  END IF;
  IF p_duration < 1 OR p_duration > 60 THEN
    RAISE EXCEPTION 'Duration must be 1-60 days';
  END IF;

  SELECT home_area INTO v_partner_area FROM public.partners WHERE id = p_partner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partner not found'; END IF;

  -- Reject if any selected customer has any vehicle actively serviced by another partner.
  SELECT count(DISTINCT s.customer_id) INTO v_reserved
  FROM public.assignments a
  JOIN public.services s ON s.assignment_id = a.id
  WHERE a.status = 'active'
    AND a.end_date >= CURRENT_DATE
    AND s.customer_id = ANY(p_customer_ids)
    AND a.partner_id <> p_partner_id;
  IF v_reserved > 0 THEN
    RAISE EXCEPTION '% selected customer(s) are already assigned to another partner', v_reserved;
  END IF;

  -- Reuse an existing active assignment for this partner if one exists.
  SELECT id, start_date, end_date, rate_per_car
    INTO v_assignment, v_start, v_end, v_rate
  FROM public.assignments
  WHERE partner_id = p_partner_id
    AND status = 'active'
    AND end_date >= CURRENT_DATE
  ORDER BY start_date DESC
  LIMIT 1;

  v_rate := COALESCE(v_rate, 17);
  v_start := COALESCE(v_start, CURRENT_DATE);

  -- Count DISTINCT (customer, vehicle) pairs that will be serviced —
  -- one stop per vehicle. Only vehicles with an active subscription qualify.
  SELECT count(*) INTO v_count
  FROM public.customers c
  JOIN public.vehicles v ON v.customer_id = c.id
  JOIN public.subscriptions sub
    ON sub.vehicle_id = v.id
   AND sub.status IN ('active','awaiting_partner_assignment','assigned')
  WHERE c.id = ANY(p_customer_ids)
    AND c.is_active = true;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'No active customers with subscribed vehicles selected';
  END IF;

  IF v_assignment IS NULL THEN
    v_start := CURRENT_DATE;
    v_end := v_start + (p_duration - 1);
    SELECT count(*) INTO v_working_days
    FROM generate_series(v_start, v_end, interval '1 day') g
    WHERE extract(dow FROM g) <> 1;

    INSERT INTO public.assignments (
      partner_id, area, target_cars, status, rate_per_car, estimated_earnings,
      estimated_hours, estimated_distance_km, search_radius_km, scheduled_date,
      duration_days, start_date, end_date, working_days, expected_start_time, total_earnings
    ) VALUES (
      p_partner_id, COALESCE(NULLIF(v_partner_area, ''), 'Manual'), v_count, 'active', v_rate,
      v_count * v_rate, GREATEST(round((v_count * 0.15)::numeric,1), 1.0), 0, 0,
      v_start, p_duration, v_start, v_end, v_working_days, '07:00', v_count * v_rate * v_working_days
    ) RETURNING id INTO v_assignment;
  ELSE
    IF v_start < CURRENT_DATE THEN v_start := CURRENT_DATE; END IF;
    SELECT working_days INTO v_working_days FROM public.assignments WHERE id = v_assignment;
  END IF;

  -- Insert one service per (customer, subscribed vehicle) per working day.
  FOR work_day IN SELECT generate_series(v_start, v_end, interval '1 day')::date LOOP
    IF extract(dow FROM work_day) = 1 THEN CONTINUE; END IF;

    SELECT COALESCE(max(sequence_no), 0) INTO seq
    FROM public.services
    WHERE assignment_id = v_assignment
      AND scheduled_date = work_day;

    FOR r IN
      SELECT c.id AS customer_id,
             v.id AS vehicle_id,
             COALESCE(c.service_required_before, c.preferred_time, '06:00') AS preferred_time
      FROM public.customers c
      JOIN public.vehicles v ON v.customer_id = c.id
      JOIN public.subscriptions sub
        ON sub.vehicle_id = v.id
       AND sub.status IN ('active','awaiting_partner_assignment','assigned')
      WHERE c.id = ANY(p_customer_ids)
        AND c.is_active = true
      ORDER BY c.id, v.created_at ASC
    LOOP
      -- Vehicle-level dedupe (was customer-level → merged vehicles).
      IF EXISTS (
        SELECT 1 FROM public.services
        WHERE assignment_id = v_assignment
          AND vehicle_id = r.vehicle_id
          AND scheduled_date = work_day
      ) THEN
        CONTINUE;
      END IF;

      seq := seq + 1;
      INSERT INTO public.services (
        partner_id, customer_id, vehicle_id, assignment_id, scheduled_date,
        time_slot, sequence_no, rate_per_car, status
      ) VALUES (
        p_partner_id, r.customer_id, r.vehicle_id, v_assignment, work_day,
        r.preferred_time, seq, v_rate, 'pending'
      );
      -- Subscription + queue auto-sync via trg_sync_subscription_from_service.
    END LOOP;
  END LOOP;

  SELECT count(*) INTO v_total_stops
  FROM public.services WHERE assignment_id = v_assignment;
  SELECT count(DISTINCT scheduled_date) INTO v_working_days
  FROM public.services WHERE assignment_id = v_assignment;

  UPDATE public.assignments
     SET target_cars = COALESCE(v_total_stops, v_count),
         working_days = COALESCE(v_working_days, working_days),
         estimated_earnings = COALESCE(v_total_stops, v_count) * v_rate,
         estimated_hours = GREATEST(round((COALESCE(v_total_stops, v_count) * 0.15)::numeric,1), 1.0),
         total_earnings = COALESCE(v_total_stops, v_count) * v_rate * GREATEST(COALESCE(v_working_days, working_days), 1),
         area = COALESCE(NULLIF(v_partner_area, ''), area)
   WHERE id = v_assignment;

  UPDATE public.partners
     SET cars_selected = COALESCE(v_total_stops, v_count),
         rate_per_car = v_rate
   WHERE id = p_partner_id;

  RETURN v_assignment;
END;
$function$;

-- 4) Backfill existing state — sync every subscription that already has a
--    service scheduled with a partner. This clears the stale "unable to
--    assign" banner for every already-serviced customer, not just the one
--    in the bug report.
UPDATE public.subscriptions sub
   SET assigned_partner_id = t.partner_id,
       assigned_at = COALESCE(sub.assigned_at, now()),
       service_start_date = COALESCE(sub.service_start_date, t.first_date),
       status = 'active',
       updated_at = now()
  FROM (
    SELECT DISTINCT ON (s.vehicle_id)
           s.vehicle_id, s.partner_id, min(s.scheduled_date) OVER (PARTITION BY s.vehicle_id) AS first_date
    FROM public.services s
    WHERE s.partner_id IS NOT NULL AND s.vehicle_id IS NOT NULL
    ORDER BY s.vehicle_id, s.created_at ASC
  ) t
 WHERE sub.vehicle_id = t.vehicle_id
   AND sub.status IN ('active','awaiting_partner_assignment','assigned')
   AND (sub.assigned_partner_id IS DISTINCT FROM t.partner_id OR sub.status <> 'active');

UPDATE public.subscription_assignment_queue q
   SET assigned_partner_id = sub.assigned_partner_id,
       status = 'assigned',
       updated_at = now()
  FROM public.subscriptions sub
 WHERE sub.booking_id = q.booking_id
   AND sub.assigned_partner_id IS NOT NULL
   AND (q.status IN ('awaiting','failed','offered')
        OR q.assigned_partner_id IS DISTINCT FROM sub.assigned_partner_id);
