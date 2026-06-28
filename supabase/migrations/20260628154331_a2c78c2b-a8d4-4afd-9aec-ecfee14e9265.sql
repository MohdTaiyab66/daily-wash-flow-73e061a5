
-- 1. Fix admin_route_dashboard: drop invalid enum value 'assigned' from filter
CREATE OR REPLACE FUNCTION public.admin_route_dashboard(_partner_id uuid, _date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
  _assigned int; _completed int; _pending int; _unavailable int; _dirty int;
  _distance numeric := 0; _drive_min numeric := 0; _clean_min numeric := 0;
  _cluster_count int; _backtrack int := 0; _fuel_rate numeric;
  _prev_lat numeric; _prev_lng numeric; _cur record; _last_cluster text; _km numeric;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_manager')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT (value)::text::numeric INTO _fuel_rate FROM platform_settings WHERE key='fuel_cost_per_km';
  _fuel_rate := COALESCE(_fuel_rate, 6);

  SELECT count(*) FILTER (WHERE TRUE),
         count(*) FILTER (WHERE status='completed'),
         count(*) FILTER (WHERE status IN ('pending','in_progress')),
         count(*) FILTER (WHERE status='unavailable')
    INTO _assigned, _completed, _pending, _unavailable
  FROM services WHERE partner_id=_partner_id AND scheduled_date=_date;

  SELECT count(*) INTO _dirty FROM dirty_vehicle_reports d
    JOIN services s ON s.id=d.service_id
    WHERE s.partner_id=_partner_id AND s.scheduled_date=_date;

  SELECT count(DISTINCT cluster_id) INTO _cluster_count
  FROM services WHERE partner_id=_partner_id AND scheduled_date=_date AND cluster_id IS NOT NULL;

  SELECT current_lat, current_lng INTO _prev_lat, _prev_lng FROM partners WHERE id=_partner_id;
  IF _prev_lat IS NULL THEN
    SELECT home_lat, home_lng INTO _prev_lat, _prev_lng FROM partners WHERE id=_partner_id;
  END IF;

  FOR _cur IN
    SELECT s.cluster_id, c.latitude AS lat, c.longitude AS lng
    FROM services s JOIN customers c ON c.id=s.customer_id
    WHERE s.partner_id=_partner_id AND s.scheduled_date=_date AND s.status<>'completed'
    ORDER BY COALESCE(s.manual_sequence_no, s.sequence_no) NULLS LAST
  LOOP
    IF _prev_lat IS NOT NULL AND _cur.lat IS NOT NULL THEN
      _km := 6371 * 2 * asin(sqrt(
        sin(radians((_cur.lat - _prev_lat)/2))^2 +
        cos(radians(_prev_lat))*cos(radians(_cur.lat))*sin(radians((_cur.lng - _prev_lng)/2))^2));
      _distance := _distance + _km;
      _drive_min := _drive_min + (_km/22.0)*60;
    END IF;
    _clean_min := _clean_min + 10;
    IF _last_cluster IS NOT NULL AND _cur.cluster_id IS NOT NULL
       AND _cur.cluster_id <> _last_cluster THEN
      _backtrack := _backtrack + 1;
    END IF;
    _last_cluster := _cur.cluster_id;
    _prev_lat := _cur.lat; _prev_lng := _cur.lng;
  END LOOP;

  _result := jsonb_build_object(
    'assigned', _assigned,
    'completed', _completed,
    'pending', _pending,
    'unavailable', _unavailable,
    'dirty_reports', _dirty,
    'distance_km', round(_distance::numeric, 2),
    'drive_minutes', round(_drive_min::numeric, 1),
    'cleaning_minutes', round(_clean_min::numeric, 1),
    'finish_minutes', round((_drive_min + _clean_min)::numeric, 1),
    'cluster_count', COALESCE(_cluster_count, 0),
    'backtracking', _backtrack,
    'fuel_estimate_rupees', round((_distance * _fuel_rate)::numeric, 0),
    'efficiency_score', GREATEST(0, LEAST(100,
      round(100 - (_backtrack * 8)::numeric -
        (CASE WHEN _assigned > 0 THEN (_distance / GREATEST(_assigned,1)) * 5 ELSE 0 END)::numeric)
    ))
  );
  RETURN _result;
END
$$;

REVOKE EXECUTE ON FUNCTION public.admin_route_dashboard(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_route_dashboard(uuid, date) TO authenticated;

-- 2. Allow admins / ops managers to read services and customers
-- (needed for Route Manager partner dropdown, stops list, map, clusters)
CREATE POLICY "Admins read services"
  ON public.services FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_manager'));

CREATE POLICY "Admins read customers"
  ON public.customers FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_manager'));

CREATE POLICY "Admins read partners"
  ON public.partners FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_manager'));
