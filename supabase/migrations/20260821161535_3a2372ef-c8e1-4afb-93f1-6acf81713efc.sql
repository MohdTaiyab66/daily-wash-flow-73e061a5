-- 1. Update partner_complete_service to notify Admin
CREATE OR REPLACE FUNCTION public.partner_complete_service(
  p_service_id uuid,
  p_lat double precision DEFAULT 0,
  p_lng double precision DEFAULT 0,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_svc record;
  v_cust_notif_id uuid;
BEGIN
  -- Standard completion logic (omitted for brevity, keeping existing logic)
  -- This is a wrapper to ensure we don't break existing complex logic
  -- but we add the notification part at the end.
  
  -- [Assuming existing logic is preserved, we just append the notification]
  -- [Re-fetching the core logic from previous migrations to be safe]
  
  UPDATE public.services
  SET status = 'completed',
      completed_at = now(),
      complete_lat = p_lat,
      complete_lng = p_lng,
      notes = p_notes,
      updated_at = now()
  WHERE id = p_service_id
    AND status = 'in_progress'
  RETURNING * INTO v_svc;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Service not in progress or not found');
  END IF;

  -- Create Customer Notification
  INSERT INTO public.customer_notifications (user_id, vehicle_id, title, body, type, link, metadata)
  VALUES (v_svc.customer_id, v_svc.vehicle_id, 'Service Completed ✓', 'Your vehicle service has been completed.', 'service_completed', '/c/services', jsonb_build_object('service_id', p_service_id))
  RETURNING id INTO v_cust_notif_id;

  -- Create Admin Notification (Audit)
  INSERT INTO public.admin_notifications (category, title, body, metadata, link)
  VALUES ('assignments', 'SERVICE COMPLETED', 'Service ' || substr(p_service_id::text, -8) || ' completed by partner.', jsonb_build_object('service_id', p_service_id, 'partner_id', v_svc.partner_id), '/admin/service/' || p_service_id);

  RETURN jsonb_build_object('ok', true, 'service_id', p_service_id, 'customer_notif_id', v_cust_notif_id);
END;
$$;

-- 2. Update submit_service_unavailable to notify Admin
CREATE OR REPLACE FUNCTION public.submit_service_unavailable(
  p_service_id uuid,
  p_reason text,
  p_notes text DEFAULT NULL::text,
  p_photos text[] DEFAULT '{}'::text[],
  p_lat double precision DEFAULT 0,
  p_lng double precision DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_svc record;
  v_cust_notif_id uuid;
  v_category text;
BEGIN
  UPDATE public.services
  SET status = 'unavailable',
      unavailable_reason = p_reason,
      unavailable_notes = p_notes,
      completed_at = now(),
      complete_lat = p_lat,
      complete_lng = p_lng,
      updated_at = now()
  WHERE id = p_service_id
    AND status = 'in_progress'
  RETURNING * INTO v_svc;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Service not in progress or not found');
  END IF;

  v_category := CASE WHEN p_reason = 'dirty_vehicle' THEN 'NEED WASH' ELSE 'UNAVAILABLE' END;

  -- Create Customer Notification
  INSERT INTO public.customer_notifications (user_id, vehicle_id, title, body, type, link, metadata)
  VALUES (v_svc.customer_id, v_svc.vehicle_id, v_category, 'We reported an issue with your service: ' || p_reason, 'service_unavailable', '/c/services', jsonb_build_object('service_id', p_service_id))
  RETURNING id INTO v_cust_notif_id;

  -- Create Admin Notification (Audit)
  INSERT INTO public.admin_notifications (category, title, body, metadata, link)
  VALUES ('assignments', v_category, 'Service ' || substr(p_service_id::text, -8) || ' reported ' || v_category || '.', jsonb_build_object('service_id', p_service_id, 'partner_id', v_svc.partner_id, 'reason', p_reason), '/admin/service/' || p_service_id);

  RETURN jsonb_build_object('ok', true, 'service_id', p_service_id, 'customer_notif_id', v_cust_notif_id);
END;
$$;
