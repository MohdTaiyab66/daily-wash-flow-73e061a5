REVOKE EXECUTE ON FUNCTION public.admin_revenue_customers() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_revenue_summary() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_customer_payment(uuid, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_parking_issue(uuid, text, text, text, numeric, numeric) FROM anon, PUBLIC;

DROP POLICY IF EXISTS "authenticated read settings" ON public.platform_settings;
DROP POLICY IF EXISTS "admins read settings" ON public.platform_settings;
CREATE POLICY "admins read settings"
  ON public.platform_settings
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admins manage complaints" ON public.complaints;
CREATE POLICY "admins manage complaints"
  ON public.complaints
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));