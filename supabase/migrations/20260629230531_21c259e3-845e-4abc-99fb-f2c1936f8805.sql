-- P0-DUP-01 (trigger layer): make tg_enqueue_subscription_on_paid race-safe.
-- If another booking already opened a subscription for the same vehicle, skip
-- the insert + enqueue and log a refund alert instead of raising.
CREATE OR REPLACE FUNCTION public.tg_enqueue_subscription_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_type text;
  v_slug text;
  v_dup_sub uuid;
  v_dup_booking uuid;
BEGIN
  IF NEW.payment_status = 'paid'
     AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
    SELECT service_type, slug INTO v_type, v_slug FROM public.service_catalog WHERE id = NEW.service_id;
    IF v_type = 'subscription' THEN
      PERFORM public.ensure_ops_customer_for_booking(NEW.id);

      -- P0-DUP-01: race guard. Another booking may already own this vehicle's slot.
      SELECT id, booking_id INTO v_dup_sub, v_dup_booking
        FROM public.subscriptions
        WHERE vehicle_id = NEW.vehicle_id
          AND status IN ('active','awaiting_partner_assignment','assigned')
          AND booking_id <> NEW.id
        LIMIT 1;

      IF v_dup_sub IS NOT NULL THEN
        INSERT INTO public.admin_alerts(type,title,body,severity,metadata)
        VALUES('refund_required',
               'Duplicate Daily Shine payment — refund required',
               'A second paid booking ('||NEW.id::text||') landed for a vehicle that already has an active subscription. Refund manually.',
               'high',
               jsonb_build_object('duplicate_of_subscription_id', v_dup_sub,
                                  'duplicate_of_booking_id', v_dup_booking,
                                  'booking_id', NEW.id,
                                  'vehicle_id', NEW.vehicle_id,
                                  'user_id', NEW.user_id,
                                  'amount', NEW.total_amount));
        RETURN NEW;
      END IF;

      INSERT INTO public.subscriptions (
        booking_id, user_id, customer_id, vehicle_id, plan_slug, status, start_date, renewal_date, service_start_date, amount, currency
      ) VALUES (
        NEW.id, NEW.user_id, NEW.user_id, NEW.vehicle_id, COALESCE(v_slug, 'daily-shine'), 'awaiting_partner_assignment',
        COALESCE(NEW.scheduled_date, CURRENT_DATE), COALESCE(NEW.scheduled_date, CURRENT_DATE) + 30,
        COALESCE(NEW.scheduled_date, CURRENT_DATE), NEW.total_amount, 'INR'
      )
      ON CONFLICT (booking_id) DO UPDATE SET
        status = CASE WHEN public.subscriptions.status = 'assigned' THEN public.subscriptions.status ELSE 'awaiting_partner_assignment' END,
        start_date = EXCLUDED.start_date,
        renewal_date = EXCLUDED.renewal_date,
        service_start_date = EXCLUDED.service_start_date,
        amount = EXCLUDED.amount,
        updated_at = now();
      PERFORM public.enqueue_subscription_booking(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $function$;