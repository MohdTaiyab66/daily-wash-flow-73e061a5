CREATE TABLE public.service_images (
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

CREATE POLICY "Admins can manage service images"
ON public.service_images
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Everyone can read published service images"
ON public.service_images
FOR SELECT
TO authenticated
USING (status = 'published');
