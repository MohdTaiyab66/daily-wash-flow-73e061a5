
-- 1) Revoke EXECUTE on SECURITY DEFINER claim_admin_if_empty from anon
REVOKE EXECUTE ON FUNCTION public.claim_admin_if_empty() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_admin_if_empty() TO authenticated;

-- 2) Fix RLS policy always true on area_waitlist
DROP POLICY IF EXISTS aw_public_insert ON public.area_waitlist;
CREATE POLICY aw_public_insert ON public.area_waitlist
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    phone ~ '^[0-9]{10}$'
    AND area IS NOT NULL AND length(trim(area)) BETWEEN 2 AND 80
    AND (full_name IS NULL OR length(trim(full_name)) <= 80)
  );

-- 3) Customers can read their own complaints
DROP POLICY IF EXISTS "Customers read own complaints" ON public.complaints;
CREATE POLICY "Customers read own complaints" ON public.complaints
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

-- 4) Restrict partner over-read on customers: only customers with a service today or future
DROP POLICY IF EXISTS "Partners read assigned customers" ON public.customers;
CREATE POLICY "Partners read assigned customers" ON public.customers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.customer_id = customers.id
        AND s.partner_id = auth.uid()
        AND s.scheduled_date >= CURRENT_DATE
        AND s.status IN ('pending','in_progress')
    )
  );

-- 5) Partners cannot self-update sensitive financial / verification / role fields.
-- Use column-level privileges; trigger guard remains as defense in depth.
REVOKE UPDATE ON public.partners FROM authenticated;
GRANT UPDATE (
  full_name, phone, email, preferred_language, notify_when_customers_added,
  home_area, home_lat, home_lng, previous_area, area_locked_until, area_change_count,
  cars_selected, first_assignment_completed, updated_at
) ON public.partners TO authenticated;

-- 6) Remove platform_settings from Realtime publication (admins-only data)
ALTER PUBLICATION supabase_realtime DROP TABLE public.platform_settings;

-- 7) realtime.messages — default deny, then narrow allow rules.
-- Scope: a topic can be subscribed to only by the partner who owns it (topic 'partner:<uuid>')
-- or by admins. All other topics are blocked.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='realtime' AND table_name='messages') THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "rt_admin_all" ON realtime.messages';
    EXECUTE $p$CREATE POLICY "rt_admin_all" ON realtime.messages
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role))$p$;

    EXECUTE 'DROP POLICY IF EXISTS "rt_partner_own_topic" ON realtime.messages';
    EXECUTE $p$CREATE POLICY "rt_partner_own_topic" ON realtime.messages
      FOR SELECT TO authenticated
      USING (
        realtime.topic() = 'partner:' || auth.uid()::text
        OR realtime.topic() = 'customer:' || auth.uid()::text
      )$p$;
  END IF;
END $$;

-- 8) vehicles table: admins can manage (table is partner/admin-only; customers use customer_vehicles)
DROP POLICY IF EXISTS "Admins manage vehicles" ON public.vehicles;
CREATE POLICY "Admins manage vehicles" ON public.vehicles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
