-- Guard against services rows losing their customer_id while attached to an
-- active assignment. Prevents the "0 customers" ghost state where an
-- ACTIVE assignment exists but its services can't be counted.
CREATE OR REPLACE FUNCTION public.enforce_assignment_service_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assignment_id IS NOT NULL AND NEW.customer_id IS NULL THEN
    RAISE EXCEPTION 'services_missing_customer_for_active_assignment'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_services_integrity ON public.services;
CREATE TRIGGER trg_services_integrity
  BEFORE INSERT OR UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.enforce_assignment_service_integrity();

-- Fast lookup index used by the shared today-assignment query on every
-- partner screen; also speeds up validate_today_assignment().
CREATE INDEX IF NOT EXISTS idx_services_assignment_scheduled
  ON public.services (assignment_id, scheduled_date);

-- Server-side callable check. Returns a JSON report the UI can use to show
-- a clear error banner instead of a misleading "0 customers" state.
CREATE OR REPLACE FUNCTION public.validate_today_assignment(p_partner uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_assignment record;
  v_total int := 0;
  v_today_services int := 0;
  v_today_customers int := 0;
  v_missing_customer int := 0;
  v_wrong_partner int := 0;
  v_mismatches text[] := ARRAY[]::text[];
BEGIN
  SELECT id, partner_id, status, end_date
    INTO v_assignment
    FROM public.assignments
   WHERE partner_id = p_partner
     AND status = 'active'
     AND end_date >= v_today
   ORDER BY start_date DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'has_active_assignment', false,
      'mismatches', v_mismatches
    );
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE scheduled_date = v_today),
    count(DISTINCT customer_id) FILTER (WHERE scheduled_date = v_today AND customer_id IS NOT NULL),
    count(*) FILTER (WHERE customer_id IS NULL),
    count(*) FILTER (WHERE partner_id IS NOT NULL AND partner_id <> p_partner)
    INTO v_total, v_today_services, v_today_customers, v_missing_customer, v_wrong_partner
    FROM public.services
   WHERE assignment_id = v_assignment.id;

  IF v_total = 0 THEN
    v_mismatches := array_append(v_mismatches, 'ACTIVE_ASSIGNMENT_HAS_NO_SERVICES');
  END IF;
  IF v_missing_customer > 0 THEN
    v_mismatches := array_append(v_mismatches, 'SERVICES_MISSING_CUSTOMER_ID');
  END IF;
  IF v_wrong_partner > 0 THEN
    v_mismatches := array_append(v_mismatches, 'SERVICES_ASSIGNED_TO_DIFFERENT_PARTNER');
  END IF;

  RETURN jsonb_build_object(
    'ok', array_length(v_mismatches, 1) IS NULL,
    'has_active_assignment', true,
    'assignment_id', v_assignment.id,
    'today_services', v_today_services,
    'today_customers', v_today_customers,
    'total_services', v_total,
    'services_missing_customer', v_missing_customer,
    'services_wrong_partner', v_wrong_partner,
    'mismatches', v_mismatches
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_today_assignment(uuid) TO authenticated, service_role;