
-- 1. Create service_gallery table
CREATE TABLE IF NOT EXISTS public.service_gallery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_slug TEXT NOT NULL,
    image_url TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_hero BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.service_gallery ENABLE ROW LEVEL SECURITY;

-- 3. Grant Permissions
GRANT SELECT ON public.service_gallery TO authenticated;
GRANT SELECT ON public.service_gallery TO anon;
GRANT ALL ON public.service_gallery TO service_role;

-- 4. Policies
CREATE POLICY "Allow public read for service_gallery" ON public.service_gallery FOR SELECT USING (true);
CREATE POLICY "Admins can manage service_gallery" ON public.service_gallery FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 5. Seed some data for major services (using professional placeholders)
INSERT INTO public.service_gallery (service_slug, image_url, sort_order, is_hero) VALUES
('daily-shine', 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?q=80&w=1920&auto=format&fit=crop', 0, true),
('daily-shine', 'https://images.unsplash.com/photo-1552933529-e359b24772ff?q=80&w=1920&auto=format&fit=crop', 1, false),
('daily-shine', 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?q=80&w=1920&auto=format&fit=crop', 2, false),
('one-time-wash', 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?q=80&w=1920&auto=format&fit=crop', 0, true),
('one-time-wash-no-polish', 'https://images.unsplash.com/photo-1552933529-e359b24772ff?q=80&w=1920&auto=format&fit=crop', 0, true),
('deep-clean', 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?q=80&w=1920&auto=format&fit=crop', 0, true),
('body-polish', 'https://images.unsplash.com/photo-1601362840469-51e4d8d59085?q=80&w=1920&auto=format&fit=crop', 0, true);
