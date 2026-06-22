
-- Grant access to bookings and booking_addons (was missing, causing silent insert failures)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_addons TO authenticated;
GRANT ALL ON public.booking_addons TO service_role;

-- Add quantity to booking_addons so customers can add multiple of the same add-on
ALTER TABLE public.booking_addons ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
ALTER TABLE public.booking_addons ADD CONSTRAINT booking_addons_quantity_positive CHECK (quantity >= 1);

-- Add scheduled_time text column for explicit booking time (in addition to preferred_before_time)
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS scheduled_time text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS notes text;
