
INSERT INTO public.platform_settings (key, value) VALUES
  ('min_hours_per_day', '2'::jsonb),
  ('max_hours_per_day', '6'::jsonb),
  ('cars_per_hour', '6'::jsonb),
  ('minutes_per_car', '10'::jsonb),
  ('fuel_cost_per_car', '1.4'::jsonb),
  ('weekly_off_day', '"monday"'::jsonb),
  ('start_time_rules',
   '[{"max_cars":15,"start_time":"07:00"},{"max_cars":20,"start_time":"06:30"},{"max_cars":25,"start_time":"06:00"},{"max_cars":30,"start_time":"05:30"},{"max_cars":36,"start_time":"05:00"}]'::jsonb)
ON CONFLICT (key) DO NOTHING;
