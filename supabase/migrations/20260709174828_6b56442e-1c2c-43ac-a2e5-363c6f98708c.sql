
CREATE OR REPLACE FUNCTION public.regenerate_assignment_services(
  p_assignment_id uuid,
  p_from_date date DEFAULT CURRENT_DATE
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_a public.assignments%ROWTYPE;
  v_rate numeric;
  v_from date;
  v_inserted int := 0;
  work_day date;
  seq int;
  r record;
  v_covered boolean;
BEGIN
  SELECT * INTO v_a FROM public.assignments WHERE id = p_assignment_id;
  IF NOT FOUND OR v_a.status <> 'active' THEN RETURN 0; END IF;

  v_from := GREATEST(p_from_date, v_a.start_date);
  IF v_from > v_a.end_date THEN RETURN 0; END IF;
  v_rate := COALESCE(v_a.rate_per_car, 17);

  FOR work_day IN
    SELECT generate_series(v_from, v_a.end_date, interval '1 day')::date
  LOOP
    IF extract(dow FROM work_day)::int = 1 THEN CONTINUE; END IF;

    seq := 0;
    FOR r IN
      SELECT DISTINCT ON (s.customer_id, s.vehicle_id)
             s.customer_id, s.vehicle_id,
             COALESCE(c.preferred_time, '06:00 - 09:00') AS preferred_time
      FROM public.services s
      LEFT JOIN public.customers c ON c.id = s.customer_id
      WHERE s.assignment_id = p_assignment_id
        AND s.vehicle_id IS NOT NULL
      ORDER BY s.customer_id, s.vehicle_id, s.created_at ASC
    LOOP
      seq := seq + 1;
      v_covered := public.customer_has_pro_booking_on(r.customer_id, work_day);
      BEGIN
        INSERT INTO public.services (
          partner_id, customer_id, vehicle_id, assignment_id, scheduled_date,
          time_slot, sequence_no, rate_per_car, status, delay_reason
        ) VALUES (
          v_a.partner_id, r.customer_id, r.vehicle_id, v_a.id, work_day,
          r.preferred_time, seq,
          CASE WHEN v_covered THEN 0 ELSE v_rate END,
          (CASE WHEN v_covered THEN 'covered_by_booking' ELSE 'pending' END)::public.service_status,
          CASE WHEN v_covered THEN 'covered_by_booking' ELSE NULL END
        );
        v_inserted := v_inserted + 1;
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END;
$function$;
