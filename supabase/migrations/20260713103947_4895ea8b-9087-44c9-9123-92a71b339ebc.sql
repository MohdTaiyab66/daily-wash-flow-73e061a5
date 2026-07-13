CREATE OR REPLACE FUNCTION public.get_assignment_cancellability(p_assignment_id uuid)
RETURNS TABLE(
  can_cancel boolean,
  reason text,
  deadline_at timestamptz,
  shift_start_at timestamptz,
  route_started boolean,
  status text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_a public.assignments%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_shift_ts timestamptz;
  v_deadline timestamptz;
  v_started boolean;
BEGIN
  IF v_partner IS NULL THEN
    RETURN QUERY SELECT false, 'NOT_AUTHENTICATED', NULL::timestamptz, NULL::timestamptz, false, NULL::text;
    RETURN;
  END IF;

  SELECT * INTO v_a FROM public.assignments a
   WHERE a.id = p_assignment_id AND a.partner_id = v_partner
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'NOT_FOUND', NULL::timestamptz, NULL::timestamptz, false, NULL::text;
    RETURN;
  END IF;

  IF v_a.status <> 'active' THEN
    RETURN QUERY SELECT false, 'ALREADY_' || upper(v_a.status), NULL::timestamptz, NULL::timestamptz, false, v_a.status;
    RETURN;
  END IF;

  v_shift_ts := ((GREATEST(v_a.start_date, v_today)::text || ' ' || COALESCE(v_a.expected_start_time,'07:00'))::timestamp
                AT TIME ZONE 'Asia/Kolkata');
  v_deadline := v_shift_ts - interval '8 hours';

  SELECT EXISTS (
    SELECT 1 FROM public.services s
     WHERE s.assignment_id = p_assignment_id
       AND s.status IN ('in_progress','completed')
  ) INTO v_started;

  IF v_started THEN
    RETURN QUERY SELECT false, 'ROUTE_STARTED', v_deadline, v_shift_ts, true, v_a.status;
    RETURN;
  END IF;

  IF now() >= v_deadline THEN
    RETURN QUERY SELECT false, 'CUTOFF_PASSED', v_deadline, v_shift_ts, false, v_a.status;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'OK', v_deadline, v_shift_ts, false, v_a.status;
END $$;