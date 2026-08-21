-- 1) Remove all stale trial/dummy tokens to force real-device registration
DELETE FROM public.push_tokens 
WHERE token ILIKE 'TRIAL-FCM%' 
   OR token ILIKE 'dummy%' 
   OR token ILIKE 'mock%';

-- 2) Fix partners with missing home_zone_id but valid home_area
-- 'Gomti Nagar' is the primary cluster used in trial seeding.
-- Using the canonical zone ID for Gomti Nagar (ecdc7f41-71f9-4d4f-b110-8bc7bfe586b6)
UPDATE public.partners 
SET home_zone_id = 'ecdc7f41-71f9-4d4f-b110-8bc7bfe586b6'::uuid
WHERE home_zone_id IS NULL 
  AND (home_area = 'Gomti Nagar' OR home_area IS NULL OR home_area = '');

-- Ensure every active partner has a zone, defaulting to the Lucknow cluster if missing
UPDATE public.partners 
SET home_zone_id = 'ecdc7f41-71f9-4d4f-b110-8bc7bfe586b6'::uuid,
    home_area = 'Gomti Nagar'
WHERE home_zone_id IS NULL AND status = 'active';

-- 3) Audit and confirm
SELECT count(*) as stale_tokens_remaining FROM public.push_tokens WHERE token ILIKE 'TRIAL-FCM%';
SELECT count(*) as partners_without_zone FROM public.partners WHERE home_zone_id IS NULL AND status = 'active';
