DROP VIEW IF EXISTS public.waiting_partners_view;

CREATE OR REPLACE VIEW public.waiting_partners_view AS
SELECT 
    p.id as partner_id,
    p.full_name,
    p.phone,
    p.home_area,
    p.availability as partner_availability,
    a.id as assignment_id,
    a.target_cars as customer_target,
    a.fulfilled_cars as assigned_customers,
    (SELECT count(*) FROM public.services s WHERE s.assignment_id = a.id AND s.status = 'pending') as current_availability,
    a.expected_start_time as working_hours,
    a.duration_days as commitment_days,
    a.created_at as assignment_created,
    a.sub_status,
    a.status as assignment_status
FROM public.assignments a
JOIN public.partners p ON p.id = a.partner_id
WHERE a.status = 'active';

GRANT SELECT ON public.waiting_partners_view TO authenticated;
GRANT SELECT ON public.waiting_partners_view TO service_role;

-- 2. Function to allow Admin to explicitly query "Waiting for Work"
CREATE OR REPLACE FUNCTION public.get_waiting_for_work_partners()
RETURNS SETOF public.waiting_partners_view
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.waiting_partners_view 
  WHERE sub_status = 'waiting_for_customers' 
    AND partner_availability = 'online';
$$;

GRANT EXECUTE ON FUNCTION public.get_waiting_for_work_partners() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_waiting_for_work_partners() TO service_role;

-- 3. Logic to handle "Future Customer Matching"
CREATE OR REPLACE FUNCTION public.trg_fn_activate_waiting_assignment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assignment_id IS NOT NULL THEN
    UPDATE public.assignments
    SET sub_status = 'customers_available',
        last_modified_at = now()
    WHERE id = NEW.assignment_id 
      AND sub_status = 'waiting_for_customers';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_activate_waiting_assignment ON public.services;
CREATE TRIGGER trg_activate_waiting_assignment
AFTER INSERT OR UPDATE OF assignment_id ON public.services
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_activate_waiting_assignment();
