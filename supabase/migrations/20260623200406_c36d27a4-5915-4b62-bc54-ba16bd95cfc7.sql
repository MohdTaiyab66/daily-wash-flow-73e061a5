INSERT INTO public.service_catalog (
  slug,
  name,
  description,
  benefits,
  service_type,
  price_hatchback,
  price_sedan_suv,
  duration_minutes,
  sort_order,
  active
) VALUES
  (
    'daily-shine-exterior',
    'Daily Shine · Exterior Wash',
    'Included exterior wash from your Daily Shine plan.',
    ARRAY['Included in Daily Shine plan', 'Exterior rinse and body cleaning', 'Partner photo proof'],
    'custom',
    0,
    0,
    30,
    11,
    true
  ),
  (
    'daily-shine-interior',
    'Daily Shine · Interior Wash',
    'Included interior wash from your Daily Shine plan.',
    ARRAY['Included in Daily Shine plan', 'Interior vacuum and dashboard wipe', 'Partner photo proof'],
    'custom',
    0,
    0,
    45,
    12,
    true
  ),
  (
    'daily-shine-dusting',
    'Daily Shine · Dusting',
    'Included dusting service from your Daily Shine plan.',
    ARRAY['Included in Daily Shine plan', 'Daily dusting touch-up', 'Partner photo proof'],
    'custom',
    0,
    0,
    20,
    13,
    true
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  benefits = EXCLUDED.benefits,
  service_type = EXCLUDED.service_type,
  price_hatchback = EXCLUDED.price_hatchback,
  price_sedan_suv = EXCLUDED.price_sedan_suv,
  duration_minutes = EXCLUDED.duration_minutes,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();