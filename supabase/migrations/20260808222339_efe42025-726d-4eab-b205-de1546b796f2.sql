
CREATE TABLE IF NOT EXISTS public.daily_shine_promo_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID REFERENCES public.service_catalog(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    title TEXT,
    subtitle TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_shine_promo_images TO authenticated;
GRANT ALL ON public.daily_shine_promo_images TO service_role;

ALTER TABLE public.daily_shine_promo_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything on promo images"
ON public.daily_shine_promo_images
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone authenticated can view active published promo images"
ON public.daily_shine_promo_images
FOR SELECT
TO authenticated
USING (is_active = true AND status = 'published');
