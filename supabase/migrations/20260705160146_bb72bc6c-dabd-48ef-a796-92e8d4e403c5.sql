CREATE OR REPLACE FUNCTION public.sync_customer_vehicle_to_ops()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.customers WHERE id = NEW.user_id) THEN
    INSERT INTO public.vehicles (
      id, customer_id, make, model, registration_number, color, parking_notes, front_image_path
    ) VALUES (
      NEW.id, NEW.user_id, NEW.make, NEW.model, NEW.registration_number, NEW.color, NEW.parking_notes, NEW.image_path
    )
    ON CONFLICT (id) DO UPDATE SET
      customer_id = EXCLUDED.customer_id,
      make = EXCLUDED.make,
      model = EXCLUDED.model,
      registration_number = EXCLUDED.registration_number,
      color = EXCLUDED.color,
      parking_notes = EXCLUDED.parking_notes,
      front_image_path = EXCLUDED.front_image_path;
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_customer_vehicle_sync_to_ops ON public.customer_vehicles;
CREATE TRIGGER trg_customer_vehicle_sync_to_ops
  AFTER INSERT OR UPDATE OF user_id, make, model, registration_number, color, parking_notes, image_path
  ON public.customer_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_customer_vehicle_to_ops();

INSERT INTO public.vehicles (
  id, customer_id, make, model, registration_number, color, parking_notes, front_image_path
)
SELECT cv.id, cv.user_id, cv.make, cv.model, cv.registration_number, cv.color, cv.parking_notes, cv.image_path
FROM public.customer_vehicles cv
WHERE EXISTS (SELECT 1 FROM public.customers c WHERE c.id = cv.user_id)
ON CONFLICT (id) DO UPDATE SET
  customer_id = EXCLUDED.customer_id,
  make = EXCLUDED.make,
  model = EXCLUDED.model,
  registration_number = EXCLUDED.registration_number,
  color = EXCLUDED.color,
  parking_notes = EXCLUDED.parking_notes,
  front_image_path = EXCLUDED.front_image_path;

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

  CREATE TEMP TABLE tmp_picks ON COMMIT DROP AS
    SELECT
      b.user_id AS customer_id,
      b.vehicle_id AS vehicle_id,
      COALESCE(b.preferred_before_time, c.preferred_time) AS preferred_time,
      COALESCE(c.distance_km, 0) AS distance_km
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
END
$function$;