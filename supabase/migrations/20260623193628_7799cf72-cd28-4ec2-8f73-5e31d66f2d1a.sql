
-- Customer-facing service completion feed & complaint window

-- 1. RPC: list recently completed services (last 2 days) for the signed-in customer,
-- including photo storage paths and the partner who completed it.
CREATE OR REPLACE FUNCTION public.list_my_recent_services(p_days int DEFAULT 2)
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
    s.id AS service_id,
    b.id AS booking_id,
    s.scheduled_date,
    s.completed_at,
    s.status::text,
    sc.name AS service_name,
    sc.slug AS service_slug,
    s.partner_id,
    p.full_name AS partner_name,
    COALESCE(cv.make || ' ' || cv.model, 'Vehicle') AS vehicle_label,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'stage', sp.stage,
        'angle', sp.angle,
        'storage_path', sp.storage_path,
        'captured_at', sp.captured_at
      ) ORDER BY sp.captured_at)
      FROM public.service_photos sp
      WHERE sp.service_id = s.id
    ), '[]'::jsonb) AS photos,
    (s.completed_at + interval '2 hours') AS complaint_window_ends_at,
    (s.completed_at IS NOT NULL AND s.completed_at > now() - interval '2 hours') AS can_complain,
    EXISTS(SELECT 1 FROM public.complaints c WHERE c.service_id = s.id) AS has_complaint
  FROM public.bookings b
  JOIN public.services s ON s.id = b.ops_service_id
  LEFT JOIN public.service_catalog sc ON sc.id = b.service_id
  LEFT JOIN public.partners p ON p.id = s.partner_id
  LEFT JOIN public.customer_vehicles cv ON cv.id = b.vehicle_id
  WHERE b.user_id = auth.uid()
    AND s.status = 'completed'
    AND s.completed_at IS NOT NULL
    AND s.completed_at > now() - (p_days || ' days')::interval
  ORDER BY s.completed_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_recent_services(int) TO authenticated;

-- 2. RPC: submit a complaint for one of my completed services, enforcing the 2-hour window.
CREATE OR REPLACE FUNCTION public.submit_service_complaint(
  p_service_id uuid,
  p_complaint_type text,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service public.services%ROWTYPE;
  v_complaint_id uuid;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT s.* INTO v_service
  FROM public.services s
  JOIN public.bookings b ON b.ops_service_id = s.id
  WHERE s.id = p_service_id AND b.user_id = v_user
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found for this customer';
  END IF;

  IF v_service.completed_at IS NULL THEN
    RAISE EXCEPTION 'Service not completed yet';
  END IF;

  IF v_service.completed_at < now() - interval '2 hours' THEN
    RAISE EXCEPTION 'Complaint window (2 hours after completion) has closed';
  END IF;

  INSERT INTO public.complaints (customer_id, partner_id, service_id, complaint_type, description, status)
  VALUES (v_user, v_service.partner_id, v_service.id, p_complaint_type, p_description, 'open')
  RETURNING id INTO v_complaint_id;

  RETURN v_complaint_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_service_complaint(uuid, text, text) TO authenticated;

-- 3. RPC: issue a signed URL for a service photo I am allowed to view (my booking).
CREATE OR REPLACE FUNCTION public.get_my_service_photo_url(p_storage_path text, p_expires int DEFAULT 600)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, extensions
AS $$
DECLARE
  v_ok boolean;
  v_signed text;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM public.service_photos sp
    JOIN public.bookings b ON b.ops_service_id = sp.service_id
    WHERE sp.storage_path = p_storage_path AND b.user_id = auth.uid()
  ) INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  RETURN p_storage_path; -- client will resolve via signed URL helper
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_service_photo_url(text, int) TO authenticated;

-- 4. Realtime: ensure service_photos and complaints are published so customer app updates instantly.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='service_photos') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.service_photos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='complaints') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.complaints';
  END IF;
END $$;

-- 5. Customer SELECT policy on service_photos for their own services (so signed URL retrieval works via Data API too).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='Customers read photos of own services') THEN
    EXECUTE $POL$
      CREATE POLICY "Customers read photos of own services"
      ON public.service_photos FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.ops_service_id = service_photos.service_id
            AND b.user_id = auth.uid()
        )
      )
    $POL$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='Customers read own services') THEN
    EXECUTE $POL$
      CREATE POLICY "Customers read own services"
      ON public.services FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.ops_service_id = services.id AND b.user_id = auth.uid()
        )
      )
    $POL$;
  END IF;
  -- Customers can insert their own complaints (in addition to admin/partner read policies).
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='Customers insert own complaints') THEN
    EXECUTE $POL$
      CREATE POLICY "Customers insert own complaints"
      ON public.complaints FOR INSERT TO authenticated
      WITH CHECK (customer_id = auth.uid())
    $POL$;
  END IF;
END $$;

-- 6. Storage: allow signed-URL access for the service-photos bucket for customers reading their own service's photos.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='Customers read own service photo files') THEN
    EXECUTE $POL$
      CREATE POLICY "Customers read own service photo files"
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'service-photos' AND EXISTS (
          SELECT 1
          FROM public.service_photos sp
          JOIN public.bookings b ON b.ops_service_id = sp.service_id
          WHERE sp.storage_path = storage.objects.name AND b.user_id = auth.uid()
        )
      )
    $POL$;
  END IF;
END $$;
