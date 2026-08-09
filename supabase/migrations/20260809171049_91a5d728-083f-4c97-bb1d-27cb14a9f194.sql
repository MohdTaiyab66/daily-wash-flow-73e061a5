-- Update any existing records that were accidentally pointing to service-photography
UPDATE public.daily_shine_carousel 
SET bucket_name = 'daily-shine-carousel'
WHERE bucket_name = 'service-photography';

-- Ensure RLS policies exist for the bucket (SQL on storage.objects is allowed)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Public Access for daily-shine-carousel'
    ) THEN
        CREATE POLICY "Public Access for daily-shine-carousel"
        ON storage.objects FOR SELECT
        TO public
        USING (bucket_id = 'daily-shine-carousel');
    END IF;
END $$;
