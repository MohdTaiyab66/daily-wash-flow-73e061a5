
-- 1. Set fixed search_path on functions missing it
ALTER FUNCTION public.haversine_km(numeric, numeric, numeric, numeric) SET search_path = public;
ALTER FUNCTION public.tg_set_updated_at() SET search_path = public;

-- 2. Revoke EXECUTE from anon/PUBLIC on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.accept_assignment(integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_assignment_v2(integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_assignment(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_customer(uuid, numeric) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_partner() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_assignment_offers() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_available_customers() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.preview_assignment(integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_partner_area(text, numeric, numeric) FROM anon, PUBLIC;

-- 3. Restrict partners self-update to only safe fields via trigger
CREATE OR REPLACE FUNCTION public.guard_partner_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins bypass restrictions
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Only the partner themselves can reach this via RLS; block privileged-field changes
  IF NEW.rate_per_car IS DISTINCT FROM OLD.rate_per_car
     OR NEW.level IS DISTINCT FROM OLD.level
     OR NEW.lifetime_earnings IS DISTINCT FROM OLD.lifetime_earnings
     OR NEW.aadhaar_verified IS DISTINCT FROM OLD.aadhaar_verified
     OR NEW.pan_verified IS DISTINCT FROM OLD.pan_verified
     OR NEW.bank_verified IS DISTINCT FROM OLD.bank_verified
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.id IS DISTINCT FROM OLD.id
  THEN
    RAISE EXCEPTION 'Cannot modify privileged partner fields';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_partner_self_update() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS guard_partner_self_update ON public.partners;
CREATE TRIGGER guard_partner_self_update
  BEFORE UPDATE ON public.partners
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_partner_self_update();

-- 4. platform_settings: restrict reads to authenticated users only
DROP POLICY IF EXISTS "everyone reads settings" ON public.platform_settings;
CREATE POLICY "authenticated read settings"
  ON public.platform_settings
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE SELECT ON public.platform_settings FROM anon;

-- 5. service_analytics: enforce service ownership on insert/update
DROP POLICY IF EXISTS "partner rw own analytics" ON public.service_analytics;

CREATE POLICY "partner select own analytics"
  ON public.service_analytics
  FOR SELECT
  TO authenticated
  USING (partner_id = auth.uid());

CREATE POLICY "partner insert own analytics"
  ON public.service_analytics
  FOR INSERT
  TO authenticated
  WITH CHECK (
    partner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = service_analytics.service_id
        AND s.partner_id = auth.uid()
    )
  );

CREATE POLICY "partner update own analytics"
  ON public.service_analytics
  FOR UPDATE
  TO authenticated
  USING (partner_id = auth.uid())
  WITH CHECK (
    partner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = service_analytics.service_id
        AND s.partner_id = auth.uid()
    )
  );

CREATE POLICY "partner delete own analytics"
  ON public.service_analytics
  FOR DELETE
  TO authenticated
  USING (partner_id = auth.uid());
