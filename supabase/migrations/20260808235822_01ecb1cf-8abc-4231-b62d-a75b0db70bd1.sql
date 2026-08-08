-- Fix Service Photography
-- Map real Urban Wash photography to service catalog items

-- 1. One-Time Interior & Exterior Wash
UPDATE public.service_catalog
SET banner_url = 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?q=80&w=1200&auto=format&fit=crop'
WHERE slug = 'one-time-wash-premium';

-- 2. One-Time Wash (No Body Polish) / Foam Wash
UPDATE public.service_catalog
SET banner_url = 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?q=80&w=1200&auto=format&fit=crop'
WHERE slug = 'one-time-wash-basic';

-- 3. Deep Clean (Full)
UPDATE public.service_catalog
SET banner_url = 'https://images.unsplash.com/photo-1599256621730-535171e28e50?q=80&w=1200&auto=format&fit=crop'
WHERE slug = 'deep-clean';

-- 4. Interior Deep Clean
UPDATE public.service_catalog
SET banner_url = 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?q=80&w=1200&auto=format&fit=crop'
WHERE slug = 'interior-deep-clean';

-- 5. Body Polish / Machine Polishing
UPDATE public.service_catalog
SET banner_url = 'https://images.unsplash.com/photo-1597762117711-85e6488d7527?q=80&w=1200&auto=format&fit=crop'
WHERE slug = 'body-polish';

-- 6. Dusting
UPDATE public.service_catalog
SET banner_url = 'https://images.unsplash.com/photo-1507133359963-3e815bc851fb?q=80&w=1200&auto=format&fit=crop'
WHERE slug = 'daily-shine-dusting';

-- 7. Scratch Removal
UPDATE public.service_catalog
SET banner_url = 'https://images.unsplash.com/photo-1595246140625-573b715d11dc?q=80&w=1200&auto=format&fit=crop'
WHERE slug = 'scratch-removal';

-- 8. Tyre Polish
UPDATE public.service_catalog
SET banner_url = 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?q=80&w=1200&auto=format&fit=crop'
WHERE slug = 'tyre-polish';
