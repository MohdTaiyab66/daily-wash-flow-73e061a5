DROP FUNCTION IF EXISTS public.admin_assign_partner_to_booking(uuid,uuid);
DROP FUNCTION IF EXISTS public.admin_assign_partner_to_booking(uuid,uuid,uuid);

CREATE OR REPLACE FUNCTION public.admin_assign_partner_to_booking(p_booking_id uuid, p_partner_id uuid, p_admin_id uuid DEFAULT NULL)
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
  v_sub record;
BEGIN
  -- 1. Lock and validate booking
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Booking not found');
  END IF;

  IF v_booking.payment_status != 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Booking is not eligible for assignment (Payment status: ' || v_booking.payment_status || ')');
  END IF;

  -- 2. Validate partner
  SELECT * INTO v_partner FROM public.partners WHERE id = p_partner_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Partner not found');
  END IF;

  -- 3. Check for existing active assignment
  SELECT id INTO v_assignment_id
  FROM public.assignments
  WHERE partner_id = p_partner_id
    AND status = 'active'
    AND (CURRENT_DATE BETWEEN start_date AND end_date OR start_date >= CURRENT_DATE)
  ORDER BY start_date ASC, created_at DESC LIMIT 1;

  -- P0 ARCHITECTURE FIX: Ensure assignment record exists
  IF v_assignment_id IS NULL THEN
    INSERT INTO public.assignments (
      partner_id,
      start_date,
      end_date,
      status,
      target_cars,
      rate_per_car,
      working_days,
      duration_days
    ) VALUES (
      p_partner_id,
      CURRENT_DATE,
      CURRENT_DATE + interval '30 days',
      'active',
      1, 
      COALESCE(v_partner.rate_per_car, 0),
      26,
      30
    ) RETURNING id INTO v_assignment_id;
  END IF;

  -- 4. Update booking
  UPDATE public.bookings
  SET partner_id = p_partner_id,
      status = 'active',
      updated_at = now()
  WHERE id = p_booking_id;

  -- 5. Update subscription
  UPDATE public.subscriptions
  SET assigned_partner_id = p_partner_id,
      assigned_at = now(),
      status = 'active',
      updated_at = now()
  WHERE booking_id = p_booking_id
  RETURNING * INTO v_sub;

  -- 6. Update/Create service
  -- Attempt to find an existing service record first
  UPDATE public.services
  SET partner_id = p_partner_id,
      assignment_id = v_assignment_id,
      updated_at = now()
  WHERE (id = v_booking.ops_service_id OR (vehicle_id = v_booking.vehicle_id AND customer_id = v_booking.user_id AND status = 'pending'))
  RETURNING * INTO v_service;

  -- P0 CRITICAL FIX: If no service exists, create the first one now so the partner has work to do.
  IF v_service.id IS NULL THEN
    INSERT INTO public.services (
      booking_id,
      customer_id,
      vehicle_id,
      partner_id,
      assignment_id,
      scheduled_date,
      status,
      service_type,
      sequence_number
    ) VALUES (
      p_booking_id,
      v_booking.user_id,
      v_booking.vehicle_id,
      p_partner_id,
      v_assignment_id,
      CURRENT_DATE,
      'pending',
      (SELECT service_type FROM service_catalog WHERE id = v_booking.service_id),
      1
    ) RETURNING * INTO v_service;
    
    -- Link the newly created service back to the booking
    UPDATE public.bookings SET ops_service_id = v_service.id WHERE id = p_booking_id;
  END IF;

  -- 7. Create Partner Notification
  INSERT INTO public.partner_notifications (
    partner_id,
    title,
    body,
    type,
    category,
    metadata
  ) VALUES (
    p_partner_id,
    'New Service Assigned',
    'You have been assigned to a new service for ' || (SELECT COALESCE(full_name, 'Customer') FROM customers WHERE id = v_booking.user_id OR id = v_service.customer_id LIMIT 1),
    'new_assignment',
    'assignments',
    jsonb_build_object(
      'booking_id', p_booking_id,
      'service_id', v_service.id,
      'assignment_id', v_assignment_id
    )
  ) RETURNING id INTO v_partner_notif_id;

  -- 8. Create Customer Notification
  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    type,
    metadata
  ) VALUES (
    v_booking.user_id,
    'Service Scheduled',
    'Your service has been scheduled. ' || v_partner.full_name || ' will be your partner.',
    'service_scheduled',
    jsonb_build_object(
      'booking_id', p_booking_id,
      'partner_id', p_partner_id,
      'service_id', v_service.id
    )
  ) RETURNING id INTO v_customer_notif_id;

  RETURN jsonb_build_object(
    'ok', true,
    'assignment_id', v_assignment_id,
    'service_id', v_service.id,
    'partner_notification_id', v_partner_notif_id
  );
END;
$function$
;