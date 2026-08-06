-- Shared ownership resolver: booking OR subscription OR vehicle OR customer profile match
CREATE OR REPLACE FUNCTION public.user_owns_service(_service_id uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.services s
    WHERE s.id = _service_id
      AND (
        EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.ops_service_id = s.id AND b.user_id = _user
        )
        OR EXISTS (
          SELECT 1 FROM public.subscriptions sub
          WHERE sub.customer_id = s.customer_id AND sub.user_id = _user
        )
        OR EXISTS (
          SELECT 1 FROM public.customer_vehicles v
          WHERE v.id = s.vehicle_id AND v.user_id = _user
        )
        OR EXISTS (
          SELECT 1
          FROM public.customers c
          JOIN public.customer_profiles cp ON cp.user_id = _user
          WHERE c.id = s.customer_id
            AND (
              (c.phone IS NOT NULL AND cp.phone IS NOT NULL AND c.phone = cp.phone)
              OR (c.email IS NOT NULL AND cp.email IS NOT NULL AND lower(c.email) = lower(cp.email))
            )
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_owns_service(uuid, uuid) TO authenticated, service_role;

-- Recent services (both overloads): LEFT JOIN bookings + shared ownership
CREATE OR REPLACE FUNCTION public.list_my_recent_services(p_days integer DEFAULT 2)
 RETURNS TABLE(service_id uuid, booking_id uuid, scheduled_date date, completed_at timestamp with time zone, status text, service_name text, service_slug text, partner_id uuid, partner_name text, vehicle_label text, photos jsonb, unavailable_reason text, unavailable_notes text, unavailable_photo text, dirty_report jsonb, complaint_window_ends_at timestamp with time zone, can_complain boolean, has_complaint boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.id, b.id, s.scheduled_date,
    COALESCE(s.completed_at, s.updated_at),
    s.status::text,
    COALESCE(sc.name, 'Daily Shine'), sc.slug,
    s.partner_id, p.full_name,
    COALESCE(cv.make || ' ' || cv.model, 'Vehicle'),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'stage', sp.stage, 'angle', sp.angle,
        'storage_path', sp.storage_path, 'captured_at', sp.captured_at
      ) ORDER BY sp.captured_at)
      FROM public.service_photos sp WHERE sp.service_id = s.id
    ), '[]'::jsonb),
    s.unavailable_reason::text, s.unavailable_notes, s.unavailable_photo,
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
  WHERE public.user_owns_service(s.id, auth.uid())
    AND s.status IN ('completed','unavailable')
    AND COALESCE(s.completed_at, s.updated_at) > now() - (p_days || ' days')::interval
  ORDER BY COALESCE(s.completed_at, s.updated_at) DESC
  LIMIT 30;
$function$;

CREATE OR REPLACE FUNCTION public.list_my_recent_services(p_days integer DEFAULT 2, p_vehicle_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(service_id uuid, booking_id uuid, scheduled_date date, completed_at timestamp with time zone, status text, service_name text, service_slug text, partner_id uuid, partner_name text, vehicle_label text, photos jsonb, unavailable_reason text, unavailable_notes text, unavailable_photo text, dirty_report jsonb, complaint_window_ends_at timestamp with time zone, can_complain boolean, has_complaint boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.id, b.id, s.scheduled_date,
    COALESCE(s.completed_at, s.updated_at),
    s.status::text,
    COALESCE(sc.name, 'Daily Shine'), sc.slug,
    s.partner_id, p.full_name,
    COALESCE(cv.make || ' ' || cv.model, 'Vehicle'),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'stage', sp.stage, 'angle', sp.angle,
        'storage_path', sp.storage_path, 'captured_at', sp.captured_at
      ) ORDER BY sp.captured_at)
      FROM public.service_photos sp WHERE sp.service_id = s.id
    ), '[]'::jsonb),
    s.unavailable_reason::text, s.unavailable_notes, s.unavailable_photo,
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
  WHERE public.user_owns_service(s.id, auth.uid())
    AND s.status IN ('completed','unavailable')
    AND COALESCE(s.completed_at, s.updated_at) > now() - (p_days || ' days')::interval
    AND (p_vehicle_id IS NULL OR COALESCE(s.vehicle_id, b.vehicle_id) = p_vehicle_id)
  ORDER BY COALESCE(s.completed_at, s.updated_at) DESC
  LIMIT 30;
$function$;

CREATE OR REPLACE FUNCTION public.list_my_service_history(p_days integer DEFAULT 60, p_vehicle_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(service_id uuid, booking_id uuid, scheduled_date date, completed_at timestamp with time zone, status text, service_name text, service_slug text, partner_id uuid, partner_name text, vehicle_label text, photos jsonb, unavailable_reason text, unavailable_notes text, unavailable_photo text, dirty_report jsonb, complaint_window_ends_at timestamp with time zone, can_complain boolean, has_complaint boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.id, b.id, s.scheduled_date,
    COALESCE(s.completed_at, s.updated_at),
    s.status::text,
    COALESCE(sc.name, 'Daily Shine'), sc.slug,
    s.partner_id, p.full_name,
    COALESCE(cv.make || ' ' || cv.model, 'Vehicle'),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'stage', sp.stage, 'angle', sp.angle,
        'storage_path', sp.storage_path, 'captured_at', sp.captured_at
      ) ORDER BY sp.captured_at)
      FROM public.service_photos sp WHERE sp.service_id = s.id
    ), '[]'::jsonb),
    s.unavailable_reason::text, s.unavailable_notes, s.unavailable_photo,
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
    AND public.user_owns_service(s.id, auth.uid())
  ORDER BY s.scheduled_date DESC, COALESCE(s.completed_at, s.updated_at) DESC
  LIMIT 120;
$function$;

-- RLS: same ownership logic for photo rows
DROP POLICY IF EXISTS "Customers read photos of own services" ON public.service_photos;
CREATE POLICY "Customers read photos of own services"
ON public.service_photos FOR SELECT TO authenticated
USING (public.user_owns_service(service_id, auth.uid()));

-- RLS: same ownership logic for stored photo files
DROP POLICY IF EXISTS "Customers read own service photo files" ON storage.objects;
CREATE POLICY "Customers read own service photo files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'service-photos'
  AND EXISTS (
    SELECT 1 FROM public.service_photos sp
    WHERE sp.storage_path = storage.objects.name
      AND public.user_owns_service(sp.service_id, auth.uid())
  )
);