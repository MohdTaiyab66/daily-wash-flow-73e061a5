-- Enforce "NO PAYMENT = NO SERVICE" at the database level.
-- A subscription row can only exist when its linked booking is paid.
-- This is defense-in-depth: existing triggers already gate creation, but
-- this validation blocks any bug or ad-hoc SQL from activating a
-- subscription before payment succeeds.

CREATE OR REPLACE FUNCTION public.tg_subscription_requires_paid_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_pay text;
BEGIN
  -- Terminal states are always allowed (post-hoc bookkeeping).
  IF NEW.status IN ('cancelled','expired','refunded','payment_failed') THEN
    RETURN NEW;
  END IF;

  IF NEW.booking_id IS NULL THEN
    RAISE EXCEPTION 'Subscription requires a booking_id (NO PAYMENT = NO SERVICE)';
  END IF;

  SELECT payment_status INTO v_pay
  FROM public.bookings
  WHERE id = NEW.booking_id;

  IF v_pay IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'Cannot create/activate subscription for booking % — payment_status is % (NO PAYMENT = NO SERVICE)',
      NEW.booking_id, COALESCE(v_pay, 'missing');
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_subscription_requires_paid_booking ON public.subscriptions;
CREATE TRIGGER trg_subscription_requires_paid_booking
BEFORE INSERT OR UPDATE OF status, booking_id ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.tg_subscription_requires_paid_booking();
