
CREATE POLICY "vehicle_images_read_auth" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'vehicle-images');

CREATE POLICY "vehicle_images_admin_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vehicle-images' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "vehicle_images_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'vehicle-images' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "vehicle_images_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'vehicle-images' AND public.has_role(auth.uid(), 'admin'::app_role));
