
CREATE OR REPLACE FUNCTION public.admin_force_complete_service(
  p_service_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_name text;
  v_partner uuid;
  v_result jsonb;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_caller,'admin'::app_role) OR public.has_role(v_caller,'ops_manager'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='P04AU';
  END IF;

  SELECT partner_id INTO v_partner FROM public.services WHERE id = p_service_id;
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Service has no partner'; END IF;

  -- Run completion as the assigned partner so earnings/wallet credit correctly
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_partner::text, 'role','authenticated')::text, true);
  BEGIN
    v_result := public.partner_complete_service(p_service_id, NULL, NULL, p_reason, true);
  EXCEPTION WHEN OTHERS THEN
    -- Restore admin claims before re-raising for clean audit
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_caller::text, 'role','authenticated')::text, true);
    RAISE;
  END;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_caller::text, 'role','authenticated')::text, true);

  SELECT COALESCE(full_name, email) INTO v_caller_name
  FROM public.partners WHERE id = v_caller;

  INSERT INTO public.route_change_log(
    partner_id, service_id, date, actor_id, actor_name, action, reason, new_value
  ) VALUES (
    v_partner, p_service_id, CURRENT_DATE, v_caller, v_caller_name,
    'force_complete', p_reason,
    jsonb_build_object('admin', v_caller, 'reason', p_reason,
                       'partner_completion_result', v_result)
  );

  RETURN v_result || jsonb_build_object('forced', true);
END;
$$;
