CREATE OR REPLACE FUNCTION public.submit_service_unavailable(
  p_service_id uuid,
  p_reason text,
  p_notes text,
  p_photos text[],
  p_lat numeric,
  p_lng numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  v_service_reason public.unavailable_reason;
  v_min_photos int;
  v_title text;
  v_body text;
  v_notification_id uuid;
  v_admin_alert_id uuid;
  v_wallet_id uuid;
  v_dirty_report_id uuid;
  v_unavailability_report_id uuid;
  v_wallet_inserted boolean := false;
  v_service public.services%ROWTYPE;
  v_customer_row public.customers%ROWTYPE;
  v_done_count int := 0;
BEGIN
  IF v_partner IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_min_photos := CASE WHEN v_is_dirty THEN 4 ELSE 2 END;
  IF p_photos IS NULL OR array_length(p_photos, 1) IS NULL OR array_length(p_photos, 1) < v_min_photos THEN
    RAISE EXCEPTION 'At least % photo(s) required', v_min_photos USING ERRCODE = 'P04PHOTO';
  END IF;

  IF v_is_dirty THEN
    v_service_reason := 'dirty_vehicle'::public.unavailable_reason;
  ELSE
    IF p_reason NOT IN (
      'vehicle_not_available','parking_locked','customer_asked_to_skip','access_not_available',
      'customer_not_responding','vehicle_taken_out','keys_not_available','security_guard_denied','other'
    ) THEN
      RAISE EXCEPTION 'Unsupported unavailable reason: %', p_reason USING ERRCODE = 'P04REASON';
    END IF;
    v_service_reason := p_reason::public.unavailable_reason;
  END IF;

  IF NOT v_is_dirty AND p_reason = 'other' AND (p_notes IS NULL OR length(trim(p_notes)) = 0) THEN
    RAISE EXCEPTION 'Remarks required when reason is Other' USING ERRCODE = 'P04REM';
  END IF;

  v_first_photo := p_photos[1];

  SELECT * INTO v_service
  FROM public.services
  WHERE id = p_service_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found';
  END IF;
  IF v_service.partner_id <> v_partner THEN
    RAISE EXCEPTION 'Service not assigned to this partner';
  END IF;
  IF v_service.status = 'completed' THEN
    RAISE EXCEPTION 'Service is already completed';
  END IF;

  SELECT CASE
    WHEN jsonb_typeof(value) = 'number' THEN (value #>> '{}')::numeric
    WHEN jsonb_typeof(value) = 'string' AND trim(value #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$' THEN trim(value #>> '{}')::numeric
    ELSE 12
  END INTO v_credit
  FROM public.platform_settings
  WHERE key = 'unavailability_credit';
  v_credit := COALESCE(v_credit, 12);

  UPDATE public.services
  SET status = 'unavailable',
      unavailable_reason = v_service_reason,
      unavailable_notes = p_notes,
      unavailable_photo = v_first_photo,
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

  SELECT * INTO v_customer_row
  FROM public.customers
  WHERE id = v_customer;

  IF v_credit > 0 THEN
    SELECT COALESCE(balance_after, 0) INTO v_balance
    FROM public.wallet_ledger
    WHERE partner_id = v_partner
    ORDER BY created_at DESC
    LIMIT 1;
    v_balance := COALESCE(v_balance, 0) + v_credit;

    INSERT INTO public.wallet_ledger(partner_id, entry_type, amount, balance_after, description, service_id, assignment_id)
    SELECT v_partner, 'earning', v_credit, v_balance,
           CASE WHEN v_is_dirty THEN 'Dirty vehicle credit' ELSE 'Unavailable credit' END,
           p_service_id, v_assignment
    WHERE NOT EXISTS (
      SELECT 1 FROM public.wallet_ledger
      WHERE service_id = p_service_id AND entry_type = 'earning'
    )
    RETURNING id INTO v_wallet_id;
    v_wallet_inserted := v_wallet_id IS NOT NULL;

    IF v_wallet_inserted THEN
      PERFORM set_config('app.bypass_partner_guard', 'on', true);
      UPDATE public.partners
      SET total_cars_completed = COALESCE(total_cars_completed, 0) + 1,
          lifetime_earnings = COALESCE(lifetime_earnings, 0) + v_credit,
          updated_at = now()
      WHERE id = v_partner;
      PERFORM set_config('app.bypass_partner_guard', 'off', true);
    END IF;
  END IF;

  IF v_assignment IS NOT NULL THEN
    SELECT count(*) INTO v_done_count
    FROM public.services
    WHERE assignment_id = v_assignment
      AND status IN ('completed', 'unavailable');

    UPDATE public.assignments
    SET fulfilled_cars = v_done_count,
        total_earnings = COALESCE(
          (SELECT sum(amount)
           FROM public.wallet_ledger
           WHERE assignment_id = v_assignment
             AND entry_type IN ('earning','bonus')), 0),
        last_modified_at = now()
    WHERE id = v_assignment;
  END IF;

  INSERT INTO public.unavailability_reports(
    service_id, partner_id, customer_id, reason, notes, photo_path, photos, lat, lng, credited_amount
  ) VALUES (
    p_service_id, v_partner, v_customer,
    CASE WHEN v_is_dirty THEN 'dirty_vehicle' ELSE p_reason END,
    p_notes, v_first_photo, p_photos,
    NULLIF(p_lat, 0), NULLIF(p_lng, 0),
    CASE WHEN v_wallet_inserted THEN v_credit ELSE 0 END
  )
  ON CONFLICT (service_id, reason) DO UPDATE
  SET notes = EXCLUDED.notes,
      photo_path = EXCLUDED.photo_path,
      photos = EXCLUDED.photos,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      credited_amount = public.unavailability_reports.credited_amount
  RETURNING id INTO v_unavailability_report_id;

  IF v_is_dirty THEN
    INSERT INTO public.dirty_vehicle_reports(
      service_id,
      partner_id,
      customer_id,
      reason,
      notes,
      photo_front,
      photo_rear,
      photo_left,
      photo_right,
      lat,
      lng,
      captured_at
    ) VALUES (
      p_service_id,
      v_partner,
      v_customer,
      COALESCE(NULLIF(split_part(COALESCE(p_notes, ''), ' · ', 1), ''), 'Dirty vehicle'),
      p_notes,
      p_photos[1],
      p_photos[2],
      p_photos[3],
      p_photos[4],
      NULLIF(p_lat, 0),
      NULLIF(p_lng, 0),
      now()
    )
    ON CONFLICT (service_id) DO UPDATE
    SET reason = EXCLUDED.reason,
        notes = EXCLUDED.notes,
        photo_front = EXCLUDED.photo_front,
        photo_rear = EXCLUDED.photo_rear,
        photo_left = EXCLUDED.photo_left,
        photo_right = EXCLUDED.photo_right,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        captured_at = EXCLUDED.captured_at
    RETURNING id INTO v_dirty_report_id;
  END IF;

  SELECT full_name INTO v_partner_name
  FROM public.partners
  WHERE id = v_partner;

  INSERT INTO public.admin_alerts(kind, severity, title, body, meta)
  VALUES (
    CASE WHEN v_is_dirty THEN 'dirty_vehicle' ELSE 'service_unavailable' END,
    CASE WHEN v_is_dirty THEN 'critical' ELSE 'warning' END,
    CASE WHEN v_is_dirty THEN 'Dirty vehicle reported' ELSE 'Service marked unavailable' END,
    COALESCE(v_partner_name, 'Partner') || ' reported ' || CASE WHEN v_is_dirty THEN 'a dirty vehicle' ELSE 'an unavailable service' END,
    jsonb_build_object(
      'service_id', p_service_id,
      'assignment_id', v_assignment,
      'partner_id', v_partner,
      'customer_id', v_customer,
      'reason', CASE WHEN v_is_dirty THEN 'dirty_vehicle' ELSE p_reason END,
      'notes', p_notes,
      'photos', p_photos,
      'dirty_report_id', v_dirty_report_id,
      'unavailability_report_id', v_unavailability_report_id
    )
  )
  RETURNING id INTO v_admin_alert_id;

  SELECT user_id INTO v_customer_user
  FROM public.customer_profiles
  WHERE phone = v_customer_row.phone
  LIMIT 1;

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
      v_customer_user,
      CASE WHEN v_is_dirty THEN 'dirty_vehicle' ELSE 'service_unavailable' END,
      v_title,
      v_body,
      '/c/bookings',
      jsonb_build_object(
        'service_id', p_service_id,
        'reason', CASE WHEN v_is_dirty THEN 'dirty_vehicle' ELSE p_reason END,
        'notes', p_notes,
        'photos', p_photos,
        'partner_name', v_partner_name,
        'is_dirty', v_is_dirty
      )
    )
    RETURNING id INTO v_notification_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'service_id', p_service_id,
    'credited', v_wallet_inserted,
    'credit_amount', CASE WHEN v_wallet_inserted THEN v_credit ELSE 0 END,
    'notification_id', v_notification_id,
    'admin_alert_id', v_admin_alert_id,
    'report_id', v_unavailability_report_id,
    'dirty_report_id', v_dirty_report_id,
    'wallet_entry_id', v_wallet_id,
    'photo_count', array_length(p_photos, 1)
  );
END;
$$;