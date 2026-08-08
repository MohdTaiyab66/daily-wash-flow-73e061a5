CREATE TABLE public.daily_shine_promo_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url TEXT NOT NULL,
    title TEXT,
    subtitle TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT ON public.daily_shine_promo_images TO anon, authenticated;
GRANT ALL ON public.daily_shine_promo_images TO service_role;

ALTER TABLE public.daily_shine_promo_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read-only access to active promo images"
ON public.daily_shine_promo_images
FOR SELECT
USING (is_active = true);

-- Seed initial promo content
INSERT INTO public.daily_shine_promo_images (image_url, title, subtitle, sort_order)
VALUES 
('https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?q=80&w=1200&auto=format&fit=crop', 'Your car, clean every morning.', 'Doorstep detailing without the hassle.', 1),
('https://images.unsplash.com/photo-1599256631168-1cf0a544838b?q=80&w=1200&auto=format&fit=crop', 'Wake up to a cleaner car.', 'Daily doorstep cleaning before your day begins.', 2),
('https://images.unsplash.com/photo-1607860108855-64acf2078ed9?q=80&w=1200&auto=format&fit=crop', 'No waiting. No car wash trips.', 'We clean it at your doorstep.', 3);
