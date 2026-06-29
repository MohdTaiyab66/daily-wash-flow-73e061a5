-- Allow authenticated users to read platform settings.
-- All keys are operational (rates, timeouts, visibility windows, map prefs, capacity limits).
-- None of them are secrets; the partner/customer apps already need them to render correctly.
-- Writes remain admin-only via the existing "admins write settings" policy.

DROP POLICY IF EXISTS "admins read settings" ON public.platform_settings;
CREATE POLICY "authenticated read settings"
  ON public.platform_settings
  FOR SELECT
  TO authenticated
  USING (true);