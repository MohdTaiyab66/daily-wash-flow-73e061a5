
-- coverage_zones: restrict SELECT to admins only
DROP POLICY IF EXISTS "Anyone can read zones" ON public.coverage_zones;
CREATE POLICY "Admins can read zones"
ON public.coverage_zones
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- platform_settings: restrict broad read; allow whitelist for authenticated
DROP POLICY IF EXISTS "authenticated read settings" ON public.platform_settings;

CREATE POLICY "Admins read all settings"
ON public.platform_settings
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated read whitelisted settings"
ON public.platform_settings
FOR SELECT
TO authenticated
USING (key = ANY (ARRAY[
  'min_cars_required','max_cars_allowed','rate_per_car',
  'min_hours_per_day','max_hours_per_day','cars_per_hour',
  'minutes_per_car','fuel_cost_per_car','start_time_rules','weekly_off_day',
  'avg_bike_mileage_kmpl','fuel_price_per_litre','fuel_calc_enabled',
  'assignment_min_days','assignment_max_days','assignment_default_days',
  'route_visibility_hours'
]));
