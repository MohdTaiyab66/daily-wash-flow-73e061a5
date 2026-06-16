
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS front_image_path text;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS service_required_before text;

-- Backfill from preferred_time end (e.g. "06:00 - 09:00" -> "09:00")
UPDATE public.customers
   SET service_required_before = CASE
     WHEN preferred_time IS NULL OR preferred_time = '' THEN '10:00'
     WHEN position('-' in preferred_time) > 0
       THEN trim(split_part(preferred_time, '-', 2))
     ELSE trim(preferred_time)
   END
 WHERE service_required_before IS NULL;

INSERT INTO public.platform_settings(key, value, description) VALUES
  ('route_visibility_until', '"10:00"'::jsonb, 'Until what time partners see today route. Allowed: 10:00, 11:00, 12:00, 13:00, all_day'),
  ('trial_manual_assignment_enabled', 'false'::jsonb, 'When true, admins can create manual assignments bypassing area filter')
ON CONFLICT (key) DO NOTHING;
