CREATE OR REPLACE FUNCTION public.list_my_service_history(p_days integer DEFAULT 60, p_vehicle_id uuid DEFAULT NULL)
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
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    b.id,
    s.scheduled_date,
    COALESCE(s.completed_at, s.updated_at),
    s.status::text,
    COALESCE(sc.name, 'Daily Shine'),
    sc.slug,
    s.partner_id,
    p.full_name,
    COALESCE(cv.make || ' ' || cv.model, 'Vehicle'),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'stage', sp.stage, 'angle', sp.angle,
        'storage_path', sp.storage_path, 'captured_at', sp.captured_at
      ) ORDER BY sp.captured_at)
      FROM public.service_photos sp WHERE sp.service_id = s.id
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
      ORDER BY dr.created_at DESC LIMIT 1
    ),
    (COALESCE(s.completed_at, s.updated_at) + interval '2 hours'),
    (s.status = 'completed' AND s.completed_at IS NOT NULL AND s.completed_at > now() - interval '2 hours'),
    EXISTS (SELECT 1 FROM public.complaints c WHERE c.service_id = s.id)
  FROM public.services s
  LEFT JOIN public.bookings b ON b.ops_service_id = s.id
  LEFT JOIN public.service_catalog sc ON sc.id = b.service_id
  LEFT JOIN public.partners p ON p.id = s.partner_id
  LEFT JOIN public.customer_vehicles cv ON cv.id = COALESCE(s.vehicle_id, b.vehicle_id)
  WHERE s.scheduled_date > CURRENT_DATE - p_days
    AND s.scheduled_date <= CURRENT_DATE
    AND s.status::text <> 'covered_by_booking'
    AND (p_vehicle_id IS NULL OR COALESCE(s.vehicle_id, b.vehicle_id) = p_vehicle_id)
    AND (
      b.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.customer_vehicles v
        WHERE v.id = s.vehicle_id AND v.user_id = auth.uid()
      )
      OR s.customer_id IN (
        SELECT c.id FROM public.customers c
        JOIN public.customer_profiles cp ON cp.user_id = auth.uid()
        WHERE (c.phone IS NOT NULL AND cp.phone IS NOT NULL AND c.phone = cp.phone)
           OR (c.email IS NOT NULL AND cp.email IS NOT NULL AND lower(c.email) = lower(cp.email))
      )
    )
  ORDER BY s.scheduled_date DESC, COALESCE(s.completed_at, s.updated_at) DESC
  LIMIT 120;
$$;

REVOKE ALL ON FUNCTION public.list_my_service_history(integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_service_history(integer, uuid) TO authenticated;