-- 1. Redefine the function to use a VALID booking status ('active')
CREATE OR REPLACE FUNCTION public.admin_assign_partner_to_booking(
  p_booking_id uuid,
  p_partner_id uuid,
  p_admin_id uuid DEFAULT NULL
)
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

  -- Allow assignment if status is 'paid' or already 'active' (for re-assignment)
  IF v_booking.payment_status != 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Booking is not eligible for assignment (Payment status: ' || v_booking.payment_status || ')');
  END IF;

  -- 2. Validate partner using the AUTHORITATIVE table: public.partners
  SELECT * INTO v_partner FROM public.partners WHERE id = p_partner_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Partner not found');
  END IF;

  -- 3. Check for existing active assignment for this partner
  -- If no assignment exists for today, we might need to create one or allow the assignment to link to a future one.
  -- But for Daily Shine, we usually have a 1-day assignment or a recurring one.
  SELECT id INTO v_assignment_id
  FROM public.assignments
  WHERE partner_id = p_partner_id
    AND status = 'active'
    AND (CURRENT_DATE BETWEEN start_date AND end_date OR start_date >= CURRENT_DATE)
  ORDER BY start_date ASC, created_at DESC LIMIT 1;

  -- 4. Update booking
  -- Use 'active' status which is valid under bookings_status_check
  UPDATE public.bookings
  SET partner_id = p_partner_id,
      status = 'active',
      updated_at = now()
  WHERE id = p_booking_id;

  -- 5. Update subscription record if it exists
  UPDATE public.subscriptions
  SET assigned_partner_id = p_partner_id,
      assigned_at = now(),
      status = 'active',
      updated_at = now()
  WHERE booking_id = p_booking_id;

  -- 6. Update service record
  -- For subscription-based bookings like Daily Shine, there might be multiple pending services.
  -- We update all pending services for this booking to this partner.
  UPDATE public.services
  SET partner_id = p_partner_id,
      assignment_id = v_assignment_id,
      updated_at = now()
  WHERE booking_id = p_booking_id
    AND status = 'pending'
  RETURNING * INTO v_service;

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
      'You have been assigned to a new service for ' || (SELECT COALESCE(full_name, 'Customer') FROM customers WHERE id = v_booking.user_id),
      'assignment_new',
      jsonb_build_object('booking_id', p_booking_id, 'service_id', v_service.id)
    ) RETURNING id INTO v_partner_notif_id;
  EXCEPTION WHEN OTHERS THEN
    -- Ignore notification failure
  END;

  -- 8. Create Customer Notification
  BEGIN
    INSERT INTO public.notifications (
      user_id,
      title,
      body,
      type,
      metadata
    ) VALUES (
      v_booking.user_id,
      'Partner Assigned',
      v_partner.full_name || ' has been assigned to your service.',
      'partner_assigned',
      jsonb_build_object('booking_id', p_booking_id, 'partner_id', p_partner_id)
    ) RETURNING id INTO v_customer_notif_id;
  EXCEPTION WHEN OTHERS THEN
    -- Ignore notification failure
  END;

  -- 9. Audit Record
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_audit_logs' AND table_schema = 'public') THEN
    BEGIN
      INSERT INTO public.admin_audit_logs (
        admin_id,
        action,
        entity_type,
        entity_id,
        details
      ) VALUES (
        p_admin_id,
        'ASSIGN_PARTNER',
        'booking',
        p_booking_id,
        jsonb_build_object('partner_id', p_partner_id, 'partner_name', v_partner.full_name, 'status', 'active')
      );
    EXCEPTION WHEN OTHERS THEN
      -- Ignore audit failure if schema mismatch
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'active',
    'customer_notif_id', v_customer_notif_id,
    'partner_notif_id', v_partner_notif_id
  );
END;
$function$;
