
-- SECURITY FIX: Restrict storage access for public buckets to prevent unauthorized deletions/overwrites

-- 1. Policies for 'daily-shine-carousel'
DO $$
BEGIN
    -- Drop existing wide-open policies if they exist (based on scan markers)
    DROP POLICY IF EXISTS "Public Access for daily-shine-carousel" ON storage.objects;
    DROP POLICY IF EXISTS "Admin Insert for daily-shine-carousel" ON storage.objects;
    DROP POLICY IF EXISTS "Admin Update for daily-shine-carousel" ON storage.objects;
    DROP POLICY IF EXISTS "Admin Delete for daily-shine-carousel" ON storage.objects;
    
    -- Allow public read (SELECT)
    CREATE POLICY "Public Read Access for daily-shine-carousel"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'daily-shine-carousel');

    -- Allow only admins to Insert/Update/Delete
    -- Requirement: public.has_role function must exist (standard Urban Wash practice)
    CREATE POLICY "Admin Insert for daily-shine-carousel"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'daily-shine-carousel' 
        AND public.has_role(auth.uid(), 'admin')
    );

    CREATE POLICY "Admin Update for daily-shine-carousel"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'daily-shine-carousel' 
        AND public.has_role(auth.uid(), 'admin')
    );

    CREATE POLICY "Admin Delete for daily-shine-carousel"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'daily-shine-carousel' 
        AND public.has_role(auth.uid(), 'admin')
    );
END $$;

-- 2. Policies for 'service-photography'
DO $$
BEGIN
    DROP POLICY IF EXISTS "Public Access for service-photography" ON storage.objects;
    DROP POLICY IF EXISTS "Admin Insert for service-photography" ON storage.objects;
    DROP POLICY IF EXISTS "Admin Update for service-photography" ON storage.objects;
    DROP POLICY IF EXISTS "Admin Delete for service-photography" ON storage.objects;

    -- Allow public read (SELECT)
    CREATE POLICY "Public Read Access for service-photography"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'service-photography');

    -- Allow only admins to Insert/Update/Delete
    CREATE POLICY "Admin Insert for service-photography"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'service-photography' 
        AND public.has_role(auth.uid(), 'admin')
    );

    CREATE POLICY "Admin Update for service-photography"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'service-photography' 
        AND public.has_role(auth.uid(), 'admin')
    );

    CREATE POLICY "Admin Delete for service-photography"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'service-photography' 
        AND public.has_role(auth.uid(), 'admin')
    );
END $$;
