CREATE OR REPLACE FUNCTION public.tg_customer_vehicles_promote_after_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_default IS TRUE THEN
    UPDATE public.customer_vehicles
    SET is_default = TRUE
    WHERE id = (
      SELECT id FROM public.customer_vehicles
      WHERE user_id = OLD.user_id
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    )
    AND is_default IS DISTINCT FROM TRUE;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_vehicles_promote_after_delete ON public.customer_vehicles;
CREATE TRIGGER trg_customer_vehicles_promote_after_delete
AFTER DELETE ON public.customer_vehicles
FOR EACH ROW
EXECUTE FUNCTION public.tg_customer_vehicles_promote_after_delete();