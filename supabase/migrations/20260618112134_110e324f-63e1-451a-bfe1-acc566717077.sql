
-- 1. Add 'dirty_vehicle' to unavailable_reason enum
ALTER TYPE public.unavailable_reason ADD VALUE IF NOT EXISTS 'dirty_vehicle';

-- 2. Fix admin_update_customer to update the PRIMARY (oldest) vehicle, not the most recent (secondary)
CREATE OR REPLACE FUNCTION public.admin_update_customer(
  p_id uuid,
  p_full_name text,
  p_phone text,
  p_area text,
  p_address_line text,
  p_pincode text,
  p_latitude numeric,
  p_longitude numeric,
  p_subscription_plan text,
  p_subscription_start date,
  p_subscription_end date,
  p_preferred_time text,
  p_service_required_before text,
  p_is_active boolean,
  p_package_amount integer DEFAULT NULL,
  p_front_image_path text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.customers SET
    full_name = COALESCE(NULLIF(p_full_name, ''), full_name),
    phone = COALESCE(NULLIF(p_phone, ''), phone),
    area = COALESCE(NULLIF(p_area, ''), area),
    address_line = COALESCE(NULLIF(p_address_line, ''), address_line),
    pincode = COALESCE(NULLIF(p_pincode, ''), pincode),
    latitude = COALESCE(p_latitude, latitude),
    longitude = COALESCE(p_longitude, longitude),
    subscription_plan = COALESCE(NULLIF(p_subscription_plan, '')::subscription_plan, subscription_plan),
    subscription_start = COALESCE(p_subscription_start, subscription_start),
    subscription_end = COALESCE(p_subscription_end, subscription_end),
    preferred_time = COALESCE(NULLIF(p_preferred_time, ''), preferred_time),
    service_required_before = NULLIF(p_service_required_before, ''),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_id;

  IF p_package_amount IS NOT NULL OR NULLIF(p_front_image_path, '') IS NOT NULL THEN
    UPDATE public.vehicles
      SET package_amount = COALESCE(p_package_amount, package_amount),
          front_image_path = COALESCE(NULLIF(p_front_image_path, ''), front_image_path)
      WHERE id = (SELECT id FROM public.vehicles WHERE customer_id = p_id ORDER BY created_at ASC LIMIT 1);
  END IF;
END
$$;
REVOKE EXECUTE ON FUNCTION public.admin_update_customer(uuid,text,text,text,text,text,numeric,numeric,text,date,date,text,text,boolean,integer,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_update_customer(uuid,text,text,text,text,text,numeric,numeric,text,date,date,text,text,boolean,integer,text) TO authenticated, service_role;
