DROP POLICY IF EXISTS "Partners view assigned subscription customers" ON public.partners;
CREATE POLICY "Partners view assigned subscription customers"
  ON public.partners FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.assigned_partner_id = partners.id
        AND s.user_id = auth.uid()
    )
  );

REVOKE EXECUTE ON FUNCTION public.activate_paid_booking(uuid, text, text, text, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_paid_booking(uuid, text, text, text, jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ensure_ops_customer_for_booking(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_ops_customer_for_booking(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.respond_subscription_offer(uuid, boolean) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_subscription_offer(uuid, boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.enqueue_subscription_booking(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_subscription_booking(uuid) TO authenticated, service_role;