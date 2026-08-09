DO $$
BEGIN
    -- 1. Allow public to read objects
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Public Access DSC'
    ) THEN
        CREATE POLICY "Public Access DSC"
        ON storage.objects FOR SELECT
        TO public
        USING (bucket_id = 'daily-shine-carousel');
    END IF;

    -- 2. Allow admins to insert objects
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Admin Upload DSC'
    ) THEN
        CREATE POLICY "Admin Upload DSC"
        ON storage.objects FOR INSERT
        TO authenticated
        WITH CHECK (
          bucket_id = 'daily-shine-carousel' AND
          (SELECT public.has_role(auth.uid(), 'admin'))
        );
    END IF;

    -- 3. Allow admins to update objects
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Admin Update DSC'
    ) THEN
        CREATE POLICY "Admin Update DSC"
        ON storage.objects FOR UPDATE
        TO authenticated
        USING (
          bucket_id = 'daily-shine-carousel' AND
          (SELECT public.has_role(auth.uid(), 'admin'))
        )
        WITH CHECK (
          bucket_id = 'daily-shine-carousel' AND
          (SELECT public.has_role(auth.uid(), 'admin'))
        );
    END IF;

    -- 4. Allow admins to delete objects
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Admin Delete DSC'
    ) THEN
        CREATE POLICY "Admin Delete DSC"
        ON storage.objects FOR DELETE
        TO authenticated
        USING (
          bucket_id = 'daily-shine-carousel' AND
          (SELECT public.has_role(auth.uid(), 'admin'))
        );
    END IF;
END
$$;
