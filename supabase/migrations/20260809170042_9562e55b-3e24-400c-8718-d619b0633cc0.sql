ALTER TABLE public.daily_shine_carousel ADD COLUMN IF NOT EXISTS bucket_name TEXT DEFAULT 'service-photography';
UPDATE public.daily_shine_carousel SET bucket_name = 'service-photography';
GRANT ALL ON public.daily_shine_carousel TO authenticated;
GRANT ALL ON public.daily_shine_carousel TO service_role;
GRANT SELECT ON public.daily_shine_carousel TO anon;
