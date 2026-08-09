DO $$
BEGIN
    -- service-photography policies
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Photography' AND tablename = 'objects' AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Public Access Photography" ON storage.objects
        FOR SELECT TO public USING (bucket_id = 'service-photography');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Admin All Photography' AND tablename = 'objects' AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Admin All Photography" ON storage.objects
        FOR ALL TO authenticated USING (bucket_id = 'service-photography');
    END IF;

    -- daily-shine-carousel policies
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Public Access Carousel' AND tablename = 'objects' AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Public Access Carousel" ON storage.objects
        FOR SELECT TO public USING (bucket_id = 'daily-shine-carousel');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Admin All Carousel' AND tablename = 'objects' AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Admin All Carousel" ON storage.objects
        FOR ALL TO authenticated USING (bucket_id = 'daily-shine-carousel');
    END IF;
END
$$;