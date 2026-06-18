
-- Update guard to honor a session-local bypass flag set by trusted SECURITY DEFINER functions
CREATE OR REPLACE FUNCTION public.guard_partner_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Trusted internal writers (our SECURITY DEFINER fns / triggers) set this GUC for the txn
  IF current_setting('app.bypass_partner_guard', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.rate_per_car IS DISTINCT FROM OLD.rate_per_car
     OR NEW.level IS DISTINCT FROM OLD.level
     OR NEW.lifetime_earnings IS DISTINCT FROM OLD.lifetime_earnings
     OR NEW.aadhaar_verified IS DISTINCT FROM OLD.aadhaar_verified
     OR NEW.pan_verified IS DISTINCT FROM OLD.pan_verified
     OR NEW.bank_verified IS DISTINCT FROM OLD.bank_verified
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.id IS DISTINCT FROM OLD.id
  THEN
    RAISE EXCEPTION 'Cannot modify privileged partner fields';
  END IF;

  RETURN NEW;
END;
$function$;

-- Complete-service trigger: set bypass before touching partners
CREATE OR REPLACE FUNCTION public.tg_credit_completed_service()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_balance numeric;
  v_amount numeric;
BEGIN
  IF NEW.status = 'completed'::service_status AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_amount := COALESCE(NEW.rate_per_car, (SELECT COALESCE((value::text)::numeric, 17) FROM public.platform_settings WHERE key = 'rate_per_car'), 17);

    SELECT COALESCE(balance_after, 0) INTO v_balance
    FROM public.wallet_ledger
    WHERE partner_id = NEW.partner_id
    ORDER BY created_at DESC
    LIMIT 1;
    v_balance := COALESCE(v_balance, 0) + v_amount;

    INSERT INTO public.wallet_ledger(partner_id, entry_type, amount, balance_after, description, service_id, assignment_id)
    SELECT NEW.partner_id, 'earning', v_amount, v_balance, 'Service completed', NEW.id, NEW.assignment_id
    WHERE NEW.partner_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.wallet_ledger WHERE service_id = NEW.id AND entry_type = 'earning');

    PERFORM set_config('app.bypass_partner_guard', 'on', true);
    UPDATE public.partners
      SET total_cars_completed = COALESCE(total_cars_completed, 0) + 1,
          lifetime_earnings = COALESCE(lifetime_earnings, 0) + v_amount,
          updated_at = now()
      WHERE id = NEW.partner_id
        AND EXISTS (SELECT 1 FROM public.wallet_ledger WHERE service_id = NEW.id AND entry_type = 'earning');
    PERFORM set_config('app.bypass_partner_guard', 'off', true);
  END IF;
  RETURN NEW;
END;
$function$;

-- Unavailable RPC: set bypass before touching partners
CREATE OR REPLACE FUNCTION public.submit_service_unavailable(p_service_id uuid, p_reason text, p_notes text, p_photo text, p_lat numeric, p_lng numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    PERFORM set_config('app.bypass_partner_guard', 'on', true);
    UPDATE public.partners
      SET lifetime_earnings = COALESCE(lifetime_earnings, 0) + v_credit,
          updated_at = now()
      WHERE id = v_partner;
    PERFORM set_config('app.bypass_partner_guard', 'off', true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'credited', CASE WHEN v_inserted > 0 THEN v_credit ELSE 0 END);
END
$function$;
