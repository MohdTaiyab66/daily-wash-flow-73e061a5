DROP FUNCTION IF EXISTS public.create_addon_request(uuid, uuid, date, text, text);

CREATE OR REPLACE FUNCTION public.create_addon_request(
  p_subscription_id uuid,
  p_service_id uuid,
  p_preferred_date date,
  p_preferred_time text,
  p_notes text,
  p_vehicle_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_user uuid := auth.uid();
  v_sub record;
  v_svc record;
  v_name text;
  v_phone text;
  v_veh_id uuid;
  v_veh text;
  v_plan_veh text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;

  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE id = p_subscription_id
    AND user_id = v_user
    AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active Daily Shine subscription not found';
  END IF;

  SELECT * INTO v_svc
  FROM public.service_catalog
  WHERE id = p_service_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found';
  END IF;

  SELECT full_name, phone INTO v_name, v_phone
  FROM public.customer_profiles
  WHERE user_id = v_user
  LIMIT 1;

  v_veh_id := COALESCE(p_vehicle_id, v_sub.vehicle_id);

  IF v_veh_id IS NULL THEN
    RAISE EXCEPTION 'Select a vehicle';
  END IF;

  SELECT concat_ws(' ', make, model, NULLIF(registration_number, ''))
    INTO v_veh
  FROM public.customer_vehicles
  WHERE id = v_veh_id
    AND user_id = v_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected vehicle does not belong to you';
  END IF;

  IF v_sub.vehicle_id IS DISTINCT FROM v_veh_id THEN
    SELECT concat_ws(' ', make, model, NULLIF(registration_number, ''))
      INTO v_plan_veh
    FROM public.customer_vehicles
    WHERE id = v_sub.vehicle_id;

    RAISE EXCEPTION 'This Daily Shine plan belongs to %. Switch to that vehicle or subscribe this vehicle first.', COALESCE(v_plan_veh, 'another vehicle');
  END IF;

  INSERT INTO public.subscription_addon_requests(
    subscription_id, user_id, customer_name, customer_phone,
    vehicle_id, vehicle_label,
    service_id, service_name, service_slug,
    preferred_date, preferred_time, notes, status
  ) VALUES (
    p_subscription_id, v_user, v_name, v_phone,
    v_veh_id, v_veh,
    p_service_id, v_svc.name, v_svc.slug,
    p_preferred_date, p_preferred_time, p_notes, 'new'
  ) RETURNING id INTO v_id;

  INSERT INTO public.admin_alerts(kind, title, body, severity, meta)
  VALUES (
    'addon_request',
    'Add-on requested: ' || v_svc.name,
    COALESCE(v_name, 'Customer') || ' requested ' || v_svc.name
      || COALESCE(' for ' || v_veh, ''),
    'info',
    jsonb_build_object(
      'addon_id', v_id,
      'subscription_id', p_subscription_id,
      'vehicle_id', v_veh_id
    )
  );

  RETURN v_id;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.create_addon_request(uuid, uuid, date, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_addon_request(uuid, uuid, date, text, text, uuid) TO authenticated, service_role;

UPDATE public.subscription_addon_requests r
SET vehicle_label = concat_ws(' ', cv.make, cv.model, NULLIF(cv.registration_number, ''))
FROM public.customer_vehicles cv
WHERE cv.id = r.vehicle_id
  AND r.vehicle_label IS DISTINCT FROM concat_ws(' ', cv.make, cv.model, NULLIF(cv.registration_number, ''));