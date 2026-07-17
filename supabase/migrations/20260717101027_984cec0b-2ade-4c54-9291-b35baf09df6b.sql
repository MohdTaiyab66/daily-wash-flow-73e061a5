-- 1. Storage: tighten service photos UPDATE WITH CHECK to re-verify service ownership
DROP POLICY IF EXISTS "service photos: partner update own assigned" ON storage.objects;
CREATE POLICY "service photos: partner update own assigned"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'service-photos'
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.partner_id = auth.uid()
      AND (s.id)::text = (storage.foldername(objects.name))[2]
  )
)
WITH CHECK (
  bucket_id = 'service-photos'
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.partner_id = auth.uid()
      AND (s.id)::text = (storage.foldername(name))[2]
  )
);

-- 2. coverage_zone_calendar: restrict reads to admin/ops_manager
DROP POLICY IF EXISTS "calendar read authenticated" ON public.coverage_zone_calendar;
CREATE POLICY "calendar read admin ops"
ON public.coverage_zone_calendar
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'ops_manager'::app_role)
  OR public.has_role(auth.uid(), 'supervisor'::app_role)
);

-- 3. marketplace_settings: restrict reads to admin/ops_manager/supervisor/partner (partners may need settings for their app; be conservative — admin/ops only)
DROP POLICY IF EXISTS "mp_settings read" ON public.marketplace_settings;
CREATE POLICY "mp_settings read admin ops"
ON public.marketplace_settings
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'ops_manager'::app_role)
  OR public.has_role(auth.uid(), 'supervisor'::app_role)
);