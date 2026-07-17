
-- 1. Move the admin "New booking" notice from insert-time to payment-verified time.
DROP TRIGGER IF EXISTS trg_bookings_admin_notify ON public.bookings;

CREATE OR REPLACE FUNCTION public.tg_bookings_admin_notify_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_type text; v_slug text; v_svc_name text;
  v_name text; v_area text; v_veh text;
  v_category text; v_link text;
BEGIN
  -- Only fire when payment_status transitions to 'paid'
  IF NEW.payment_status IS DISTINCT FROM 'paid' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.payment_status = 'paid' THEN RETURN NEW; END IF;

  SELECT service_type, slug, name INTO v_type, v_slug, v_svc_name
    FROM public.service_catalog WHERE id = NEW.service_id;

  SELECT COALESCE(cp.full_name, c.full_name, 'Customer')
    INTO v_name
  FROM public.customer_profiles cp
  FULL OUTER JOIN public.customers c ON c.id = cp.user_id
  WHERE cp.user_id = NEW.user_id OR c.id = NEW.user_id
  LIMIT 1;

  SELECT area INTO v_area FROM public.customer_addresses WHERE id = NEW.address_id;
  SELECT COALESCE(make || ' ' || model, 'Vehicle') INTO v_veh
    FROM public.customer_vehicles WHERE id = NEW.vehicle_id;

  IF v_type = 'subscription' THEN
    v_category := 'daily_shine';
    v_link := '/admin/marketplace';
  ELSE
    v_category := 'premium';
    v_link := '/admin/service/' || NEW.id::text;
  END IF;

  INSERT INTO public.admin_notifications(category, title, body, link, subject_type, subject_id, metadata)
  VALUES (
    v_category,
    'New ' || COALESCE(v_svc_name, 'booking') || ' (paid)',
    COALESCE(v_name,'Customer') || ' • ' || COALESCE(v_area,'Area') || ' • ' || COALESCE(v_veh,'Vehicle') || ' • ₹' || COALESCE(NEW.total_amount, 0),
    v_link,
    'booking',
    NEW.id,
    jsonb_build_object(
      'booking_id', NEW.id,
      'service_slug', v_slug,
      'service_type', v_type,
      'user_id', NEW.user_id,
      'amount', NEW.total_amount,
      'area', v_area,
      'vehicle', v_veh,
      'customer_name', v_name,
      'paid_at', now()
    )
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bookings_admin_notify_on_paid ON public.bookings;
CREATE TRIGGER trg_bookings_admin_notify_on_paid
AFTER INSERT OR UPDATE OF payment_status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.tg_bookings_admin_notify_on_paid();

-- 2. Hard DB safeguard: no admin_notification for a booking that isn't paid.
CREATE OR REPLACE FUNCTION public.tg_admin_notification_requires_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_paid text;
BEGIN
  IF NEW.subject_type = 'booking' AND NEW.subject_id IS NOT NULL THEN
    SELECT payment_status INTO v_paid FROM public.bookings WHERE id = NEW.subject_id;
    IF v_paid IS NOT NULL AND v_paid <> 'paid' THEN
      RAISE EXCEPTION 'admin_notifications blocked: booking % has payment_status=% (must be paid)', NEW.subject_id, v_paid;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_admin_notification_requires_paid ON public.admin_notifications;
CREATE TRIGGER trg_admin_notification_requires_paid
BEFORE INSERT ON public.admin_notifications
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_notification_requires_paid();

-- 3. Cleanup: remove stale admin notifications pointing at unpaid bookings.
DELETE FROM public.admin_notifications an
USING public.bookings b
WHERE an.subject_type='booking'
  AND an.subject_id = b.id
  AND b.payment_status <> 'paid';

-- 4. Diagnostic views.
CREATE OR REPLACE VIEW public.v_admin_notification_trace AS
SELECT
  an.id                              AS notification_id,
  an.created_at                      AS notified_at,
  an.category,
  an.title,
  an.subject_type,
  an.subject_id,
  b.id                               AS booking_id,
  b.payment_status,
  b.status                           AS booking_status,
  s.id                               AS subscription_id,
  s.status                           AS subscription_status,
  CASE
    WHEN an.subject_type='booking' AND b.payment_status IS DISTINCT FROM 'paid'
      THEN 'INVALID_UNPAID'
    WHEN an.subject_type='booking' AND b.payment_status = 'paid'
      THEN 'OK_PAID'
    ELSE 'NON_BOOKING'
  END                                AS verdict
FROM public.admin_notifications an
LEFT JOIN public.bookings b
  ON an.subject_type='booking' AND an.subject_id = b.id
LEFT JOIN public.subscriptions s ON s.booking_id = b.id;

GRANT SELECT ON public.v_admin_notification_trace TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_assignment_pipeline_trace AS
SELECT
  b.id                              AS booking_id,
  b.created_at                      AS booking_created_at,
  b.payment_status,
  b.status                          AS booking_status,
  pay.captured_at                   AS payment_verified_at,
  s.id                              AS subscription_id,
  s.status                          AS subscription_status,
  s.assigned_partner_id,
  q.id                              AS queue_id,
  q.status                          AS queue_status,
  q.radius_km,
  q.tried_partner_ids,
  q.current_offer_partner_id,
  q.offer_expires_at,
  ofs.offers_total,
  ofs.offers_accepted,
  ofs.offers_declined,
  ofs.offers_expired,
  ofs.offers_pending,
  ofs.last_offered_at,
  del.first_delivery_at,
  del.stages_seen,
  a.id                              AS assignment_id,
  a.status                          AS assignment_status,
  CASE
    WHEN b.payment_status <> 'paid'                     THEN 'STOPPED: payment not verified'
    WHEN s.id IS NULL                                   THEN 'STOPPED: subscription not created'
    WHEN q.id IS NULL                                   THEN 'STOPPED: assignment queue not created'
    WHEN q.status='failed'  AND ofs.offers_total IS NULL THEN 'STOPPED: no eligible active+online partner (queue failed with 0 offers)'
    WHEN q.status='failed'                              THEN 'STOPPED: all offers exhausted (queue failed)'
    WHEN ofs.offers_total IS NULL                       THEN 'STOPPED: queue created but no offer issued'
    WHEN del.first_delivery_at IS NULL                  THEN 'STOPPED: offer created but no push delivery event'
    WHEN a.id IS NULL AND q.status='awaiting'           THEN 'IN_PROGRESS: waiting for partner response'
    WHEN a.id IS NULL AND q.status='assigned'           THEN 'STOPPED: queue assigned but assignments row missing'
    ELSE 'OK'
  END                               AS pipeline_verdict
FROM public.bookings b
LEFT JOIN LATERAL (
  SELECT MAX(created_at) AS captured_at
  FROM public.payments p
  WHERE p.booking_id = b.id AND p.status='captured'
) pay ON TRUE
LEFT JOIN public.subscriptions s ON s.booking_id = b.id
LEFT JOIN public.subscription_assignment_queue q ON q.booking_id = b.id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)                                              AS offers_total,
    COUNT(*) FILTER (WHERE response='accepted')           AS offers_accepted,
    COUNT(*) FILTER (WHERE response='declined')           AS offers_declined,
    COUNT(*) FILTER (WHERE response='expired')            AS offers_expired,
    COUNT(*) FILTER (WHERE response IS NULL)              AS offers_pending,
    MAX(offered_at)                                       AS last_offered_at
  FROM public.subscription_offers so
  WHERE so.queue_id = q.id
) ofs ON TRUE
LEFT JOIN LATERAL (
  SELECT MIN(created_at) AS first_delivery_at,
         array_agg(DISTINCT stage)::text[] AS stages_seen
  FROM public.offer_delivery_events e
  WHERE e.queue_id = q.id
) del ON TRUE
LEFT JOIN LATERAL (
  SELECT a2.id, a2.status
  FROM public.assignments a2
  WHERE a2.partner_id = s.assigned_partner_id
    AND a2.start_date <= s.renewal_date
    AND a2.end_date >= s.start_date
  ORDER BY a2.created_at DESC
  LIMIT 1
) a ON TRUE;

GRANT SELECT ON public.v_assignment_pipeline_trace TO authenticated, service_role;
