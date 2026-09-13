DO $$
DECLARE
  v_sql text;
BEGIN
  SELECT pg_get_functiondef('public.partner_complete_service(uuid,numeric,numeric,text,boolean)'::regprocedure)
    INTO v_sql;
  v_sql := replace(v_sql, 'v_partner uuid := auth.uid();', 'v_partner uuid := public.resolve_partner_id(auth.uid());');
  EXECUTE v_sql;

  SELECT pg_get_functiondef('public.submit_service_unavailable(uuid,text,text,text[],numeric,numeric)'::regprocedure)
    INTO v_sql;
  v_sql := replace(v_sql, 'v_partner uuid := auth.uid();', 'v_partner uuid := public.resolve_partner_id(auth.uid());');
  EXECUTE v_sql;
END;
$$;