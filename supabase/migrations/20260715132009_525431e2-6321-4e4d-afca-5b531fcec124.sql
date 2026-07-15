
-- Customer-owned vehicle photos: path convention is `<user_id>/<vehicle_id>/<file>`.
-- Scope reads/writes strictly to the first path segment matching the caller's uid.

DROP POLICY IF EXISTS "vehicle_images_customer_read_own" ON storage.objects;
DROP POLICY IF EXISTS "vehicle_images_customer_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "vehicle_images_customer_update_own" ON storage.objects;
DROP POLICY IF EXISTS "vehicle_images_customer_delete_own" ON storage.objects;

CREATE POLICY "vehicle_images_customer_read_own" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'vehicle-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "vehicle_images_customer_insert_own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'vehicle-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "vehicle_images_customer_update_own" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'vehicle-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "vehicle_images_customer_delete_own" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'vehicle-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
