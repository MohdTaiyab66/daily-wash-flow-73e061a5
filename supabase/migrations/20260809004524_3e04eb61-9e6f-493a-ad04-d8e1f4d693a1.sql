-- Policies for service-photography bucket
-- Allow public (or authenticated) read access to items in this bucket
-- Since public buckets are blocked, we'll allow all authenticated users to read.
-- The admin UI and customer app will both be authenticated.

CREATE POLICY "Authenticated users can read service photography" 
ON storage.objects FOR SELECT 
TO authenticated 
USING (bucket_id = 'service-photography');

-- Allow admins to upload/manage
CREATE POLICY "Admins can upload service photography" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (
    bucket_id = 'service-photography' AND 
    public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can update service photography" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING (
    bucket_id = 'service-photography' AND 
    public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete service photography" 
ON storage.objects FOR DELETE 
TO authenticated 
USING (
    bucket_id = 'service-photography' AND 
    public.has_role(auth.uid(), 'admin')
);