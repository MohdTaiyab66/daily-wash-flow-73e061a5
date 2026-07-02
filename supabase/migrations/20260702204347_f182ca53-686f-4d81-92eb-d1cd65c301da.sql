
-- 1. Extend enum with new reasons (idempotent)
DO $$ BEGIN
  ALTER TYPE public.unavailable_reason ADD VALUE IF NOT EXISTS 'vehicle_taken_out';
  ALTER TYPE public.unavailable_reason ADD VALUE IF NOT EXISTS 'keys_not_available';
  ALTER TYPE public.unavailable_reason ADD VALUE IF NOT EXISTS 'security_guard_denied';
  ALTER TYPE public.unavailable_reason ADD VALUE IF NOT EXISTS 'other';
END $$;

-- 2. Multiple-photo storage
ALTER TABLE public.unavailability_reports
  ADD COLUMN IF NOT EXISTS photos text[] NOT NULL DEFAULT '{}';

-- 3. New RPC signature that accepts a photo array
DROP FUNCTION IF EXISTS public.submit_service_unavailable(uuid, text, text, text, numeric, numeric);
DROP FUNCTION IF EXISTS public.submit_service_unavailable(uuid, text, text, text[], numeric, numeric);

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
SET search_path = public
AS $function$
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
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Dirty: caller has already stored 4 dedicated photos in dirty_vehicle_reports.
  -- Unavailable: require min 2 proof photos captured live.
  v_min_photos := CASE WHEN v_is_dirty THEN 1 ELSE 2 END;
  IF p_photos IS NULL OR array_length(p_photos, 1) IS NULL OR array_length(p_photos, 1) < v_min_photos THEN
    RAISE EXCEPTION 'At least % photo(s) required', v_min_photos USING ERRCODE = 'P04PHOTO';
  END IF;

  IF p_reason = 'other' AND (p_notes IS NULL OR length(trim(p_notes)) = 0) THEN
    RAISE EXCEPTION 'Remarks required when reason is Other' USING ERRCODE = 'P04REM';
  END IF;

  v_first_photo := p_photos[1];

  SELECT COALESCE((value::text)::numeric, 12) INTO v_credit
  FROM public.platform_settings WHERE key = 'unavailable_compensation';
  IF v_credit IS NULL THEN v_credit := 12; END IF;

  SELECT full_name INTO v_partner_name FROM public.partners WHERE id = v_partner;

  UPDATE public.services
  SET status = 'unavailable',
      unavailable_reason = p_reason::unavailable_reason,
      unavailable_notes = NULLIF(p_notes, ''),
      unavailable_photo = v_first_photo,
      unavailable_lat = NULLIF(p_lat, 0),
      unavailable_lng = NULLIF(p_lng, 0),
      completed_at = now(),
      updated_at = now()
  WHERE id = p_service_id
    AND partner_id = v_partner
    AND status IN ('pending', 'in_progress', 'unavailable')
  RETURNING assignment_id, customer_id INTO v_assignment, v_customer;

  IF v_assignment IS NULL THEN RAISE EXCEPTION 'Service not found or already completed'; END IF;

  SELECT COALESCE((SELECT balance_after FROM public.wallet_ledger WHERE partner_id = v_partner ORDER BY created_at DESC LIMIT 1), 0) + v_credit
  INTO v_balance;
  INSERT INTO public.wallet_ledger(partner_id, entry_type, amount, balance_after, description, service_id, assignment_id)
  SELECT v_partner, 'earning', v_credit, v_balance,
         CASE WHEN v_is_dirty THEN 'Dirty vehicle reported' ELSE 'Customer unavailable visit' END,
         p_service_id, v_assignment
  WHERE NOT EXISTS (SELECT 1 FROM public.wallet_ledger WHERE service_id = p_service_id AND entry_type = 'earning');

  INSERT INTO public.unavailability_reports(
    service_id, partner_id, customer_id, reason, notes, photo_path, photos, lat, lng, credited_amount
  )
  VALUES (
    p_service_id, v_partner, v_customer, p_reason, NULLIF(p_notes, ''),
    v_first_photo, p_photos, NULLIF(p_lat, 0), NULLIF(p_lng, 0), v_credit
  )
  ON CONFLICT DO NOTHING;

  IF v_is_dirty THEN
    v_title := 'Vehicle requires a Premium Wash';
    v_body  := 'Your vehicle is too dirty for Daily Shine today. Please book a Premium Wash or schedule an included wash to continue.';
  ELSE
    v_title := 'Service could not be completed today';
    v_body  := 'Your Daily Shine could not be completed today because: ' || replace(p_reason, '_', ' ') || '.';
  END IF;

  INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
  VALUES (
    v_customer,
    CASE WHEN v_is_dirty THEN 'dirty_vehicle' ELSE 'service_unavailable' END,
    v_title, v_body,
    CASE WHEN v_is_dirty THEN '/c/subscriptions' ELSE '/c/bookings' END,
    jsonb_build_object(
      'service_id', p_service_id,
      'partner_name', v_partner_name,
      'reason', p_reason,
      'photos', to_jsonb(p_photos)
    )
  );

  INSERT INTO public.admin_alerts(kind, severity, title, message, metadata)
  VALUES (
    CASE WHEN v_is_dirty THEN 'dirty_vehicle' ELSE 'service_unavailable' END,
    'warning',
    CASE WHEN v_is_dirty THEN 'Dirty vehicle reported' ELSE 'Service marked unavailable' END,
    COALESCE(v_partner_name, 'Partner') || ' reported ' || replace(p_reason, '_', ' ') || '.',
    jsonb_build_object(
      'service_id', p_service_id, 'partner_id', v_partner, 'customer_id', v_customer,
      'reason', p_reason, 'photos', to_jsonb(p_photos)
    )
  );

  RETURN jsonb_build_object(
    'ok', true, 'credited', v_credit, 'customer_notified', true, 'admin_notified', true,
    'photo_count', array_length(p_photos, 1)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.submit_service_unavailable(uuid, text, text, text[], numeric, numeric) TO authenticated;
