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
  v_partner_name text;
  v_first_photo text;
  v_is_dirty boolean := (p_reason = 'dirty_vehicle');
  v_min_photos int;
  v_title text;
  v_body text;
  v_notification_id uuid;
  v_alert_id uuid;
  v_wallet_id uuid;
  v_report_id uuid;
  v_dirty_report_id uuid;
  v_lead_id uuid;
  v_wallet_inserted boolean := false;
  v_service record;
  v_customer_row record;
BEGIN
  IF v_partner IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_min_photos := CASE WHEN v_is_dirty THEN 4 ELSE 2 END;
  IF p_photos IS NULL OR array_length(p_photos, 1) IS NULL OR array_length(p_photos, 1) < v_min_photos THEN
    RAISE EXCEPTION 'At least % photo(s) required', v_min_photos USING ERRCODE = 'P04PHOTO';
  END IF;

  IF p_reason = 'other' AND (p_notes IS NULL OR length(trim(p_notes)) = 0) THEN
    RAISE EXCEPTION 'Remarks required when reason is Other' USING ERRCODE = 'P04REM';
  END IF;

  v_first_photo := p_photos[1];

  SELECT COALESCE((value::text)::numeric, 12) INTO v_credit
  FROM public.platform_settings
  WHERE key = 'unavailable_compensation';
  IF v_credit IS NULL THEN
    v_credit := 12;
  END IF;

  SELECT full_name INTO v_partner_name FROM public.partners WHERE id = v_partner;

  UPDATE public.services
  SET status = 'unavailable',
      unavailable_reason = p_reason::public.unavailable_reason,
      unavailable_notes = NULLIF(p_notes, ''),
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

  SELECT * INTO v_customer_row FROM public.customers WHERE id = v_customer;

  SELECT COALESCE((SELECT balance_after FROM public.wallet_ledger WHERE partner_id = v_partner ORDER BY created_at DESC LIMIT 1), 0) + v_credit
  INTO v_balance;

  INSERT INTO public.wallet_ledger(partner_id, entry_type, amount, balance_after, description, service_id, assignment_id)
  SELECT v_partner,
         'earning',
         v_credit,
         v_balance,
         CASE WHEN v_is_dirty THEN 'Dirty vehicle reported' ELSE 'Customer unavailable visit' END,
         p_service_id,
         v_assignment
  WHERE NOT EXISTS (
    SELECT 1 FROM public.wallet_ledger WHERE service_id = p_service_id AND entry_type = 'earning'
  )
  RETURNING id INTO v_wallet_id;
  v_wallet_inserted := v_wallet_id IS NOT NULL;

  IF NOT v_wallet_inserted THEN
    SELECT id, balance_after INTO v_wallet_id, v_balance
    FROM public.wallet_ledger
    WHERE service_id = p_service_id AND entry_type = 'earning'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  SELECT id INTO v_report_id
  FROM public.unavailability_reports
  WHERE service_id = p_service_id AND reason = p_reason
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_report_id IS NULL THEN
    INSERT INTO public.unavailability_reports(
      service_id, partner_id, customer_id, reason, notes, photo_path, photos, lat, lng, credited_amount
    )
    VALUES (
      p_service_id, v_partner, v_customer, p_reason, NULLIF(p_notes, ''),
      v_first_photo, p_photos, NULLIF(p_lat, 0), NULLIF(p_lng, 0), v_credit
    )
    RETURNING id INTO v_report_id;
  ELSE
    UPDATE public.unavailability_reports
    SET notes = NULLIF(p_notes, ''),
        photo_path = v_first_photo,
        photos = p_photos,
        lat = NULLIF(p_lat, 0),
        lng = NULLIF(p_lng, 0),
        credited_amount = v_credit
    WHERE id = v_report_id;
  END IF;

  IF v_is_dirty THEN
    SELECT id INTO v_dirty_report_id
    FROM public.dirty_vehicle_reports
    WHERE service_id = p_service_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_dirty_report_id IS NULL THEN
      INSERT INTO public.dirty_vehicle_reports(
        service_id, partner_id, customer_id, reason, notes,
        photo_front, photo_rear, photo_left, photo_right,
        lat, lng, captured_at, recommendation
      )
      VALUES (
        p_service_id, v_partner, v_customer,
        COALESCE(NULLIF(split_part(COALESCE(p_notes, ''), ' · ', 1), ''), 'Dirty vehicle'),
        NULLIF(p_notes, ''),
        p_photos[1], p_photos[2], p_photos[3], p_photos[4],
        NULLIF(p_lat, 0), NULLIF(p_lng, 0), now(), 'premium_or_included_wash'
      )
      RETURNING id INTO v_dirty_report_id;
    ELSE
      UPDATE public.dirty_vehicle_reports
      SET reason = COALESCE(NULLIF(split_part(COALESCE(p_notes, ''), ' · ', 1), ''), 'Dirty vehicle'),
          notes = NULLIF(p_notes, ''),
          customer_id = v_customer,
          photo_front = p_photos[1],
          photo_rear = p_photos[2],
          photo_left = p_photos[3],
          photo_right = p_photos[4],
          lat = NULLIF(p_lat, 0),
          lng = NULLIF(p_lng, 0),
          captured_at = now(),
          recommendation = 'premium_or_included_wash'
      WHERE id = v_dirty_report_id;
    END IF;

    INSERT INTO public.service_leads(
      user_id, customer_name, customer_phone, vehicle_id, address_id, address_text,
      service_slug, service_name, service_category, price, payment_status,
      scheduled_date, status, notes, photos, metadata
    )
    SELECT
      v_customer,
      v_customer_row.full_name,
      v_customer_row.phone,
      v_service.vehicle_id,
      NULL,
      concat_ws(', ', v_customer_row.address_line, v_customer_row.area),
      'one-time-wash-premium',
      'Premium Wash recommended',
      'premium',
      0,
      'pending',
      CURRENT_DATE,
      'new',
      'Created automatically from Dirty Vehicle report',
      p_photos,
      jsonb_build_object(
        'source', 'dirty_vehicle_report',
        'service_id', p_service_id,
        'assignment_id', v_assignment,
        'dirty_report_id', v_dirty_report_id,
        'recommended_action', 'premium_or_included_wash'
      )
    WHERE NOT EXISTS (
      SELECT 1 FROM public.service_leads
      WHERE user_id = v_customer
        AND metadata->>'source' = 'dirty_vehicle_report'
        AND metadata->>'service_id' = p_service_id::text
    )
    RETURNING id INTO v_lead_id;
  END IF;

  IF v_is_dirty THEN
    v_title := 'Vehicle requires a Premium Wash';
    v_body  := 'Your vehicle requires a Premium Wash before Daily Shine can continue.';
  ELSE
    v_title := 'Service could not be completed today';
    v_body  := 'Today''s Daily Shine service could not be completed because your vehicle was unavailable.';
  END IF;

  INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
  VALUES (
    v_customer,
    CASE WHEN v_is_dirty THEN 'dirty_vehicle' ELSE 'service_unavailable' END,
    v_title,
    v_body,
    CASE WHEN v_is_dirty THEN '/c/subscriptions' ELSE '/c/bookings' END,
    jsonb_build_object(
      'service_id', p_service_id,
      'assignment_id', v_assignment,
      'partner_name', v_partner_name,
      'reason', p_reason,
      'photos', to_jsonb(p_photos),
      'dirty_vehicle_report_id', v_dirty_report_id,
      'premium_lead_id', v_lead_id,
      'recommended_action', CASE WHEN v_is_dirty THEN 'premium_or_included_wash' ELSE 'acknowledge' END
    )
  )
  RETURNING id INTO v_notification_id;

  INSERT INTO public.admin_alerts(kind, severity, title, body, meta)
  VALUES (
    CASE WHEN v_is_dirty THEN 'dirty_vehicle' ELSE 'service_unavailable' END,
    'warning',
    CASE WHEN v_is_dirty THEN 'Dirty vehicle reported' ELSE 'Service marked unavailable' END,
    COALESCE(v_partner_name, 'Partner') || ' reported ' || replace(p_reason, '_', ' ') || '.',
    jsonb_build_object(
      'service_id', p_service_id,
      'assignment_id', v_assignment,
      'partner_id', v_partner,
      'customer_id', v_customer,
      'reason', p_reason,
      'photos', to_jsonb(p_photos),
      'lat', NULLIF(p_lat, 0),
      'lng', NULLIF(p_lng, 0),
      'dirty_vehicle_report_id', v_dirty_report_id,
      'unavailability_report_id', v_report_id,
      'wallet_entry_id', v_wallet_id,
      'premium_lead_id', v_lead_id
    )
  )
  RETURNING id INTO v_alert_id;

  RETURN jsonb_build_object(
    'ok', true,
    'service_id', p_service_id,
    'service_status', 'unavailable',
    'assignment_id', v_assignment,
    'customer_id', v_customer,
    'credited', v_credit,
    'wallet_entry_id', v_wallet_id,
    'wallet_inserted', v_wallet_inserted,
    'wallet_balance', v_balance,
    'unavailability_report_id', v_report_id,
    'dirty_vehicle_report_id', v_dirty_report_id,
    'premium_lead_id', v_lead_id,
    'customer_notification_id', v_notification_id,
    'admin_alert_id', v_alert_id,
    'customer_notified', v_notification_id IS NOT NULL,
    'admin_notified', v_alert_id IS NOT NULL,
    'photo_count', array_length(p_photos, 1),
    'reason', p_reason
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_service_unavailable(uuid, text, text, text[], numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_service_unavailable(uuid, text, text, text[], numeric, numeric) TO authenticated, service_role;