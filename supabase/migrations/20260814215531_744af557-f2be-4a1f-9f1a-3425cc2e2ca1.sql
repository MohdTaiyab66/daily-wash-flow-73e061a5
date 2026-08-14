-- ====================================================================
-- P0: PARTNER ASSIGNMENT & MARKETPLACE E2E FIX
-- ====================================================================

-- 1. Atomic Acceptance and Release Batch Transfer
CREATE OR REPLACE FUNCTION public.mark_booking_accepted(
  p_booking_id uuid,
  p_partner_id uuid,
  p_broadcast_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bcast record;
  v_assignment_id uuid;
BEGIN
  -- 1. Try to claim the broadcast
  UPDATE public.marketplace_broadcasts
  SET winning_partner_id = p_partner_id,
      status = 'assigned',
      updated_at = now()
  WHERE id = p_broadcast_id 
    AND status = 'open'
    AND winning_partner_id IS NULL
  RETURNING * INTO v_bcast;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- 2. Find or create an active assignment for the partner
  SELECT id INTO v_assignment_id 
  FROM public.assignments 
  WHERE partner_id = p_partner_id 
    AND status = 'active'
    AND CURRENT_DATE BETWEEN start_date AND end_date
  ORDER BY start_date DESC LIMIT 1;

  -- 3. If it was a released assignment (batch), transfer ALL services
  IF v_bcast.assignment_id IS NOT NULL THEN
    -- [ASSIGNMENT-RELEASE:05] BATCH_ACCEPTED
    -- [ASSIGNMENT-RELEASE:06] BATCH_TRANSFERRED
    
    -- Transfer all pending services in that batch to the new partner and their assignment
    UPDATE public.services
    SET partner_id = p_partner_id,
        assignment_id = v_assignment_id,
        updated_at = now()
    WHERE (assignment_id = v_bcast.assignment_id OR booking_id = p_booking_id)
      AND status = 'pending';
      
  ELSE
    -- Single booking acceptance
    UPDATE public.bookings
    SET partner_id = p_partner_id,
        status = 'active',
        claimed_at = now(),
        updated_at = now()
    WHERE id = p_booking_id
      AND partner_id IS NULL;

    -- Update the service record for single bookings
    UPDATE public.services
    SET partner_id = p_partner_id,
        assignment_id = v_assignment_id,
        updated_at = now()
    WHERE booking_id = p_booking_id
      AND status = 'pending';
  END IF;

  -- 4. Close all competing offers
  -- [BOOKING-PUSH:08] BOOKING_ACCEPTED
  -- [BOOKING-PUSH:09] RETRIES_STOPPED
  UPDATE public.marketplace_offers
  SET response = 'superseded',
      responded_at = now()
  WHERE broadcast_id = p_broadcast_id
    AND partner_id != p_partner_id
    AND response = 'pending';

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_booking_accepted(uuid, uuid, uuid) TO authenticated, service_role;

-- 2. Decline Logic with 5-minute retry cooldown
-- [BOOKING-PUSH:06] PARTNER_DECLINED
-- [BOOKING-PUSH:07] DECLINE_RETRY_5M
ALTER TABLE public.marketplace_offers ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

CREATE OR REPLACE FUNCTION public.mp_decline_offer(p_broadcast_id uuid)
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_updated int;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  
  UPDATE public.marketplace_offers
     SET response = 'declined', 
         responded_at = now(),
         next_retry_at = now() + interval '5 minutes'
   WHERE broadcast_id = p_broadcast_id
     AND partner_id = v_partner
     AND response = 'pending';
     
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_updated > 0);
END $$;

GRANT EXECUTE ON FUNCTION public.mp_decline_offer(uuid) TO authenticated;

-- 3. Broadcast Eligibility (30s retries + 5m decline cooldown)
-- [BOOKING-PUSH:05] RETRY_30S
CREATE OR REPLACE FUNCTION public.mp_reconcile_all_partners_for_broadcast(p_broadcast_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bcast record;
  v_partner_count integer := 0;
BEGIN
  SELECT * INTO v_bcast FROM public.marketplace_broadcasts WHERE id = p_broadcast_id;
  IF NOT FOUND OR v_bcast.status != 'open' THEN RETURN 0; END IF;

  -- Logic to insert pending offers for all eligible partners
  -- Excludes:
  -- 1. The original partner (if it was a release)
  -- 2. Partners who declined within the last 5 minutes
  -- 3. Partners who already have a pending offer for this broadcast
  INSERT INTO public.marketplace_offers (broadcast_id, partner_id, incentive, response)
  SELECT 
    v_bcast.id,
    pp.user_id,
    v_bcast.current_incentive,
    'pending'
  FROM public.partner_profiles pp
  WHERE pp.home_zone_id = v_bcast.service_area_id
    AND pp.availability = 'online'
    AND pp.status = 'active'
    -- Exclude canceller
    AND (v_bcast.winning_partner_id IS NULL OR pp.user_id != v_bcast.winning_partner_id) 
    -- Exclude recent decliners (5m cooldown)
    AND NOT EXISTS (
      SELECT 1 FROM public.marketplace_offers mo 
      WHERE mo.broadcast_id = v_bcast.id 
        AND mo.partner_id = pp.user_id
        AND (
          mo.response = 'pending' 
          OR (mo.response = 'declined' AND mo.next_retry_at > now())
        )
    )
  ON CONFLICT (broadcast_id, partner_id, round) DO NOTHING;

  GET DIAGNOSTICS v_partner_count = ROW_COUNT;
  RETURN v_partner_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mp_reconcile_all_partners_for_broadcast(uuid) TO service_role;

-- 4. Assignment Cancellation Overhaul (Release as Batch)
-- [ASSIGNMENT-RELEASE:01] CANCELLATION_STARTED
-- [ASSIGNMENT-RELEASE:02] CUSTOMERS_RELEASED
CREATE OR REPLACE FUNCTION public.cancel_assignment(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_partner uuid := auth.uid();
  v_a public.assignments%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_started boolean;
  v_bcast_id uuid;
  v_customer_count int;
BEGIN
  IF v_partner IS NULL THEN
    RAISE EXCEPTION 'ASSIGNMENT_CANNOT_BE_CANCELLED: not authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_a FROM public.assignments
   WHERE id = p_assignment_id AND partner_id = v_partner
   FOR UPDATE;
   
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_a.status <> 'active' THEN
    RAISE EXCEPTION 'ASSIGNMENT_ALREADY_%', upper(v_a.status) USING ERRCODE = 'P0001';
  END IF;

  -- 1. Rule: CANNOT cancel if today's route has started
  SELECT EXISTS (
    SELECT 1 FROM public.services
     WHERE assignment_id = p_assignment_id
       AND scheduled_date = v_today
       AND status IN ('in_progress','completed')
  ) INTO v_started;

  IF v_started THEN
    RAISE EXCEPTION 'ASSIGNMENT_CANNOT_BE_CANCELLED: route already started' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Release all unstarted customers as a single batch
  SELECT count(*) INTO v_customer_count 
  FROM public.services 
  WHERE assignment_id = p_assignment_id AND status = 'pending';

  IF v_customer_count > 0 THEN
    -- Create a marketplace broadcast for the entire assignment
    INSERT INTO public.marketplace_broadcasts (
      assignment_id,
      customer_id, -- Use canceller ID or dummy to fulfill NOT NULL
      service_area_id,
      status,
      current_incentive,
      created_at
    ) VALUES (
      p_assignment_id,
      v_partner,
      v_a.home_zone_id,
      'open',
      v_a.rate_per_car,
      now()
    ) RETURNING id INTO v_bcast_id;

    -- Mark services as pending but unassigned
    UPDATE public.services
    SET partner_id = NULL,
        updated_at = now()
    WHERE assignment_id = p_assignment_id
      AND status = 'pending';
  END IF;

  -- 3. Cancel the assignment
  UPDATE public.assignments
     SET status = 'cancelled', 
         completed_at = now(),
         updated_at = now()
   WHERE id = p_assignment_id;

  UPDATE public.partners SET cars_selected = 0, updated_at = now() WHERE id = v_partner;

END $function$;

GRANT EXECUTE ON FUNCTION public.cancel_assignment(uuid) TO authenticated, service_role;
