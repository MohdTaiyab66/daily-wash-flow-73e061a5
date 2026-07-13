
-- Structured cancellability check + hardened cancel_assignment ------------------
-- Returns whether the caller's active assignment can currently be cancelled,
-- the cutoff timestamp, and a machine-readable reason when it cannot.
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

  SELECT * INTO v_a FROM public.assignments
   WHERE id = p_assignment_id AND partner_id = v_partner
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
    SELECT 1 FROM public.services
     WHERE assignment_id = p_assignment_id
       AND status IN ('in_progress','completed')
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

REVOKE ALL ON FUNCTION public.get_assignment_cancellability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_assignment_cancellability(uuid) TO authenticated, service_role;

-- Enforce the policy inside cancel_assignment. Raise SQLSTATE 'P0001' with a
-- machine-readable code prefix so the server function can surface a structured
-- error to the client without leaking implementation details.
CREATE OR REPLACE FUNCTION public.cancel_assignment(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_partner uuid := auth.uid();
  v_a public.assignments%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_shift_ts timestamptz;
  v_deadline timestamptz;
  v_started boolean;
  v_event_id uuid;
BEGIN
  IF v_partner IS NULL THEN
    RAISE EXCEPTION 'ASSIGNMENT_CANNOT_BE_CANCELLED: not authenticated' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public._setting_bool('allow_partner_cancel', true) THEN
    RAISE EXCEPTION 'ASSIGNMENT_CANNOT_BE_CANCELLED: partner cancellation disabled by admin' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_a FROM public.assignments
   WHERE id = p_assignment_id AND partner_id = v_partner
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_a.status <> 'active' THEN
    -- Idempotent: another device already cancelled/completed it.
    RAISE EXCEPTION 'ASSIGNMENT_ALREADY_%', upper(v_a.status) USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.services
     WHERE assignment_id = p_assignment_id
       AND status IN ('in_progress','completed')
  ) INTO v_started;

  IF v_started THEN
    RAISE EXCEPTION 'ASSIGNMENT_CANNOT_BE_CANCELLED: route already started' USING ERRCODE = 'P0001';
  END IF;

  v_shift_ts := ((GREATEST(v_a.start_date, v_today)::text || ' ' || COALESCE(v_a.expected_start_time,'07:00'))::timestamp
                AT TIME ZONE 'Asia/Kolkata');
  v_deadline := v_shift_ts - interval '8 hours';

  IF now() >= v_deadline THEN
    RAISE EXCEPTION 'ASSIGNMENT_CANNOT_BE_CANCELLED: cutoff passed' USING ERRCODE = 'P0001';
  END IF;

  -- Release today's pending services via the DAR recovery engine.
  v_event_id := public.dar_trigger_recovery(v_partner, 'cancelled');

  -- Future pending services beyond today are cancelled directly (DAR handles today).
  DELETE FROM public.services
   WHERE assignment_id = p_assignment_id
     AND partner_id = v_partner
     AND scheduled_date > CURRENT_DATE
     AND status = 'pending';

  UPDATE public.assignments
     SET status = 'cancelled', completed_at = now()
   WHERE id = p_assignment_id AND partner_id = v_partner;

  UPDATE public.partners SET cars_selected = 0, updated_at = now() WHERE id = v_partner;

  -- Log for ops visibility.
  INSERT INTO public.admin_alerts (kind, severity, title, body, meta)
  VALUES (
    'assignment_cancelled_by_partner',
    'info',
    'Partner cancelled assignment',
    'Assignment ' || p_assignment_id::text || ' cancelled before cutoff.',
    jsonb_build_object('assignment_id', p_assignment_id, 'partner_id', v_partner, 'dar_event_id', v_event_id)
  );
END $function$;

REVOKE ALL ON FUNCTION public.cancel_assignment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_assignment(uuid) TO authenticated, service_role;
