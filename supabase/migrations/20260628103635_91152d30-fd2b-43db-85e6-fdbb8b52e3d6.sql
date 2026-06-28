
-- 1) Customer self-read on customers
CREATE POLICY "Customers read own row" ON public.customers
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- 2) Customer self-read on vehicles
CREATE POLICY "Customers read own vehicles" ON public.vehicles
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

-- 3) Restrict partner/customer-visible columns on customers (drop email + payment_status + paid_at)
REVOKE SELECT ON public.customers FROM authenticated;
GRANT SELECT (
  id, full_name, phone, area, address_line, city, pincode,
  latitude, longitude, subscription_plan, subscription_start, subscription_end,
  is_active, created_at, updated_at, preferred_time,
  interior_wash_done_date, interior_wash_partner_id,
  exterior_wash_done_date, exterior_wash_partner_id,
  service_required_before, time_window_type, exact_time
) ON public.customers TO authenticated;

-- 4) Remove customer access to raw partners row; keep self + admin
DROP POLICY IF EXISTS "Partners view assigned subscription customers" ON public.partners;
CREATE POLICY "Partners view own or admin" ON public.partners
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- 5) Safe RPC for customers to look up their assigned partner's public info
CREATE OR REPLACE FUNCTION public.get_assigned_partner_public(p_partner_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  profile_photo_url text,
  rating numeric,
  home_area text,
  partner_code text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.profile_photo_url, p.rating, p.home_area, p.partner_code, p.created_at
  FROM public.partners p
  WHERE p.id = p_partner_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.subscriptions s
        WHERE s.assigned_partner_id = p.id AND s.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.services svc
        WHERE svc.partner_id = p.id AND svc.customer_id = auth.uid()
      )
    );
$$;
REVOKE EXECUTE ON FUNCTION public.get_assigned_partner_public(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_assigned_partner_public(uuid) TO authenticated;

-- 6) Revoke EXECUTE on internal trigger/maintenance SECURITY DEFINER functions
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND (
        p.proname LIKE 'tg\_%' ESCAPE '\'
        OR p.proname LIKE 'trg\_%' ESCAPE '\'
        OR p.proname LIKE 'log\_offer\_%' ESCAPE '\'
        OR p.proname LIKE 'notify\_partners\_%' ESCAPE '\'
        OR p.proname LIKE 'handle\_new\_%' ESCAPE '\'
        OR p.proname IN (
          'guard_partner_self_update',
          'sync_booking_from_service_status',
          'validate_service_photo_gps',
          'apply_reliability_event',
          'cleanup_old_service_photos',
          'sweep_subscription_offers',
          'claim_admin_if_empty',
          '_booking_for_service',
          '_resolve_user_id_for_customer'
        )
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
      r.nspname, r.proname, r.args);
  END LOOP;
END $$;
