-- Create storage bucket for service images if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-photography', 'service-photography', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for storage
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Public Read Access' AND tablename = 'objects' AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Public Read Access"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'service-photography');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Admin Full Access' AND tablename = 'objects' AND schemaname = 'storage'
    ) THEN
        CREATE POLICY "Admin Full Access"
        ON storage.objects FOR ALL
        TO authenticated
        USING (
          bucket_id = 'service-photography' 
          AND (public.has_role(auth.uid(), 'admin'))
        )
        WITH CHECK (
          bucket_id = 'service-photography'
          AND (public.has_role(auth.uid(), 'admin'))
        );
    END IF;
END
$$;
