ALTER TABLE public.service_catalog
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'pre'
    CHECK (payment_mode IN ('pre','post'));

ALTER TABLE public.service_addons
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'pre'
    CHECK (payment_mode IN ('pre','post'));