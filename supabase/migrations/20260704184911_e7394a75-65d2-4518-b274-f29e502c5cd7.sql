
-- Replace covered_by_booking behavior: use a dedicated status, don't auto-complete.
-- Daily Shine services covered by a professional booking are now hidden from the
-- partner route and only marked completed once the booking itself is completed.

-- 1) Update generate_services_for_queue: on covered day, insert with status='covered_by_booking'
CREATE OR REPLACE FUNCTION public.generate_services_for_queue(p_queue_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  q record; v_a record; v_partner uuid; v_assignment uuid;
  v_start date; v_end date; v_off int; v_rate numeric;
  work_day date; seq int; v_inserted int := 0; v_working_days int := 0; v_found int := 0;
  r record; v_covered boolean;
BEGIN
  SELECT * INTO q FROM public.subscription_assignment_queue WHERE id = p_queue_id;
  IF NOT FOUND OR q.assigned_partner_id IS NULL THEN RETURN 0; END IF;
  SELECT * INTO v_a FROM public.assignments WHERE id = (
    SELECT id FROM public.assignments WHERE partner_id = q.assigned_partner_id AND status='active'
    ORDER BY start_date DESC LIMIT 1);
  IF NOT FOUND THEN RETURN 0; END IF;
  v_partner := v_a.partner_id; v_assignment := v_a.id;
  v_start := GREATEST(CURRENT_DATE, v_a.start_date);
  v_end := v_a.end_date;
  v_off := 1; -- Monday off
  v_rate := v_a.rate_per_car;

  CREATE TEMP TABLE IF NOT EXISTS tmp_picks ON COMMIT DROP AS
    SELECT c.id AS customer_id, cv.id AS vehicle_id, c.preferred_time,
           COALESCE(c.distance_km, 0) AS distance_km
      FROM public.customers c
      LEFT JOIN public.customer_vehicles cv ON cv.customer_id = c.id AND cv.is_primary = true
      WHERE c.id = ANY(q.customer_ids);
  SELECT count(*) INTO v_found FROM tmp_picks;

  FOR work_day IN SELECT generate_series(v_start, v_end, interval '1 day')::date LOOP
    IF extract(dow FROM work_day)::int = v_off THEN CONTINUE; END IF;
    seq := 0;
    FOR r IN SELECT * FROM tmp_picks ORDER BY COALESCE(preferred_time,'99:99') ASC, distance_km ASC LOOP
      seq := seq + 1;
      v_covered := public.customer_has_pro_booking_on(r.customer_id, work_day);
      BEGIN
        INSERT INTO public.services (partner_id, customer_id, vehicle_id, assignment_id, scheduled_date, time_slot, sequence_no, rate_per_car, status, delay_reason)
        VALUES (v_partner, r.customer_id, r.vehicle_id, v_assignment, work_day,
                COALESCE(r.preferred_time, '06:00 - 09:00'), seq,
                CASE WHEN v_covered THEN 0 ELSE v_rate END,
                CASE WHEN v_covered THEN 'covered_by_booking' ELSE 'pending' END,
                CASE WHEN v_covered THEN 'covered_by_booking' ELSE NULL END);
        v_inserted := v_inserted + 1;
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
    END LOOP;
    v_working_days := v_working_days + 1;
  END LOOP;

  UPDATE public.assignments SET working_days = v_working_days,
    total_earnings = v_working_days * v_found * v_rate WHERE id = v_assignment;

  UPDATE public.subscription_assignment_queue
    SET locked_partner_id = q.assigned_partner_id, lock_until = v_a.end_date
    WHERE id = q.id;

  RETURN v_inserted;
END $function$;

-- 2) When a booking is created/updated to cover a day, mark DS service covered (not completed)
CREATE OR REPLACE FUNCTION public.tg_booking_covers_daily_shine()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cat text;
BEGIN
  IF NEW.status IN ('cancelled','failed') THEN RETURN NEW; END IF;
  SELECT category::text INTO v_cat FROM public.service_catalog WHERE id = NEW.service_id;
  IF v_cat NOT IN ('one_time','deep_clean','premium') THEN RETURN NEW; END IF;

  UPDATE public.services s
     SET status = 'covered_by_booking',
         rate_per_car = 0,
         delay_reason = 'covered_by_booking',
         updated_at = now()
    FROM public.customer_profiles cp
    JOIN public.customers c
      ON (c.phone IS NOT NULL AND cp.phone IS NOT NULL AND c.phone = cp.phone)
      OR (c.email IS NOT NULL AND cp.email IS NOT NULL AND lower(c.email) = lower(cp.email))
   WHERE cp.user_id = NEW.user_id
     AND s.customer_id = c.id
     AND s.scheduled_date = NEW.scheduled_date
     AND s.status IN ('pending','in_progress');
  RETURN NEW;
END $$;

-- 3) When the booking is completed, flip covered DS service to completed
CREATE OR REPLACE FUNCTION public.tg_booking_completes_daily_shine()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN RETURN NEW; END IF;

  UPDATE public.services s
     SET status = 'completed',
         completed_at = COALESCE(s.completed_at, now()),
         updated_at = now()
    FROM public.customer_profiles cp
    JOIN public.customers c
      ON (c.phone IS NOT NULL AND cp.phone IS NOT NULL AND c.phone = cp.phone)
      OR (c.email IS NOT NULL AND cp.email IS NOT NULL AND lower(c.email) = lower(cp.email))
   WHERE cp.user_id = NEW.user_id
     AND s.customer_id = c.id
     AND s.scheduled_date = NEW.scheduled_date
     AND s.status = 'covered_by_booking';
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_booking_completes_daily_shine ON public.bookings;
CREATE TRIGGER trg_booking_completes_daily_shine
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.tg_booking_completes_daily_shine();

-- 4) If a booking is cancelled after covering a DS day, restore the DS service to pending
CREATE OR REPLACE FUNCTION public.tg_booking_cancel_restores_daily_shine()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rate numeric;
BEGIN
  IF NEW.status NOT IN ('cancelled','failed') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;

  UPDATE public.services s
     SET status = 'pending',
         delay_reason = NULL,
         rate_per_car = COALESCE(a.rate_per_car, s.rate_per_car),
         updated_at = now()
    FROM public.customer_profiles cp
    JOIN public.customers c
      ON (c.phone IS NOT NULL AND cp.phone IS NOT NULL AND c.phone = cp.phone)
      OR (c.email IS NOT NULL AND cp.email IS NOT NULL AND lower(c.email) = lower(cp.email))
    LEFT JOIN public.assignments a ON a.id = s.assignment_id
   WHERE cp.user_id = NEW.user_id
     AND s.customer_id = c.id
     AND s.scheduled_date = NEW.scheduled_date
     AND s.status = 'covered_by_booking';
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_booking_cancel_restores_daily_shine ON public.bookings;
CREATE TRIGGER trg_booking_cancel_restores_daily_shine
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.tg_booking_cancel_restores_daily_shine();
