
-- 1) Remove PII / financial tables from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.customers;
ALTER PUBLICATION supabase_realtime DROP TABLE public.partners;
ALTER PUBLICATION supabase_realtime DROP TABLE public.vehicles;
ALTER PUBLICATION supabase_realtime DROP TABLE public.wallet_ledger;

-- 2) Tighten service-photos storage policies: require service ownership, not just folder name
DROP POLICY IF EXISTS "Partners read own service photos" ON storage.objects;
DROP POLICY IF EXISTS "Partners upload own service photos" ON storage.objects;
DROP POLICY IF EXISTS "partners delete own service photos" ON storage.objects;
DROP POLICY IF EXISTS "partners update own service photos" ON storage.objects;

CREATE POLICY "service photos: partner read own assigned"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'service-photos'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.partner_id = auth.uid()
        AND s.id::text = (storage.foldername(name))[2]
    )
  )
);

CREATE POLICY "service photos: partner insert own assigned"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'service-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.partner_id = auth.uid()
      AND s.id::text = (storage.foldername(name))[2]
  )
);

CREATE POLICY "service photos: partner update own assigned"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'service-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.partner_id = auth.uid()
      AND s.id::text = (storage.foldername(name))[2]
  )
)
WITH CHECK (
  bucket_id = 'service-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "service photos: partner delete own assigned"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'service-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.partner_id = auth.uid()
      AND s.id::text = (storage.foldername(name))[2]
  )
);

CREATE POLICY "service photos: admin full access"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'service-photos' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'service-photos' AND public.has_role(auth.uid(), 'admin'::app_role));
