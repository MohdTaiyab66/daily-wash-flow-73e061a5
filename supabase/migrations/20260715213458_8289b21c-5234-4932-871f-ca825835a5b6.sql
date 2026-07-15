-- Normalize customer_notifications.type to spec whitelist names.
-- Fires BEFORE the forbidden-type block trigger via alphabetical trigger ordering
-- (trg_a_... runs before trg_block_...).

CREATE OR REPLACE FUNCTION public.tg_normalize_customer_notification_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.type := CASE NEW.type
    -- payment
    WHEN 'subscription_paid'          THEN 'payment_success'
    -- vehicle
    WHEN 'dirty_vehicle'              THEN 'vehicle_dirty'
    WHEN 'service_unavailable'        THEN 'vehicle_unavailable'
    -- reminders
    WHEN 'weekly_wash_reminder'       THEN 'weekly_included_reminder'
    WHEN 'subscription_renewing_soon' THEN 'renewal_reminder'
    WHEN 'subscription_expiring_soon' THEN 'expiry_reminder'
    ELSE NEW.type
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_a_normalize_customer_notification_type
  ON public.customer_notifications;

CREATE TRIGGER trg_a_normalize_customer_notification_type
  BEFORE INSERT ON public.customer_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_normalize_customer_notification_type();

-- Backfill existing rows so filters/UI see spec names consistently.
UPDATE public.customer_notifications SET type = 'payment_success'          WHERE type = 'subscription_paid';
UPDATE public.customer_notifications SET type = 'vehicle_dirty'            WHERE type = 'dirty_vehicle';
UPDATE public.customer_notifications SET type = 'vehicle_unavailable'      WHERE type = 'service_unavailable';
UPDATE public.customer_notifications SET type = 'weekly_included_reminder' WHERE type = 'weekly_wash_reminder';
UPDATE public.customer_notifications SET type = 'renewal_reminder'         WHERE type = 'subscription_renewing_soon';
UPDATE public.customer_notifications SET type = 'expiry_reminder'          WHERE type = 'subscription_expiring_soon';