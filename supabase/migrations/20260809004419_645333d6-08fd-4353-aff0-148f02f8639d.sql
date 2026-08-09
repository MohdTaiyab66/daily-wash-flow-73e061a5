CREATE TABLE IF NOT EXISTS public.service_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_slug TEXT NOT NULL UNIQUE,
    image_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON public.service_images TO authenticated;
GRANT ALL ON public.service_images TO service_role;

ALTER TABLE public.service_images ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'service_images' 
        AND policyname = 'Admins can manage service images'
    ) THEN
        CREATE POLICY "Admins can manage service images"
        ON public.service_images
        FOR ALL
        TO authenticated
        USING (public.has_role(auth.uid(), 'admin'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'service_images' 
        AND policyname = 'Everyone can read published service images'
    ) THEN
        CREATE POLICY "Everyone can read published service images"
        ON public.service_images
        FOR SELECT
        TO authenticated
        USING (status = 'published');
    END IF;
END $$;