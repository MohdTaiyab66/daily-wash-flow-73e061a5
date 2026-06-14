
-- 1. Add unavailable_photo column on services
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS unavailable_photo TEXT,
  ADD COLUMN IF NOT EXISTS unavailable_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS unavailable_lng NUMERIC;

-- 2. Monthly wash tracker on customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS interior_wash_done_date DATE,
  ADD COLUMN IF NOT EXISTS interior_wash_partner_id UUID,
  ADD COLUMN IF NOT EXISTS exterior_wash_done_date DATE,
  ADD COLUMN IF NOT EXISTS exterior_wash_partner_id UUID;

-- 3. Submit-unavailable RPC: stores photo + credits ₹12 to partner wallet
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

  INSERT INTO public.wallet_ledger(partner_id, entry_type, amount, balance_after, description, reference_id)
  VALUES (v_partner, 'credit', v_credit, v_balance, 'Customer unavailable visit', p_service_id);

  RETURN jsonb_build_object('ok', true, 'credited', v_credit);
END $$;

-- 4. Admin mark monthly wash done
CREATE OR REPLACE FUNCTION public.admin_mark_monthly_wash(
  p_customer_id UUID,
  p_kind TEXT,           -- 'interior' or 'exterior'
  p_done_date DATE,
  p_partner_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_kind = 'interior' THEN
    UPDATE public.customers
      SET interior_wash_done_date = p_done_date,
          interior_wash_partner_id = p_partner_id,
          updated_at = now()
      WHERE id = p_customer_id;
  ELSIF p_kind = 'exterior' THEN
    UPDATE public.customers
      SET exterior_wash_done_date = p_done_date,
          exterior_wash_partner_id = p_partner_id,
          updated_at = now()
      WHERE id = p_customer_id;
  ELSE
    RAISE EXCEPTION 'kind must be interior or exterior';
  END IF;
END $$;

-- 5. Shorten photo retention from 7 days → 48 hours
CREATE OR REPLACE FUNCTION public.cleanup_old_service_photos()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_paths text[];
  v_deleted int;
BEGIN
  SELECT array_agg(storage_path) INTO v_paths
    FROM public.service_photos
    WHERE captured_at < now() - INTERVAL '48 hours';

  IF v_paths IS NOT NULL THEN
    DELETE FROM storage.objects
      WHERE bucket_id = 'service-photos' AND name = ANY(v_paths);
  END IF;

  DELETE FROM public.service_photos WHERE captured_at < now() - INTERVAL '48 hours';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_deleted, 'at', now());
END $$;
