
-- 1) Revoke EXECUTE on SECURITY DEFINER functions from anon/public; grant to authenticated only.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
                   r.nspname, r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- 2) Tighten vehicle-images storage SELECT policy to only the assigned partner (or admins).
DROP POLICY IF EXISTS vehicle_images_read_auth ON storage.objects;

CREATE POLICY "vehicle_images_read_assigned_partner"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'vehicle-images'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.vehicles v
      JOIN public.services s ON s.vehicle_id = v.id
      WHERE v.front_image_path = storage.objects.name
        AND s.partner_id = auth.uid()
    )
  )
);
