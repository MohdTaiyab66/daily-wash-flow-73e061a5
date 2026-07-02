UPDATE public.platform_settings SET value = to_jsonb(36) WHERE key = 'max_cars_allowed';
INSERT INTO public.platform_settings (key, value, description)
SELECT 'max_cars_allowed', to_jsonb(36), 'Max cars per day allowed in an assignment'
WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'max_cars_allowed');