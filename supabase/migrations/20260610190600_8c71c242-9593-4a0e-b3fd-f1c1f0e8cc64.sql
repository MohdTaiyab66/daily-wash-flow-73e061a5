
-- Fix 1: Tighten USING on service_analytics partner update policy
DROP POLICY IF EXISTS "partner update own analytics" ON public.service_analytics;
CREATE POLICY "partner update own analytics" ON public.service_analytics
FOR UPDATE TO authenticated
USING (
  partner_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.services s WHERE s.id = service_analytics.service_id AND s.partner_id = auth.uid())
)
WITH CHECK (
  partner_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.services s WHERE s.id = service_analytics.service_id AND s.partner_id = auth.uid())
);

-- Fix 2: Add explicit UPDATE and DELETE storage policies for service-photos bucket scoped to partner's own folder
DROP POLICY IF EXISTS "partners update own service photos" ON storage.objects;
CREATE POLICY "partners update own service photos" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'service-photos' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'service-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "partners delete own service photos" ON storage.objects;
CREATE POLICY "partners delete own service photos" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'service-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
