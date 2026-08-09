-- 1. Create the table for Daily Shine carousel slides
CREATE TABLE public.daily_shine_carousel (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slide_number integer NOT NULL,
    image_url text NOT NULL,
    status text NOT NULL DEFAULT 'published',
    service_slug text,
    title text,
    subtitle text,
    updated_at timestamptz DEFAULT now(),
    UNIQUE (slide_number)
);

-- 2. Grant permissions
GRANT SELECT ON public.daily_shine_carousel TO authenticated;
GRANT SELECT ON public.daily_shine_carousel TO anon;
GRANT ALL ON public.daily_shine_carousel TO service_role;

-- 3. Enable RLS
ALTER TABLE public.daily_shine_carousel ENABLE ROW LEVEL SECURITY;

-- 4. Policies
CREATE POLICY "Public read for published slides"
    ON public.daily_shine_carousel FOR SELECT
    USING (status = 'published');

CREATE POLICY "Admins can do everything"
    ON public.daily_shine_carousel FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. Storage Policies (Bucket created via tool)
CREATE POLICY "Public Access DSC" ON storage.objects FOR SELECT TO public USING (bucket_id = 'daily-shine-carousel');
CREATE POLICY "Admin Upload DSC" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'daily-shine-carousel' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin Update DSC" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'daily-shine-carousel' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin Delete DSC" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'daily-shine-carousel' AND public.has_role(auth.uid(), 'admin'));
