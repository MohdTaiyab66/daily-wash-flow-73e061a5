
-- =============================================================
-- Pipeline safeguard triggers — enforce paid-only propagation
-- =============================================================

-- 1) subscription_assignment_queue: must reference a paid booking
CREATE OR REPLACE FUNCTION public.tg_queue_requires_paid_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_pay text;
BEGIN
  IF NEW.booking_id IS NULL THEN
    RAISE EXCEPTION 'Assignment queue requires a booking_id (NO PAYMENT = NO SERVICE)';
  END IF;
  SELECT payment_status INTO v_pay FROM public.bookings WHERE id = NEW.booking_id;
  IF v_pay IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'Cannot enqueue booking % — payment_status is % (NO PAYMENT = NO SERVICE)',
      NEW.booking_id, COALESCE(v_pay, 'missing');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_queue_requires_paid_booking ON public.subscription_assignment_queue;
CREATE TRIGGER trg_queue_requires_paid_booking
BEFORE INSERT ON public.subscription_assignment_queue
FOR EACH ROW EXECUTE FUNCTION public.tg_queue_requires_paid_booking();


-- 2) subscription_offers: queue's booking must be paid
CREATE OR REPLACE FUNCTION public.tg_offer_requires_paid_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_pay text; v_booking uuid;
BEGIN
  SELECT q.booking_id, b.payment_status
    INTO v_booking, v_pay
    FROM public.subscription_assignment_queue q
    LEFT JOIN public.bookings b ON b.id = q.booking_id
    WHERE q.id = NEW.queue_id;
  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'Offer % references queue % with no booking (NO PAYMENT = NO SERVICE)', NEW.id, NEW.queue_id;
  END IF;
  IF v_pay IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'Cannot create offer for queue % — booking % payment_status is % (NO PAYMENT = NO SERVICE)',
      NEW.queue_id, v_booking, COALESCE(v_pay, 'missing');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_offer_requires_paid_booking ON public.subscription_offers;
CREATE TRIGGER trg_offer_requires_paid_booking
BEFORE INSERT ON public.subscription_offers
FOR EACH ROW EXECUTE FUNCTION public.tg_offer_requires_paid_booking();


-- 3) partner_notifications: if metadata references a booking, it must be paid.
--    We do NOT hard-require booking_id (attendance/wallet notifications are legit).
CREATE OR REPLACE FUNCTION public.tg_partner_notification_requires_paid_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_txt text;
  v_booking uuid;
  v_pay text;
BEGIN
  v_booking_txt := NULLIF(NEW.metadata->>'booking_id', '');
  IF v_booking_txt IS NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_booking := v_booking_txt::uuid;
  EXCEPTION WHEN others THEN
    RETURN NEW;  -- non-UUID metadata, ignore
  END;
  SELECT payment_status INTO v_pay FROM public.bookings WHERE id = v_booking;
  IF v_pay IS NULL THEN
    RETURN NEW;  -- booking doesn't exist (soft) — do not block generic notifications
  END IF;
  IF v_pay <> 'paid' THEN
    RAISE EXCEPTION 'Refusing partner_notification for unpaid booking % (payment_status=%) — NO PAYMENT = NO SERVICE',
      v_booking, v_pay;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_partner_notification_requires_paid_booking ON public.partner_notifications;
CREATE TRIGGER trg_partner_notification_requires_paid_booking
BEFORE INSERT ON public.partner_notifications
FOR EACH ROW EXECUTE FUNCTION public.tg_partner_notification_requires_paid_booking();


-- 4) marketplace_broadcasts: if a booking is linked, it must be paid;
--    otherwise, if only a subscription is linked, it must be in an active state
--    (which already implies a paid booking via trg_subscription_requires_paid_booking).
CREATE OR REPLACE FUNCTION public.tg_marketplace_broadcast_requires_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_pay text; v_sub_status text; v_booking uuid;
BEGIN
  v_booking := NEW.booking_id;
  IF v_booking IS NULL AND NEW.subscription_id IS NOT NULL THEN
    SELECT booking_id, status INTO v_booking, v_sub_status
    FROM public.subscriptions WHERE id = NEW.subscription_id;
  END IF;

  IF v_booking IS NOT NULL THEN
    SELECT payment_status INTO v_pay FROM public.bookings WHERE id = v_booking;
    IF v_pay IS DISTINCT FROM 'paid' THEN
      RAISE EXCEPTION 'Cannot open marketplace broadcast for booking % — payment_status is % (NO PAYMENT = NO SERVICE)',
        v_booking, COALESCE(v_pay, 'missing');
    END IF;
  ELSIF v_sub_status IS NOT NULL AND v_sub_status NOT IN ('active','awaiting_partner_assignment','assigned') THEN
    RAISE EXCEPTION 'Cannot open marketplace broadcast — subscription % status is % (NO PAYMENT = NO SERVICE)',
      NEW.subscription_id, v_sub_status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_marketplace_broadcast_requires_paid ON public.marketplace_broadcasts;
CREATE TRIGGER trg_marketplace_broadcast_requires_paid
BEFORE INSERT ON public.marketplace_broadcasts
FOR EACH ROW EXECUTE FUNCTION public.tg_marketplace_broadcast_requires_paid();


-- =============================================================
-- Diagnostic view: paid-pipeline timeline for every booking
-- =============================================================
CREATE OR REPLACE VIEW public.v_payment_pipeline_timeline AS
SELECT
  b.id                                   AS booking_id,
  b.user_id,
  b.payment_status,
  b.status                               AS booking_status,
  b.created_at                           AS t_payment_started,
  p.updated_at                           AS t_payment_verified,
  s.id                                   AS subscription_id,
  s.status                               AS subscription_status,
  s.created_at                           AS t_subscription_activated,
  q.id                                   AS queue_id,
  q.status                               AS queue_status,
  q.created_at                           AS t_queue_created,
  o.id                                   AS first_offer_id,
  o.partner_id                           AS first_offer_partner_id,
  o.offered_at                           AS t_offer_created,
  o.response                             AS first_offer_response,
  o.responded_at                         AS t_offer_responded,
  n.created_at                           AS t_partner_notified,
  CASE
    WHEN q.id IS NOT NULL AND b.payment_status <> 'paid' THEN 'FAILED: queue exists for unpaid booking'
    WHEN o.id IS NOT NULL AND b.payment_status <> 'paid' THEN 'FAILED: offer exists for unpaid booking'
    WHEN n.id IS NOT NULL AND b.payment_status <> 'paid' THEN 'FAILED: partner notified for unpaid booking'
    WHEN b.payment_status = 'paid' THEN 'OK'
    ELSE 'PENDING'
  END                                    AS integrity_status
FROM public.bookings b
LEFT JOIN public.payments p             ON p.booking_id = b.id AND p.status = 'captured'
LEFT JOIN public.subscriptions s        ON s.booking_id = b.id
LEFT JOIN public.subscription_assignment_queue q ON q.booking_id = b.id
LEFT JOIN LATERAL (
  SELECT o.* FROM public.subscription_offers o
  WHERE o.queue_id = q.id
  ORDER BY o.offered_at ASC LIMIT 1
) o ON TRUE
LEFT JOIN LATERAL (
  SELECT pn.* FROM public.partner_notifications pn
  WHERE pn.metadata->>'booking_id' = b.id::text
     OR pn.metadata->>'queue_id'   = q.id::text
     OR pn.metadata->>'offer_id'   = o.id::text
  ORDER BY pn.created_at ASC LIMIT 1
) n ON TRUE;

GRANT SELECT ON public.v_payment_pipeline_timeline TO authenticated, service_role;
