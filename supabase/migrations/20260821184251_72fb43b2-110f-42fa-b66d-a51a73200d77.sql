
-- Fix Admin Assignment RPC to use correct schema and handle service creation
CREATE OR REPLACE FUNCTION public.admin_assign_partner_to_booking(p_booking_id uuid, p_partner_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking record;
  v_partner record;
  v_assignment_id uuid;
  v_service_id uuid;
  v_subscription record;
BEGIN
  -- 1. Validate booking exists and is paid
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id;
  END IF;

  IF v_booking.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Booking % is not paid (status: %)', p_booking_id, v_booking.payment_status;
  END IF;

  -- 2. Validate partner exists (using the correct table: partners)
  SELECT * INTO v_partner FROM public.partners WHERE id = p_partner_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partner % not found', p_partner_id;
  END IF;

  -- 3. Check for existing subscription
  SELECT * INTO v_subscription FROM public.subscriptions WHERE booking_id = p_booking_id;
  
  -- 4. Create or update Assignment (Daily Shine / Subscription logic)
  IF v_subscription.id IS NOT NULL THEN
    -- Check if we need to create a new assignment record
    SELECT id INTO v_assignment_id FROM public.assignments 
    WHERE partner_id = p_partner_id 
      AND status = 'active' 
      AND end_date >= v_subscription.start_date
    LIMIT 1;

    IF v_assignment_id IS NULL THEN
      INSERT INTO public.assignments (
        partner_id,
        status,
        start_date,
        end_date,
        rate_per_car
      ) VALUES (
        p_partner_id,
        'active',
        v_subscription.start_date,
        v_subscription.start_date + interval '30 days',
        COALESCE(v_booking.total_amount / 30, 17) -- Fallback rate
      ) RETURNING id INTO v_assignment_id;
    END IF;

    -- Update subscription
    UPDATE public.subscriptions
    SET status = 'active',
        assigned_partner_id = p_partner_id,
        assigned_at = now(),
        updated_at = now()
    WHERE id = v_subscription.id;
  END IF;

  -- 5. Create or Update Service record
  IF v_booking.ops_service_id IS NOT NULL THEN
    -- Update existing service
    UPDATE public.services
    SET partner_id = p_partner_id,
        assignment_id = v_assignment_id,
        status = 'pending',
        updated_at = now()
    WHERE id = v_booking.ops_service_id;
    
    v_service_id := v_booking.ops_service_id;
  ELSE
    -- Create fresh service for this booking
    INSERT INTO public.services (
      partner_id,
      customer_id,
      vehicle_id,
      scheduled_date,
      time_slot,
      status,
      assignment_id,
      created_at,
      updated_at
    ) VALUES (
      p_partner_id,
      v_booking.user_id,
      v_booking.vehicle_id,
      v_booking.scheduled_date,
      v_booking.preferred_before_time,
      'pending',
      v_assignment_id,
      now(),
      now()
    ) RETURNING id INTO v_service_id;

    -- Link back to booking
    UPDATE public.bookings SET ops_service_id = v_service_id WHERE id = p_booking_id;
  END IF;

  -- 6. Final Booking update
  UPDATE public.bookings
  SET partner_id = p_partner_id,
      status = 'assigned',
      claimed_at = now(),
      updated_at = now()
  WHERE id = p_booking_id;

  -- 7. Notifications (Wrapped in sub-block to prevent failure from rolling back assignment)
  BEGIN
    -- Partner Notification
    INSERT INTO public.partner_notifications (
      partner_id,
      type,
      title,
      body,
      metadata
    ) VALUES (
      p_partner_id,
      'new_assignment',
      'New Booking Assigned',
      'Admin has assigned a new service to you for ' || v_booking.scheduled_date,
      jsonb_build_object('booking_id', p_booking_id, 'service_id', v_service_id)
    );

    -- Customer Notification
    INSERT INTO public.customer_notifications (
      user_id,
      type,
      title,
      body,
      metadata,
      vehicle_id
    ) VALUES (
      v_booking.user_id,
      'partner_assigned',
      'Partner Assigned',
      v_partner.full_name || ' has been assigned to your service.',
      jsonb_build_object('booking_id', p_booking_id, 'partner_id', p_partner_id),
      v_booking.vehicle_id
    );

    -- Admin Audit Row (optional, skip if table missing)
    BEGIN
      INSERT INTO public.admin_audit_logs (
        admin_id,
        action,
        entity_type,
        entity_id,
        details
      ) VALUES (
        auth.uid(),
        'manual_assignment',
        'booking',
        p_booking_id,
        jsonb_build_object('partner_id', p_partner_id, 'partner_name', v_partner.full_name)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Assignment succeeded but notifications failed: %', SQLERRM;
  END;

  RETURN true;
END $function$;

-- Ensure grants are correct
GRANT EXECUTE ON FUNCTION public.admin_assign_partner_to_booking(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.admin_assign_partner_to_booking(uuid, uuid) TO service_role;
