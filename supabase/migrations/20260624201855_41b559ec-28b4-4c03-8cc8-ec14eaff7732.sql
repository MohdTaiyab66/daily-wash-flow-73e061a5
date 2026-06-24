CREATE OR REPLACE FUNCTION public.trg_service_status_reliability() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.partner_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    PERFORM public.log_reliability_event(NEW.partner_id, 'service_completed', NEW.id, NEW.assignment_id, NULL);
  ELSIF NEW.status = 'skipped' AND (OLD.status IS DISTINCT FROM 'skipped') THEN
    PERFORM public.log_reliability_event(NEW.partner_id, 'missed_service', NEW.id, NEW.assignment_id, NULL);
  END IF;
  RETURN NEW;
END $$;