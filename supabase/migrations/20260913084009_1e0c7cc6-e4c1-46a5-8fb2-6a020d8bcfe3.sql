CREATE OR REPLACE FUNCTION public.get_partner_work_v2(p_partner_id uuid)
RETURNS TABLE(
  assignment_id uuid,
  service_id uuid,
  booking_id uuid,
  customer_id uuid,
  vehicle_id uuid,
  customer_name text,
  customer_phone text,
  vehicle_number text,
  vehicle_make text,
  vehicle_model text,
  scheduled_date date,
  scheduled_time text,
  service_status public.service_status,
  unavailable_reason text,
  address text,
  latitude double precision,
  longitude double precision,
  destination_lat double precision,
  destination_lng double precision,
  rate_per_car numeric,
  sequence_no integer,
  manual_sequence_no integer,
  eta_at timestamptz,
  distance_km numeric,
  started_at timestamptz,
  completed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_ist date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
  v_canonical_partner uuid;
BEGIN
  v_canonical_partner := public.resolve_partner_id(auth.uid());

  IF auth.role() <> 'service_role'
     AND (v_canonical_partner IS NULL OR p_partner_id IS DISTINCT FROM v_canonical_partner) THEN
    RAISE EXCEPTION 'Not authorized to view this partner route' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    s.id,
    b.id,
    s.customer_id,
    s.vehicle_id,
    c.full_name::text,
    c.phone::text,
    v.registration_number::text,
    v.make::text,
    v.model::text,
    s.scheduled_date,
    COALESCE(s.time_slot, b.scheduled_time, c.preferred_time)::text,
    s.status,
    s.unavailable_reason::text,
    COALESCE(ba.address_line, da.address_line, c.address_line)::text,
    COALESCE(s.destination_lat, b.latitude, c.latitude, ba.latitude, da.latitude)::double precision,
    COALESCE(s.destination_lng, b.longitude, c.longitude, ba.longitude, da.longitude)::double precision,
    COALESCE(s.destination_lat, b.latitude, c.latitude, ba.latitude, da.latitude)::double precision,
    COALESCE(s.destination_lng, b.longitude, c.longitude, ba.longitude, da.longitude)::double precision,
    s.rate_per_car,
    s.sequence_no,
    s.manual_sequence_no,
    s.eta_at,
    s.distance_km,
    s.started_at,
    s.completed_at
  FROM public.assignments a
  JOIN public.services s ON s.assignment_id = a.id
  LEFT JOIN public.customers c ON c.id = s.customer_id
  LEFT JOIN public.vehicles v ON v.id = s.vehicle_id
  LEFT JOIN LATERAL (
    SELECT bx.*
    FROM public.bookings bx
    WHERE bx.ops_service_id = s.id
       OR (
         bx.vehicle_id = s.vehicle_id
         AND bx.user_id = s.customer_id
         AND bx.scheduled_date = s.scheduled_date
       )
    ORDER BY (bx.ops_service_id = s.id) DESC, bx.created_at DESC
    LIMIT 1
  ) b ON true
  LEFT JOIN public.customer_addresses ba ON ba.id = b.address_id
  LEFT JOIN LATERAL (
    SELECT ca.*
    FROM public.customer_addresses ca
    WHERE ca.user_id = s.customer_id
    ORDER BY ca.is_default DESC, ca.updated_at DESC
    LIMIT 1
  ) da ON true
  WHERE a.partner_id = p_partner_id
    AND a.status = 'active'
    AND (
      s.scheduled_date = v_today_ist
      OR (s.status IN ('pending', 'in_progress') AND s.scheduled_date < v_today_ist)
    )
  ORDER BY
    COALESCE(s.manual_sequence_no, s.sequence_no, 2147483647),
    s.scheduled_date,
    s.time_slot,
    s.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_partner_work_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_partner_work_v2(uuid) TO authenticated, service_role;