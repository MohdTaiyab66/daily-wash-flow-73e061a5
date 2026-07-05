
-- ============================================================
-- Vehicle integrity: backfill, hard checks, trace log
-- ============================================================

-- 1a. Backfill add-on request labels
UPDATE public.subscription_addon_requests r
SET vehicle_label = concat_ws(' ', cv.make, cv.model, NULLIF(cv.registration_number, ''))
FROM public.customer_vehicles cv
WHERE r.vehicle_id = cv.id
  AND (r.vehicle_label IS DISTINCT FROM concat_ws(' ', cv.make, cv.model, NULLIF(cv.registration_number, '')));

-- 1b. Backfill services.vehicle_id where it doesn't match the source booking's car
WITH matched AS (
  SELECT s.id AS service_id, v.id AS new_vehicle_id
  FROM public.services s
  JOIN public.bookings b ON b.ops_service_id = s.id
  JOIN public.customer_vehicles cv ON cv.id = b.vehicle_id
  JOIN public.vehicles v
    ON v.customer_id = s.customer_id
   AND lower(regexp_replace(v.registration_number, '\s+', '', 'g'))
     = lower(regexp_replace(cv.registration_number, '\s+', '', 'g'))
  WHERE s.vehicle_id IS DISTINCT FROM v.id
)
UPDATE public.services s
SET vehicle_id = m.new_vehicle_id
FROM matched m
WHERE s.id = m.service_id;

-- 2. Trigger: bookings.vehicle_id must belong to bookings.user_id
CREATE OR REPLACE FUNCTION public.tg_bookings_enforce_vehicle_owner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_owner uuid;
BEGIN
  IF NEW.vehicle_id IS NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO v_owner FROM public.customer_vehicles WHERE id = NEW.vehicle_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'vehicle_mismatch: booking % references unknown vehicle %', NEW.id, NEW.vehicle_id;
  END IF;
  IF v_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'vehicle_mismatch: booking %.user_id % does not own vehicle % (owned by %)',
      NEW.id, NEW.user_id, NEW.vehicle_id, v_owner;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bookings_enforce_vehicle_owner ON public.bookings;
CREATE TRIGGER trg_bookings_enforce_vehicle_owner
  BEFORE INSERT OR UPDATE OF vehicle_id, user_id ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_bookings_enforce_vehicle_owner();

-- 3. Trigger: subscription_addon_requests.vehicle_id must belong to user_id
CREATE OR REPLACE FUNCTION public.tg_addon_enforce_vehicle_owner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_owner uuid; v_label text;
BEGIN
  IF NEW.vehicle_id IS NULL THEN RETURN NEW; END IF;
  SELECT user_id, concat_ws(' ', make, model, NULLIF(registration_number, ''))
    INTO v_owner, v_label
  FROM public.customer_vehicles WHERE id = NEW.vehicle_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'vehicle_mismatch: addon_request % references unknown vehicle %', NEW.id, NEW.vehicle_id;
  END IF;
  IF v_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'vehicle_mismatch: addon_request %.user_id % does not own vehicle % (owned by %)',
      NEW.id, NEW.user_id, NEW.vehicle_id, v_owner;
  END IF;
  NEW.vehicle_label := v_label;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_addon_enforce_vehicle_owner ON public.subscription_addon_requests;
CREATE TRIGGER trg_addon_enforce_vehicle_owner
  BEFORE INSERT OR UPDATE OF vehicle_id, user_id ON public.subscription_addon_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_addon_enforce_vehicle_owner();

-- 4. Trigger: services.vehicle_id must be an ops vehicle owned by services.customer_id
CREATE OR REPLACE FUNCTION public.tg_services_enforce_vehicle_owner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_owner uuid;
BEGIN
  SELECT customer_id INTO v_owner FROM public.vehicles WHERE id = NEW.vehicle_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'vehicle_mismatch: service % references unknown ops vehicle %', NEW.id, NEW.vehicle_id;
  END IF;
  IF v_owner <> NEW.customer_id THEN
    RAISE EXCEPTION 'vehicle_mismatch: service %.customer_id % does not own ops vehicle % (owned by %)',
      NEW.id, NEW.customer_id, NEW.vehicle_id, v_owner;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_services_enforce_vehicle_owner ON public.services;
CREATE TRIGGER trg_services_enforce_vehicle_owner
  BEFORE INSERT OR UPDATE OF vehicle_id, customer_id ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.tg_services_enforce_vehicle_owner();

-- 5. Vehicle trace log
CREATE TABLE IF NOT EXISTS public.vehicle_trace_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN (
    'customer_schedule','admin_render','activate_booking',
    'create_addon','route_generate','trigger_reject','ops_sync'
  )),
  booking_id uuid,
  service_id uuid,
  addon_request_id uuid,
  vehicle_id uuid,
  customer_id uuid,
  actor_user_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vehicle_trace_log TO authenticated;
GRANT ALL ON public.vehicle_trace_log TO service_role;

ALTER TABLE public.vehicle_trace_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read vehicle trace log" ON public.vehicle_trace_log;
CREATE POLICY "Admins can read vehicle trace log"
  ON public.vehicle_trace_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_vehicle_trace_booking ON public.vehicle_trace_log(booking_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_trace_created ON public.vehicle_trace_log(created_at DESC);

-- 6. RPC used by clients
CREATE OR REPLACE FUNCTION public.log_vehicle_trace(
  p_source text,
  p_booking_id uuid DEFAULT NULL,
  p_service_id uuid DEFAULT NULL,
  p_addon_request_id uuid DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.vehicle_trace_log(
    source, booking_id, service_id, addon_request_id, vehicle_id, customer_id, actor_user_id, payload
  ) VALUES (
    p_source, p_booking_id, p_service_id, p_addon_request_id, p_vehicle_id, p_customer_id, auth.uid(),
    COALESCE(p_payload, '{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.log_vehicle_trace(text,uuid,uuid,uuid,uuid,uuid,jsonb) TO authenticated;

-- 7. Admin audit view
CREATE OR REPLACE VIEW public.v_vehicle_audit AS
SELECT
  s.id                    AS service_id,
  s.scheduled_date,
  s.customer_id,
  c.full_name             AS customer_name,
  s.vehicle_id            AS service_vehicle_id,
  ov.make                 AS service_make,
  ov.model                AS service_model,
  ov.registration_number  AS service_reg,
  b.id                    AS booking_id,
  b.vehicle_id            AS booking_vehicle_id,
  cv.make                 AS booking_make,
  cv.model                AS booking_model,
  cv.registration_number  AS booking_reg,
  (
    b.id IS NOT NULL AND (
      lower(regexp_replace(coalesce(ov.registration_number,''), '\s+','', 'g'))
      IS DISTINCT FROM
      lower(regexp_replace(coalesce(cv.registration_number,''), '\s+','', 'g'))
    )
  )                       AS mismatch,
  s.created_at
FROM public.services s
LEFT JOIN public.customers c ON c.id = s.customer_id
LEFT JOIN public.vehicles ov ON ov.id = s.vehicle_id
LEFT JOIN public.bookings b ON b.ops_service_id = s.id
LEFT JOIN public.customer_vehicles cv ON cv.id = b.vehicle_id;

GRANT SELECT ON public.v_vehicle_audit TO authenticated;
