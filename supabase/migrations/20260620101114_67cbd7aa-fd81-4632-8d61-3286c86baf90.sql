-- Parking issues: log only, do NOT credit ₹12 and do NOT mark service unavailable.
CREATE OR REPLACE FUNCTION public.submit_parking_issue(
  p_service_id uuid,
  p_reason text,
  p_notes text,
  p_photo text,
  p_lat numeric,
  p_lng numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner uuid := auth.uid();
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_photo IS NULL OR length(trim(p_photo)) = 0 THEN RAISE EXCEPTION 'Photo required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'Reason required'; END IF;

  INSERT INTO public.parking_reports(service_id, partner_id, reason, notes, photo_path)
  VALUES (p_service_id, v_partner, p_reason, NULLIF(p_notes,''), p_photo);

  RETURN jsonb_build_object('ok', true, 'credited', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_parking_issue(uuid, text, text, text, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_parking_issue(uuid, text, text, text, numeric, numeric) TO authenticated, service_role;