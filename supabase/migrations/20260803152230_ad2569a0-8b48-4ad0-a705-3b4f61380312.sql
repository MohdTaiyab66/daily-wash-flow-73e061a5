INSERT INTO public.platform_settings (key, value, description)
VALUES ('prepayment_required', 'true'::jsonb, 'When ON, customers must complete and verify payment before a paid booking is confirmed. When OFF, bookings are confirmed and payment is collected later.')
ON CONFLICT (key) DO NOTHING;