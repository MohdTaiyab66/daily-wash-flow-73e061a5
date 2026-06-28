
-- 1. Drop partner direct read on customers (sensitive PII). Partner app uses RPCs for assigned-customer info.
DROP POLICY IF EXISTS "Partners read assigned customers" ON public.customers;

-- 2. Customer self-read on subscription_extensions
DROP POLICY IF EXISTS "Customers read own extensions" ON public.subscription_extensions;
CREATE POLICY "Customers read own extensions"
ON public.subscription_extensions
FOR SELECT
TO authenticated
USING (customer_id = auth.uid());

-- 3. Customers read their own vehicle image from storage
DROP POLICY IF EXISTS "vehicle_images_read_owner_customer" ON storage.objects;
CREATE POLICY "vehicle_images_read_owner_customer"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'vehicle-images'
  AND EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.front_image_path = storage.objects.name
      AND v.customer_id = auth.uid()
  )
);

-- 4. Block partner self-update of privileged columns via trigger.
CREATE OR REPLACE FUNCTION public.enforce_partner_self_update_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin or service role bypass entirely
  IF public.has_role(auth.uid(), 'admin'::app_role) OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only enforce when the partner is updating their own row
  IF NEW.id IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;

  IF NEW.rate_per_car        IS DISTINCT FROM OLD.rate_per_car        THEN RAISE EXCEPTION 'Not allowed to change rate_per_car'; END IF;
  IF NEW.reliability_score   IS DISTINCT FROM OLD.reliability_score   THEN RAISE EXCEPTION 'Not allowed to change reliability_score'; END IF;
  IF NEW.lifetime_earnings   IS DISTINCT FROM OLD.lifetime_earnings   THEN RAISE EXCEPTION 'Not allowed to change lifetime_earnings'; END IF;
  IF NEW.aadhaar_verified    IS DISTINCT FROM OLD.aadhaar_verified    THEN RAISE EXCEPTION 'Not allowed to change aadhaar_verified'; END IF;
  IF NEW.pan_verified        IS DISTINCT FROM OLD.pan_verified        THEN RAISE EXCEPTION 'Not allowed to change pan_verified'; END IF;
  IF NEW.bank_verified       IS DISTINCT FROM OLD.bank_verified       THEN RAISE EXCEPTION 'Not allowed to change bank_verified'; END IF;
  IF NEW.level               IS DISTINCT FROM OLD.level               THEN RAISE EXCEPTION 'Not allowed to change level'; END IF;
  IF NEW.status              IS DISTINCT FROM OLD.status              THEN RAISE EXCEPTION 'Not allowed to change status'; END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_partner_self_update_columns ON public.partners;
CREATE TRIGGER trg_enforce_partner_self_update_columns
BEFORE UPDATE ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.enforce_partner_self_update_columns();

-- 5. Revoke EXECUTE on all SECURITY DEFINER functions in public from anon and PUBLIC.
--    Authenticated callers retain access; functions perform internal role checks.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
      r.nspname, r.proname, r.args);
  END LOOP;
END $$;
