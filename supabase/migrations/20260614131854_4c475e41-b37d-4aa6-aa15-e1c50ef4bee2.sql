
CREATE OR REPLACE FUNCTION public.submit_service_unavailable(
  p_service_id UUID,
  p_reason TEXT,
  p_notes TEXT,
  p_photo TEXT,
  p_lat NUMERIC,
  p_lng NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_partner UUID := auth.uid();
  v_balance NUMERIC;
  v_credit NUMERIC := 12;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_photo IS NULL OR length(p_photo) = 0 THEN RAISE EXCEPTION 'Photo required'; END IF;
  IF p_reason IS NULL OR length(p_reason) = 0 THEN RAISE EXCEPTION 'Reason required'; END IF;

  UPDATE public.services SET
    status = 'unavailable',
    unavailable_reason = p_reason::text,
    unavailable_notes = p_notes,
    unavailable_photo = p_photo,
    unavailable_lat = p_lat,
    unavailable_lng = p_lng,
    completed_at = now()
  WHERE id = p_service_id AND partner_id = v_partner;

  SELECT COALESCE(balance_after, 0) INTO v_balance
    FROM public.wallet_ledger WHERE partner_id = v_partner
    ORDER BY created_at DESC LIMIT 1;
  v_balance := COALESCE(v_balance, 0) + v_credit;

  INSERT INTO public.wallet_ledger(partner_id, entry_type, amount, balance_after, description, service_id)
  VALUES (v_partner, 'credit', v_credit, v_balance, 'Customer unavailable visit', p_service_id);

  RETURN jsonb_build_object('ok', true, 'credited', v_credit);
END $$;
