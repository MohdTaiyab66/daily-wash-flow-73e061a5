
-- =========================================================================
-- 1. FIX: submit_service_unavailable must NOT auto-complete the assignment.
--    Assignments complete only via reaching end_date or explicit admin action.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.submit_service_unavailable(
  p_service_id uuid, p_reason text, p_notes text, p_photos text[], p_lat numeric, p_lng numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_partner uuid := auth.uid();
  v_credit numeric;
  v_balance numeric;
  v_assignment uuid;
  v_customer uuid;
  v_customer_user uuid;
  v_partner_name text;
  v_first_photo text;
  v_is_dirty boolean := (p_reason = 'dirty_vehicle');
  v_min_photos int;
  v_title text;
  v_body text;
  v_notification_id uuid;
  v_wallet_id uuid;
  v_dirty_report_id uuid;
  v_lead_id uuid;
  v_wallet_inserted boolean := false;
  v_service public.services%ROWTYPE;
  v_customer_row public.customers%ROWTYPE;
  v_done_count int := 0;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  v_min_photos := CASE WHEN v_is_dirty THEN 4 ELSE 2 END;
  IF p_photos IS NULL OR array_length(p_photos, 1) IS NULL OR array_length(p_photos, 1) < v_min_photos THEN
    RAISE EXCEPTION 'At least % photo(s) required', v_min_photos USING ERRCODE = 'P04PHOTO';
  END IF;

  IF NOT v_is_dirty AND p_reason NOT IN (
    'vehicle_not_available','parking_locked','customer_asked_to_skip','access_not_available',
    'customer_not_responding','vehicle_taken_out','keys_not_available','security_guard_denied','other'
  ) THEN
    RAISE EXCEPTION 'Unsupported unavailable reason' USING ERRCODE = 'P04REASON';
  END IF;

  IF p_reason = 'other' AND (p_notes IS NULL OR length(trim(p_notes)) = 0) THEN
    RAISE EXCEPTION 'Remarks required when reason is Other' USING ERRCODE = 'P04REM';
  END IF;

  v_first_photo := p_photos[1];

  SELECT * INTO v_service FROM public.services WHERE id = p_service_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_service.status = 'completed' THEN
    RAISE EXCEPTION 'Service is already completed';
  END IF;

  SELECT CASE
    WHEN jsonb_typeof(value) = 'number' THEN (value #>> '{}')::numeric
    WHEN jsonb_typeof(value) = 'string' AND trim(value #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$' THEN trim(value #>> '{}')::numeric
    ELSE 12
  END INTO v_credit
  FROM public.platform_settings WHERE key = 'unavailability_credit';
  v_credit := COALESCE(v_credit, 12);

  UPDATE public.services
  SET status = 'unavailable',
      unavailable_reason = p_reason,
      unavailable_notes = p_notes,
      unavailable_photo_url = v_first_photo,
      unavailable_photos = p_photos,
      unavailable_lat = NULLIF(p_lat, 0),
      unavailable_lng = NULLIF(p_lng, 0),
      unavailable_at = COALESCE(unavailable_at, now()),
      completed_at = COALESCE(completed_at, now()),
      updated_at = now()
  WHERE id = p_service_id
    AND partner_id = v_partner
    AND status IN ('pending', 'in_progress', 'unavailable')
  RETURNING * INTO v_service;

  IF v_service.id IS NULL THEN
    RAISE EXCEPTION 'Service not found or already completed';
  END IF;

  v_assignment := v_service.assignment_id;
  v_customer := v_service.customer_id;

  SELECT * INTO v_customer_row FROM public.customers WHERE id = v_customer;

  IF NOT v_is_dirty AND v_credit > 0 THEN
    SELECT COALESCE(balance_after, 0) INTO v_balance
    FROM public.wallet_ledger WHERE partner_id = v_partner
    ORDER BY created_at DESC LIMIT 1;
    v_balance := COALESCE(v_balance, 0) + v_credit;

    INSERT INTO public.wallet_ledger(partner_id, entry_type, amount, balance_after, description, service_id, assignment_id)
    SELECT v_partner, 'earning', v_credit, v_balance, 'Unavailable credit', p_service_id, v_assignment
    WHERE NOT EXISTS (SELECT 1 FROM public.wallet_ledger WHERE service_id = p_service_id AND entry_type = 'earning')
    RETURNING id INTO v_wallet_id;
    v_wallet_inserted := v_wallet_id IS NOT NULL;

    PERFORM set_config('app.bypass_partner_guard', 'on', true);
    UPDATE public.partners
      SET total_cars_completed = COALESCE(total_cars_completed, 0) + 1,
          lifetime_earnings = COALESCE(lifetime_earnings, 0) + v_credit,
          updated_at = now()
      WHERE id = v_partner;
    PERFORM set_config('app.bypass_partner_guard', 'off', true);
  END IF;

  -- Bookkeeping only: update fulfilled_cars & total_earnings. Do NOT flip
  -- assignment.status to 'completed' here — the assignment stays active for
  -- its full contractual duration. Completion is driven exclusively by
  -- end_date passing (nightly job) or explicit admin/partner action.
  IF v_assignment IS NOT NULL THEN
    SELECT count(*) INTO v_done_count
    FROM public.services
    WHERE assignment_id = v_assignment
      AND status IN ('completed', 'unavailable');

    UPDATE public.assignments
    SET fulfilled_cars = v_done_count,
        total_earnings = COALESCE(
          (SELECT sum(amount) FROM public.wallet_ledger
             WHERE assignment_id = v_assignment
               AND entry_type IN ('earning','bonus')), 0),
        last_modified_at = now()
    WHERE id = v_assignment;
  END IF;

  INSERT INTO public.unavailability_reports(
    service_id, partner_id, customer_id, reason, notes, photo_path, photos, lat, lng, credited_amount
  ) VALUES (
    p_service_id, v_partner, v_customer, p_reason, p_notes, v_first_photo, p_photos,
    NULLIF(p_lat, 0), NULLIF(p_lng, 0),
    CASE WHEN NOT v_is_dirty THEN v_credit ELSE 0 END
  );

  IF v_is_dirty THEN
    INSERT INTO public.dirty_vehicle_reports(
      service_id, partner_id, customer_id, notes, photos, lat, lng
    ) VALUES (
      p_service_id, v_partner, v_customer, p_notes, p_photos,
      NULLIF(p_lat, 0), NULLIF(p_lng, 0)
    )
    RETURNING id INTO v_dirty_report_id;
  END IF;

  SELECT full_name INTO v_partner_name FROM public.partners WHERE id = v_partner;
  SELECT user_id INTO v_customer_user FROM public.customer_profiles
    WHERE phone = v_customer_row.phone LIMIT 1;

  IF v_is_dirty THEN
    v_title := 'Dirty vehicle — Premium Wash required';
    v_body  := 'Your vehicle requires a Premium Wash before Daily Shine can continue.';
  ELSE
    v_title := 'Service could not be completed today';
    v_body  := 'Today''s Daily Shine service could not be completed because your vehicle was unavailable.';
  END IF;

  IF v_customer_user IS NOT NULL THEN
    INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
    VALUES (
      v_customer_user, 'service_unavailable', v_title, v_body, '/c/bookings',
      jsonb_build_object(
        'service_id', p_service_id, 'reason', p_reason, 'notes', p_notes,
        'photos', p_photos, 'partner_name', v_partner_name, 'is_dirty', v_is_dirty
      )
    ) RETURNING id INTO v_notification_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'service_id', p_service_id,
    'credited', v_wallet_inserted,
    'credit_amount', CASE WHEN v_wallet_inserted THEN v_credit ELSE 0 END,
    'notification_id', v_notification_id,
    'dirty_report_id', v_dirty_report_id
  );
END;
$function$;

-- =========================================================================
-- 2. NEW: idempotent daily-service regenerator.
--    Fills missing rows for every (customer,vehicle) on an active assignment
--    between p_from_date and the assignment's end_date, skipping the Monday
--    weekly-off (dow=1) and any dates that already have a row for that
--    (assignment,vehicle,scheduled_date) triple. Existing 'unavailable' /
--    'completed' rows are preserved untouched.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.regenerate_assignment_services(
  p_assignment_id uuid,
  p_from_date date DEFAULT CURRENT_DATE
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_a public.assignments%ROWTYPE;
  v_rate numeric;
  v_from date;
  v_inserted int := 0;
  work_day date;
  seq int;
  r record;
  v_covered boolean;
  v_pref text;
BEGIN
  SELECT * INTO v_a FROM public.assignments WHERE id = p_assignment_id;
  IF NOT FOUND OR v_a.status <> 'active' THEN RETURN 0; END IF;

  v_from := GREATEST(p_from_date, v_a.start_date);
  IF v_from > v_a.end_date THEN RETURN 0; END IF;
  v_rate := COALESCE(v_a.rate_per_car, 17);

  FOR work_day IN
    SELECT generate_series(v_from, v_a.end_date, interval '1 day')::date
  LOOP
    -- Sunday=0, Monday=1 (weekly off). Keep in sync with generate_services_for_queue.
    IF extract(dow FROM work_day)::int = 1 THEN CONTINUE; END IF;

    seq := 0;
    FOR r IN
      SELECT DISTINCT ON (s.customer_id, s.vehicle_id)
             s.customer_id, s.vehicle_id,
             COALESCE(c.preferred_time, '06:00 - 09:00') AS preferred_time,
             COALESCE(c.distance_km, 0) AS distance_km
      FROM public.services s
      LEFT JOIN public.customers c ON c.id = s.customer_id
      WHERE s.assignment_id = p_assignment_id
        AND s.vehicle_id IS NOT NULL
      ORDER BY s.customer_id, s.vehicle_id, s.created_at ASC
    LOOP
      seq := seq + 1;
      v_covered := public.customer_has_pro_booking_on(r.customer_id, work_day);
      v_pref := r.preferred_time;
      BEGIN
        INSERT INTO public.services (
          partner_id, customer_id, vehicle_id, assignment_id, scheduled_date,
          time_slot, sequence_no, rate_per_car, status, delay_reason
        ) VALUES (
          v_a.partner_id, r.customer_id, r.vehicle_id, v_a.id, work_day,
          v_pref, seq,
          CASE WHEN v_covered THEN 0 ELSE v_rate END,
          CASE WHEN v_covered THEN 'covered_by_booking' ELSE 'pending' END,
          CASE WHEN v_covered THEN 'covered_by_booking' ELSE NULL END
        );
        v_inserted := v_inserted + 1;
      EXCEPTION WHEN unique_violation THEN
        -- Row already exists for this (assignment,vehicle,date) — keep it.
        NULL;
      END;
    END LOOP;
  END LOOP;

  RETURN v_inserted;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.regenerate_assignment_services(uuid, date) TO service_role;

-- =========================================================================
-- 3. NEW: nightly sweep. Runs regeneration for every active assignment.
--    Safe/idempotent — inserts only where rows are missing.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.sweep_regenerate_active_assignments()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  a record;
  v_total int := 0;
BEGIN
  FOR a IN
    SELECT id FROM public.assignments
    WHERE status = 'active' AND end_date >= CURRENT_DATE
  LOOP
    v_total := v_total + public.regenerate_assignment_services(a.id, CURRENT_DATE);
  END LOOP;
  RETURN v_total;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.sweep_regenerate_active_assignments() TO service_role;

-- =========================================================================
-- 4. NEW: nightly close-out. Marks assignments 'completed' ONLY when
--    end_date has passed. This is the single legitimate auto-transition.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.close_expired_assignments()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_n int;
BEGIN
  UPDATE public.assignments
  SET status = 'completed',
      completed_at = COALESCE(completed_at, now()),
      last_modified_at = now()
  WHERE status = 'active'
    AND end_date < CURRENT_DATE;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.close_expired_assignments() TO service_role;
