INSERT INTO public.platform_settings (key, value, description) VALUES
  ('avg_bike_mileage_kmpl', '40'::jsonb, 'Average bike mileage in km/L used for fuel estimates'),
  ('fuel_price_per_litre', '105'::jsonb, 'Fuel price per litre (INR) used for fuel estimates'),
  ('fuel_calc_enabled', 'true'::jsonb, 'Show fuel and net earnings estimates to partners')
ON CONFLICT (key) DO NOTHING;