CREATE OR REPLACE FUNCTION public.tg_services_vehicle_scoped_coverage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_has_booking boolean;
  v_rate numeric;
BEGIN
  IF NEW.status <> 'covered_by_booking'::public.service_status OR NEW.vehicle_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.bookings b
      JOIN public.service_catalog sc ON sc.id = b.service_id
      JOIN public.customer_profiles cp ON cp.user_id = b.user_id
      JOIN public.customers c
        ON c.id = NEW.customer_id
       AND (
            (c.phone IS NOT NULL AND cp.phone IS NOT NULL AND c.phone = cp.phone)
         OR (c.email IS NOT NULL AND cp.email IS NOT NULL AND lower(c.email) = lower(cp.email))
       )
     WHERE b.scheduled_date = NEW.scheduled_date
       AND b.status NOT IN ('cancelled','failed')
       AND sc.category IN ('one_time','deep_clean','premium')
       AND (b.vehicle_id IS NULL OR b.vehicle_id = NEW.vehicle_id)
  ) INTO v_has_booking;

  IF v_has_booking THEN
    RETURN NEW;
  END IF;

  -- This vehicle is NOT covered by a booking: it must appear as a normal stop.
  SELECT rate_per_car INTO v_rate FROM public.assignments WHERE id = NEW.assignment_id;
  IF v_rate IS NULL OR v_rate = 0 THEN
    SELECT COALESCE((value::text)::numeric, 17) INTO v_rate
      FROM public.platform_settings WHERE key = 'rate_per_car';
  END IF;

  NEW.status := 'pending'::public.service_status;
  NEW.delay_reason := NULL;
  NEW.rate_per_car := COALESCE(NULLIF(NEW.rate_per_car, 0), v_rate, 17);
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_services_vehicle_scoped_coverage ON public.services;
CREATE TRIGGER trg_services_vehicle_scoped_coverage
BEFORE INSERT OR UPDATE OF status ON public.services
FOR EACH ROW EXECUTE FUNCTION public.tg_services_vehicle_scoped_coverage();
