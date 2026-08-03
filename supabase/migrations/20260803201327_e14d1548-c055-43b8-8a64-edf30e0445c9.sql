-- Revenue-leak fix: subscription entitlements must only cover the plan's own
-- included services. Premium / one-time paid services must never map to a
-- benefit, otherwise preview_customer_booking + confirm_customer_booking
-- consume an entitlement and price them at 0.
CREATE OR REPLACE FUNCTION public.service_slug_to_benefit(p_slug text)
 RETURNS benefit_type
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE lower(coalesce(p_slug,''))
    -- Included monthly interior + exterior wash (Daily Shine plan)
    WHEN 'daily-shine-interior' THEN 'interior'::public.benefit_type
    -- Daily exterior cleaning (Daily Shine plan)
    WHEN 'daily-shine-exterior' THEN 'exterior_daily'::public.benefit_type
    -- Daily Shine dusting plan
    WHEN 'daily-shine-dusting' THEN 'dusting'::public.benefit_type
    -- Everything else (premium / one-time / add-on services) is always chargeable.
    ELSE NULL END;
$function$;