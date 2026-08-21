-- URBAN WASH — P0 FORENSIC FIX: "COLUMN booking_id DOES NOT EXIST"
-- The services table does NOT have booking_id. 
-- The relationship is bookings.ops_service_id -> services.id.

CREATE OR REPLACE FUNCTION public.admin_assign_partner_to_booking(p_booking_id uuid, p_partner_id uuid, p_admin_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Allow assignment if payment is 'paid' (Daily Shine bookings are 'paid' upon success)
  IF v_booking.payment_status != 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Booking is not eligible for assignment (Payment status: ' || v_booking.payment_status || ')');
  END IF;

  -- 2. Validate partner
  SELECT * INTO v_partner FROM public.partners WHERE id = p_partner_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Partner not found');
  END IF;

  -- 3. Check for existing active assignment for this partner
  -- Use a broad range to find the partner's current working batch
  SELECT id INTO v_assignment_id
  FROM public.assignments
  WHERE partner_id = p_partner_id
    AND status = 'active'
    AND (CURRENT_DATE BETWEEN start_date AND end_date OR start_date >= CURRENT_DATE)
  ORDER BY start_date ASC, created_at DESC LIMIT 1;

  -- 4. Update booking
  -- status 'active' is valid in bookings_status_check
  UPDATE public.bookings
  SET partner_id = p_partner_id,
      status = 'active',
      updated_at = now()
  WHERE id = p_booking_id;

  -- 5. Update subscription record
  -- Subscriptions table DOES have booking_id
  UPDATE public.subscriptions
  SET assigned_partner_id = p_partner_id,
      assigned_at = now(),
      status = 'active',
      updated_at = now()
  WHERE booking_id = p_booking_id;

  -- 6. Update service record
  -- The services table DOES NOT have booking_id. 
  -- We link via the ops_service_id stored on the booking.
  -- We also update other pending services for the same vehicle/customer to maintain consistency for subscriptions.
  UPDATE public.services
  SET partner_id = p_partner_id,
      assignment_id = v_assignment_id,
      updated_at = now()
  WHERE (id = v_booking.ops_service_id OR (vehicle_id = v_booking.vehicle_id AND customer_id = v_booking.user_id AND status = 'pending'))
  RETURNING * INTO v_service;
  
  -- If v_service is still NULL (e.g. ops_service_id was null and no pending found), fallback to just getting one
  IF v_service.id IS NULL THEN
      SELECT * INTO v_service FROM public.services WHERE vehicle_id = v_booking.vehicle_id ORDER BY created_at DESC LIMIT 1;
  END IF;

  -- 7. Create Partner Notification (Wrapped)
  BEGIN
    INSERT INTO public.partner_notifications (
      partner_id,
      title,
      body,
      type,
      metadata
    ) VALUES (
      p_partner_id,
      'New Service Assigned',
      'You have been assigned to a new service for ' || (SELECT COALESCE(full_name, 'Customer') FROM customers WHERE id = v_booking.user_id OR id = v_service.customer_id LIMIT 1),
      'assignment_new',
      jsonb_build_object('booking_id', p_booking_id, 'service_id', v_service.id)
    ) RETURNING id INTO v_partner_notif_id;
  EXCEPTION WHEN OTHERS THEN
    -- Ignore notification failure to ensure transaction commit
  END;

  -- 8. Create Customer Notification
  BEGIN
    INSERT INTO public.customer_notifications (
      user_id,
      title,
      body,
      type,
      metadata,
      vehicle_id
    ) VALUES (
      v_booking.user_id,
      'Partner Assigned',
      v_partner.full_name || ' has been assigned to your service.',
      'partner_assigned',
      jsonb_build_object('booking_id', p_booking_id, 'partner_id', p_partner_id),
      v_booking.vehicle_id
    ) RETURNING id INTO v_customer_notif_id;
  EXCEPTION WHEN OTHERS THEN
    -- Ignore notification failure
  END;
  
  -- 9. Create Admin Notification (trace)
  BEGIN
    INSERT INTO public.admin_notifications (
      category,
      title,
      body,
      subject_type,
      subject_id,
      metadata
    ) VALUES (
      'bookings',
      'Partner Manually Assigned',
      'Admin assigned ' || v_partner.full_name || ' to booking ' || p_booking_id,
      'booking',
      p_booking_id,
      jsonb_build_object('partner_id', p_partner_id, 'admin_id', p_admin_id)
    );
  EXCEPTION WHEN OTHERS THEN
    -- Ignore
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', p_booking_id,
    'partner_id', p_partner_id,
    'service_id', v_service.id,
    'customer_notif_id', v_customer_notif_id,
    'partner_notif_id', v_partner_notif_id
  );
END;
$function$;

-- Update 2-arg overload
CREATE OR REPLACE FUNCTION public.admin_assign_partner_to_booking(p_booking_id uuid, p_partner_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_res jsonb;
BEGIN
  v_res := public.admin_assign_partner_to_booking(p_booking_id, p_partner_id, NULL);
  RETURN (v_res->>'ok')::boolean;
END;
$function$;
