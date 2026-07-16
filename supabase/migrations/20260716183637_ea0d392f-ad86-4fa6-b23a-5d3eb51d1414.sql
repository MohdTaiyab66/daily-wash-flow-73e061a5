-- 1) Restrict coverage_zone_calendar reads to authenticated users only.
DROP POLICY IF EXISTS "calendar read all" ON public.coverage_zone_calendar;
CREATE POLICY "calendar read authenticated"
  ON public.coverage_zone_calendar
  FOR SELECT
  TO authenticated
  USING (true);

-- 2) Force existing views to run with the caller's permissions (RLS applies to
--    the caller, not the view creator). Postgres defaults to security_invoker=off
--    which behaves like SECURITY DEFINER for views.
ALTER VIEW public.marketplace_delivery_stats SET (security_invoker = true);
ALTER VIEW public.admin_gps_health SET (security_invoker = true);