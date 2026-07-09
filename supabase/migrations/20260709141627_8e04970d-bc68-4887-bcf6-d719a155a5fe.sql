
INSERT INTO public.platform_settings (key, value)
VALUES ('route_visibility_override', '"auto"'::jsonb)
ON CONFLICT (key) DO NOTHING;

DROP FUNCTION IF EXISTS public.get_route_visibility(uuid);

CREATE OR REPLACE FUNCTION public.get_route_visibility(p_partner uuid)
 RETURNS TABLE(visible boolean, unlock_at timestamp with time zone, shift_start text, assignment_id uuid, override text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_a public.assignments%ROWTYPE;
  v_hours int;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_shift_ts timestamptz;
  v_unlock timestamptz;
  v_override text;
BEGIN
  v_override := COALESCE(
    (SELECT trim(both '"' FROM value::text) FROM public.platform_settings WHERE key = 'route_visibility_override'),
    'auto'
  );

  SELECT * INTO v_a
  FROM public.assignments
  WHERE partner_id = p_partner
    AND status = 'active'
    AND start_date <= v_today
    AND end_date >= v_today
  ORDER BY start_date DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT true, NULL::timestamptz, NULL::text, NULL::uuid, v_override;
    RETURN;
  END IF;

  v_hours := COALESCE(v_a.route_visibility_hours,
    (SELECT (value::text)::int FROM public.platform_settings WHERE key='route_visibility_hours'),
    6);

  v_shift_ts := ((v_today::text || ' ' || COALESCE(v_a.expected_start_time,'07:00'))::timestamp
                AT TIME ZONE 'Asia/Kolkata');
  v_unlock := v_shift_ts - (v_hours || ' hours')::interval;

  IF v_override = 'show' THEN
    RETURN QUERY SELECT true, v_unlock, v_a.expected_start_time, v_a.id, v_override;
  ELSIF v_override = 'hide' THEN
    RETURN QUERY SELECT false, v_unlock, v_a.expected_start_time, v_a.id, v_override;
  ELSE
    RETURN QUERY SELECT (now() >= v_unlock), v_unlock, v_a.expected_start_time, v_a.id, v_override;
  END IF;
END $function$;
