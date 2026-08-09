-- Create policy for public access to service photography
CREATE POLICY "Public Access to service photography"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'service-photography');
