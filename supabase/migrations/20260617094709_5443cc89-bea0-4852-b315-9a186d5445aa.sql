CREATE OR REPLACE FUNCTION public.submit_service_unavailable(p_service_id uuid, p_reason text, p_notes text, p_photo text, p_lat numeric, p_lng numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_balance numeric;
  v_credit numeric := 12;
  v_updated int;
  v_inserted int := 0;
  v_assignment uuid;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_photo IS NULL OR length(trim(p_photo)) = 0 THEN RAISE EXCEPTION 'Photo required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'Reason required'; END IF;
  SELECT COALESCE((value::text)::numeric, 12) INTO v_credit FROM public.platform_settings WHERE key = 'unavailable_compensation';

  UPDATE public.services SET
    status = 'unavailable',
    unavailable_reason = p_reason::unavailable_reason,
    unavailable_notes = NULLIF(p_notes, ''),
    unavailable_photo = p_photo,
    unavailable_lat = NULLIF(p_lat, 0),
    unavailable_lng = NULLIF(p_lng, 0),
    completed_at = COALESCE(completed_at, now())
  WHERE id = p_service_id
    AND partner_id = v_partner
    AND status IN ('pending', 'in_progress', 'unavailable')
  RETURNING assignment_id INTO v_assignment;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'Service not found, already closed, or not assigned to you';
  END IF;

  SELECT COALESCE(balance_after, 0) INTO v_balance
    FROM public.wallet_ledger WHERE partner_id = v_partner
    ORDER BY created_at DESC LIMIT 1;
  v_balance := COALESCE(v_balance, 0) + v_credit;

  INSERT INTO public.wallet_ledger(partner_id, entry_type, amount, balance_after, description, service_id, assignment_id)
  SELECT v_partner, 'earning', v_credit, v_balance, 'Customer unavailable visit', p_service_id, v_assignment
  WHERE NOT EXISTS (SELECT 1 FROM public.wallet_ledger WHERE service_id = p_service_id AND entry_type = 'earning');
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted > 0 THEN
    UPDATE public.partners
      SET lifetime_earnings = COALESCE(lifetime_earnings, 0) + v_credit,
          updated_at = now()
      WHERE id = v_partner;
  END IF;

  RETURN jsonb_build_object('ok', true, 'credited', CASE WHEN v_inserted > 0 THEN v_credit ELSE 0 END);
END
$$;

REVOKE EXECUTE ON FUNCTION public.submit_service_unavailable(uuid, text, text, text, numeric, numeric) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_service_unavailable(uuid, text, text, text, numeric, numeric) TO authenticated, service_role;