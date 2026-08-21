-- [ADMIN-ASSIGNMENT:01] Transition Daily Shine to Admin-Controlled Flow
-- 1. Create a function for atomic assignment by Admin
CREATE OR REPLACE FUNCTION public.admin_assign_partner_to_booking(
  p_booking_id uuid,
  p_partner_id uuid,
  p_admin_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booking record;
  v_partner record;
  v_assignment_id uuid;
  v_service record;
  v_customer_notif_id uuid;
  v_partner_notif_id uuid;
BEGIN
  -- 1. Lock and validate booking
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Booking not found');
  END IF;
  
  IF v_booking.status != 'paid' OR v_booking.partner_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Booking is not eligible for assignment (Status: ' || v_booking.status || ')');
  END IF;

  -- 2. Validate partner
  SELECT * INTO v_partner FROM public.partner_profiles WHERE user_id = p_partner_id;
  IF NOT FOUND OR v_partner.status != 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Partner is not active or not found');
  END IF;

  -- 3. Check for existing active assignment for this partner
  SELECT id INTO v_assignment_id 
  FROM public.assignments 
  WHERE partner_id = p_partner_id 
    AND status = 'active'
    AND CURRENT_DATE BETWEEN start_date AND end_date
  ORDER BY created_at DESC LIMIT 1;

  -- 4. Update booking
  UPDATE public.bookings
  SET partner_id = p_partner_id,
      status = 'assigned',
      updated_at = now()
  WHERE id = p_booking_id;

  -- 5. Update service record
  UPDATE public.services
  SET partner_id = p_partner_id,
      assignment_id = v_assignment_id,
      updated_at = now()
  WHERE booking_id = p_booking_id
    AND status = 'pending'
  RETURNING * INTO v_service;

  -- 6. Create Partner Notification
  INSERT INTO public.partner_notifications (
    partner_id,
    title,
    body,
    type,
    link,
    metadata
  ) VALUES (
    p_partner_id,
    'New Service Assignment',
    'Admin has assigned a new ' || v_booking.service_type || ' booking to you.',
    'partner_assigned',
    '/app/live',
    jsonb_build_object('booking_id', p_booking_id, 'service_id', v_service.id)
  ) RETURNING id INTO v_partner_notif_id;

  -- 7. Create Customer Notification
  INSERT INTO public.customer_notifications (
    user_id,
    vehicle_id,
    title,
    body,
    type,
    link,
    metadata
  ) VALUES (
    v_booking.customer_id,
    v_booking.vehicle_id,
    'Partner Assigned',
    (SELECT full_name FROM public.partner_profiles WHERE user_id = p_partner_id) || ' has been assigned to your service.',
    'partner_assigned',
    '/c/services',
    jsonb_build_object('booking_id', p_booking_id, 'service_id', v_service.id, 'partner_id', p_partner_id)
  ) RETURNING id INTO v_customer_notif_id;

  -- 8. Create Admin Notification (Audit)
  INSERT INTO public.admin_notifications (
    category,
    title,
    body,
    metadata
  ) VALUES (
    'assignments',
    'Partner Assigned',
    'Partner ' || (SELECT full_name FROM public.partner_profiles WHERE user_id = p_partner_id) || ' assigned to booking ' || p_booking_id,
    jsonb_build_object('booking_id', p_booking_id, 'partner_id', p_partner_id, 'admin_id', p_admin_id)
  );

  RETURN jsonb_build_object(
    'ok', true, 
    'booking_id', p_booking_id, 
    'partner_notif_id', v_partner_notif_id,
    'customer_notif_id', v_customer_notif_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_partner_to_booking(uuid, uuid, uuid) TO authenticated, service_role;
