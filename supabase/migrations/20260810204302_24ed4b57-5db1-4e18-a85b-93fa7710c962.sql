-- 1. Extend service_catalog to support multiple images and structured inclusions/benefits
ALTER TABLE public.service_catalog 
ADD COLUMN IF NOT EXISTS gallery_images text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS inclusions_json jsonb DEFAULT '[]',
ADD COLUMN IF NOT EXISTS benefits_json jsonb DEFAULT '[]';

-- 2. Extend service_addons to support images
ALTER TABLE public.service_addons
ADD COLUMN IF NOT EXISTS image_path text;

-- 3. Update existing data to have proper structure for testing
UPDATE public.service_catalog 
SET gallery_images = ARRAY['https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?q=80&w=1600&auto=format&fit=crop', 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?q=80&w=1600&auto=format&fit=crop']
WHERE gallery_images = '{}' OR gallery_images IS NULL;

-- 4. Inclusions mapping for Daily Shine
UPDATE public.service_catalog
SET inclusions_json = '[
  {"label": "Daily Exterior Cleaning", "icon": "exterior"},
  {"label": "Doorstep Service", "icon": "doorstep"},
  {"label": "Scheduled Service", "icon": "schedule"},
  {"label": "Quality Assurance", "icon": "quality"}
]'
WHERE slug = 'daily-shine';

-- 5. Inclusions mapping for One-Time Wash
UPDATE public.service_catalog
SET inclusions_json = '[
  {"label": "Exterior Wash", "icon": "exterior"},
  {"label": "Tyre & Rim Cleaning", "icon": "tyre"},
  {"label": "Glass Cleaning", "icon": "glass"},
  {"label": "Drying & Finishing", "icon": "dry"}
]'
WHERE slug = 'one-time-wash';

-- 6. Inclusions mapping for One-Time Interior & Exterior
UPDATE public.service_catalog
SET inclusions_json = '[
  {"label": "Exterior Wash", "icon": "exterior"},
  {"label": "Tyre & Rim Cleaning", "icon": "tyre"},
  {"label": "Interior Cleaning", "icon": "interior"},
  {"label": "Dashboard Polish", "icon": "dashboard"},
  {"label": "Drying & Finishing", "icon": "dry"}
]'
WHERE slug = 'one-time-interior-exterior-wash';

-- Add grants (Safety)
GRANT SELECT ON public.service_catalog TO authenticated;
GRANT SELECT ON public.service_catalog TO anon;
GRANT SELECT ON public.service_addons TO authenticated;
GRANT SELECT ON public.service_addons TO anon;