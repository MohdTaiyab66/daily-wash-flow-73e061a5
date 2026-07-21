-- Fix push_tokens ON CONFLICT arbiter mismatch causing all client upserts to fail silently.
UPDATE public.push_tokens SET device_id = '' WHERE device_id IS NULL;
ALTER TABLE public.push_tokens ALTER COLUMN device_id SET DEFAULT '';
ALTER TABLE public.push_tokens ALTER COLUMN device_id SET NOT NULL;
DROP INDEX IF EXISTS public.push_tokens_user_device_app_uidx;
ALTER TABLE public.push_tokens
  ADD CONSTRAINT push_tokens_user_device_app_uidx UNIQUE (user_id, device_id, app);