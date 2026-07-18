
CREATE OR REPLACE FUNCTION public.generate_services_for_queue(p_queue_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  q record;
  v_a record;
  v_partner uuid;
  v_assignment uuid;
  v_start date;
  v_end date;
  v_off int;
  v_rate numeric;
  work_day date;
  seq int;
  v_inserted int := 0;
  v_working_days int := 0;
  v_found int := 0;
  r record;
  v_covered boolean;
BEGIN
  SELECT * INTO q FROM public.subscription_assignment_queue WHERE id = p_queue_id;
  IF NOT FOUND OR q.assigned_partner_id IS NULL THEN RETURN 0; END IF;

  SELECT * INTO v_a
  FROM public.assignments
  WHERE partner_id = q.assigned_partner_id
    AND status = 'active'
  ORDER BY start_date DESC
  LIMIT 1;
  IF NOT FOUND THEN RETURN 0; END IF;

  v_partner := v_a.partner_id;
  v_assignment := v_a.id;
  v_start := GREATEST(CURRENT_DATE, v_a.start_date);
  v_end := v_a.end_date;
  v_off := 1;
  v_rate := v_a.rate_per_car;

  -- Fix: customers table has no distance_km column. Drop the reference; it
  -- was only used for tie-break ordering and defaults to 0 anyway.
  CREATE TEMP TABLE tmp_picks ON COMMIT DROP AS
    SELECT
      b.user_id AS customer_id,
      b.vehicle_id AS vehicle_id,
      COALESCE(b.preferred_before_time, c.preferred_time) AS preferred_time,
      0::numeric AS distance_km
    FROM public.bookings b
    LEFT JOIN public.customers c ON c.id = b.user_id
    WHERE b.id = q.booking_id
      AND b.vehicle_id IS NOT NULL;

  SELECT count(*) INTO v_found FROM tmp_picks;

  FOR work_day IN SELECT generate_series(v_start, v_end, interval '1 day')::date LOOP
    IF extract(dow FROM work_day)::int = v_off THEN CONTINUE; END IF;
    seq := 0;

    FOR r IN SELECT * FROM tmp_picks ORDER BY COALESCE(preferred_time, '99:99') ASC, distance_km ASC LOOP
      seq := seq + 1;
      v_covered := public.customer_has_pro_booking_on(r.customer_id, work_day);
      BEGIN
        INSERT INTO public.services (
          partner_id, customer_id, vehicle_id, assignment_id, scheduled_date,
          time_slot, sequence_no, rate_per_car, status, delay_reason
        ) VALUES (
          v_partner, r.customer_id, r.vehicle_id, v_assignment, work_day,
          COALESCE(r.preferred_time, '06:00 - 09:00'), seq,
          CASE WHEN v_covered THEN 0 ELSE v_rate END,
          CASE WHEN v_covered THEN 'covered_by_booking' ELSE 'pending' END,
          CASE WHEN v_covered THEN 'covered_by_booking' ELSE NULL END
        );
        v_inserted := v_inserted + 1;
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
    END LOOP;

    v_working_days := v_working_days + 1;
  END LOOP;

  UPDATE public.assignments
  SET working_days = v_working_days,
      total_earnings = v_working_days * v_found * v_rate
  WHERE id = v_assignment;

  UPDATE public.subscription_assignment_queue
  SET locked_partner_id = q.assigned_partner_id,
      lock_until = v_a.end_date
  WHERE id = q.id;

  RETURN v_inserted;
END;
$function$;
