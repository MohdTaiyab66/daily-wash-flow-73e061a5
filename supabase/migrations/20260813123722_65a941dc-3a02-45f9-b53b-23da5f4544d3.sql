CREATE OR REPLACE FUNCTION public.tg_normalize_customer_notification_type() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.type := CASE NEW.type
    WHEN 'subscription_paid'          THEN 'payment_success'
    WHEN 'dirty_vehicle'              THEN 'vehicle_dirty'
    WHEN 'dirty_vehicle_report'       THEN 'vehicle_dirty'
    WHEN 'service_unavailable'        THEN 'vehicle_unavailable'
    WHEN 'unavailable_report'         THEN 'vehicle_unavailable'
    WHEN 'completed'                  THEN 'service_completed'
    WHEN 'weekly_wash_reminder'       THEN 'weekly_included_reminder'
    WHEN 'subscription_renewing_soon' THEN 'renewal_reminder'
    WHEN 'subscription_expiring_soon' THEN 'expiry_reminder'
    ELSE NEW.type
  END;
  RETURN NEW;
END;
$$;