
DROP FUNCTION IF EXISTS public.list_my_recent_services(integer);

CREATE OR REPLACE FUNCTION public.schedule_plan_services_recurring(
  p_service_id uuid,
  p_vehicle_id uuid,
  p_address_id uuid,
  p_weekday int,
  p_occurrences int,
  p_start_date date,
  p_scheduled_time text
) RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ids uuid[] := ARRAY[]::uuid[];
  v_cursor date;
  v_count int := 0;
  v_booking uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in again'; END IF;
  IF p_weekday = 1 THEN RAISE EXCEPTION 'Daily Shine does not run on Mondays'; END IF;
  IF p_occurrences < 1 OR p_occurrences > 30 THEN RAISE EXCEPTION 'Pick between 1 and 30 occurrences'; END IF;
  IF p_start_date < CURRENT_DATE THEN p_start_date := CURRENT_DATE; END IF;

  v_cursor := p_start_date;
  WHILE EXTRACT(DOW FROM v_cursor)::int <> p_weekday LOOP
    v_cursor := v_cursor + 1;
  END LOOP;

  WHILE v_count < p_occurrences LOOP
    IF EXTRACT(DOW FROM v_cursor)::int <> 1 THEN
      v_booking := public.confirm_customer_booking(
        p_service_id, p_vehicle_id, p_address_id,
        v_cursor, p_scheduled_time, 'Pre-booked within plan', NULL, '[]'::jsonb
      );
      v_ids := array_append(v_ids, v_booking);
      v_count := v_count + 1;
    END IF;
    v_cursor := v_cursor + 7;
  END LOOP;

  RETURN v_ids;
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_plan_services_recurring(uuid, uuid, uuid, int, int, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_block_monday_daily_shine()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_slug text;
BEGIN
  SELECT slug INTO v_slug FROM public.service_catalog WHERE id = NEW.service_id;
  IF v_slug IS NOT NULL
     AND v_slug LIKE 'daily-shine%'
     AND EXTRACT(DOW FROM NEW.scheduled_date)::int = 1
  THEN
    RAISE EXCEPTION 'Daily Shine does not run on Mondays. Please pick another date.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_monday_daily_shine ON public.bookings;
CREATE TRIGGER block_monday_daily_shine
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_monday_daily_shine();

CREATE FUNCTION public.list_my_recent_services(p_days int DEFAULT 2)
RETURNS TABLE (
  service_id uuid,
  booking_id uuid,
  scheduled_date date,
  completed_at timestamptz,
  status text,
  service_name text,
  service_slug text,
  partner_id uuid,
  partner_name text,
  vehicle_label text,
  photos jsonb,
  unavailable_reason text,
  unavailable_notes text,
  unavailable_photo text,
  dirty_report jsonb,
  complaint_window_ends_at timestamptz,
  can_complain boolean,
  has_complaint boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    b.id,
    s.scheduled_date,
    COALESCE(s.completed_at, s.updated_at),
    s.status::text,
    sc.name,
    sc.slug,
    s.partner_id,
    p.full_name,
    COALESCE(cv.make || ' ' || cv.model, 'Vehicle'),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'stage', sp.stage,
        'angle', sp.angle,
        'storage_path', sp.storage_path,
        'captured_at', sp.captured_at
      ) ORDER BY sp.captured_at)
      FROM public.service_photos sp
      WHERE sp.service_id = s.id
    ), '[]'::jsonb),
    s.unavailable_reason::text,
    s.unavailable_notes,
    s.unavailable_photo,
    (
      SELECT jsonb_build_object(
        'reason', dr.reason, 'notes', dr.notes,
        'photo_front', dr.photo_front, 'photo_rear', dr.photo_rear,
        'photo_left', dr.photo_left, 'photo_right', dr.photo_right,
        'created_at', dr.created_at
      )
      FROM public.dirty_vehicle_reports dr
      WHERE dr.service_id = s.id
      ORDER BY dr.created_at DESC
      LIMIT 1
    ),
    (COALESCE(s.completed_at, s.updated_at) + interval '2 hours'),
    (s.status = 'completed' AND s.completed_at IS NOT NULL AND s.completed_at > now() - interval '2 hours'),
    EXISTS (SELECT 1 FROM public.complaints c WHERE c.service_id = s.id)
  FROM public.services s
  JOIN public.bookings b ON b.ops_service_id = s.id
  LEFT JOIN public.service_catalog sc ON sc.id = b.service_id
  LEFT JOIN public.partners p ON p.id = s.partner_id
  LEFT JOIN public.customer_vehicles cv ON cv.id = b.vehicle_id
  WHERE b.user_id = auth.uid()
    AND s.status IN ('completed','unavailable')
    AND COALESCE(s.completed_at, s.updated_at) > now() - (p_days || ' days')::interval
  ORDER BY COALESCE(s.completed_at, s.updated_at) DESC
  LIMIT 30;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_recent_services(int) TO authenticated;
