
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS unavailable_at timestamptz,
  ADD COLUMN IF NOT EXISTS delay_reason text;

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS current_lat numeric,
  ADD COLUMN IF NOT EXISTS current_lng numeric;

CREATE TABLE IF NOT EXISTS public.route_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid,
  service_id uuid,
  date date NOT NULL DEFAULT CURRENT_DATE,
  actor_id uuid,
  actor_name text,
  action text NOT NULL,
  reason text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.route_change_log TO authenticated;
GRANT ALL ON public.route_change_log TO service_role;
ALTER TABLE public.route_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read route change log"
  ON public.route_change_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_manager'));
CREATE POLICY "Admins can insert route change log"
  ON public.route_change_log FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_manager'));
CREATE INDEX IF NOT EXISTS idx_rcl_partner_date ON public.route_change_log(partner_id, date DESC);

CREATE TABLE IF NOT EXISTS public.route_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL,
  date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('original','recalc','manual','optimize_all')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','applied')),
  sequence jsonb NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.route_snapshots TO authenticated;
GRANT ALL ON public.route_snapshots TO service_role;
ALTER TABLE public.route_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read route snapshots"
  ON public.route_snapshots FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_manager'));
CREATE POLICY "Admins write route snapshots"
  ON public.route_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_manager'));
CREATE POLICY "Admins update route snapshots"
  ON public.route_snapshots FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_manager'));
CREATE INDEX IF NOT EXISTS idx_rs_partner_date ON public.route_snapshots(partner_id, date DESC);

INSERT INTO public.platform_settings(key, value, description)
VALUES ('fuel_cost_per_km', '6'::jsonb, 'Rupees per km used for fuel estimates')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_log_route_action(
  _partner_id uuid, _service_id uuid, _date date,
  _action text, _reason text, _old jsonb, _new jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _name text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_manager')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT full_name INTO _name FROM public.customer_profiles WHERE user_id = auth.uid();
  INSERT INTO public.route_change_log(partner_id, service_id, date, actor_id, actor_name, action, reason, old_value, new_value)
  VALUES (_partner_id, _service_id, COALESCE(_date, CURRENT_DATE), auth.uid(), _name, _action, _reason, _old, _new)
  RETURNING id INTO _id;
  RETURN _id;
END$$;
REVOKE EXECUTE ON FUNCTION public.admin_log_route_action(uuid,uuid,date,text,text,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_log_route_action(uuid,uuid,date,text,text,jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_route_dashboard(_partner_id uuid, _date date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
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
         count(*) FILTER (WHERE status IN ('pending','in_progress','assigned')),
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
END$$;
REVOKE EXECUTE ON FUNCTION public.admin_route_dashboard(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_route_dashboard(uuid,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_route_timeline(_partner_id uuid, _date date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  _stops jsonb := '[]'::jsonb;
  _prev_lat numeric; _prev_lng numeric;
  _eta_min int := 6*60 + 30;
  _cur record; _km numeric; _leg_min int;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_manager')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT COALESCE(current_lat, home_lat), COALESCE(current_lng, home_lng)
    INTO _prev_lat, _prev_lng FROM partners WHERE id=_partner_id;

  FOR _cur IN
    SELECT s.id, s.status::text AS status, s.cluster_id, c.full_name,
           c.latitude AS lat, c.longitude AS lng,
           c.service_required_before, c.exact_time, c.time_window_type
    FROM services s JOIN customers c ON c.id=s.customer_id
    WHERE s.partner_id=_partner_id AND s.scheduled_date=_date
    ORDER BY (s.status='completed') DESC,
             COALESCE(s.manual_sequence_no, s.sequence_no) NULLS LAST
  LOOP
    _km := CASE WHEN _prev_lat IS NOT NULL AND _cur.lat IS NOT NULL THEN
      6371 * 2 * asin(sqrt(
        sin(radians((_cur.lat - _prev_lat)/2))^2 +
        cos(radians(_prev_lat))*cos(radians(_cur.lat))*sin(radians((_cur.lng - _prev_lng)/2))^2))
      ELSE 0 END;
    _leg_min := CEIL((_km/22.0)*60);
    _eta_min := _eta_min + _leg_min;
    _stops := _stops || jsonb_build_object(
      'service_id', _cur.id,
      'name', _cur.full_name,
      'status', _cur.status,
      'cluster_id', _cur.cluster_id,
      'leg_km', round(_km::numeric, 2),
      'leg_minutes', _leg_min,
      'eta', lpad((_eta_min/60)::text, 2, '0') || ':' || lpad((_eta_min%60)::text, 2, '0'),
      'service_minutes', 10,
      'exact_time', _cur.exact_time,
      'window_type', _cur.time_window_type,
      'preferred_before', _cur.service_required_before
    );
    _eta_min := _eta_min + 10;
    _prev_lat := _cur.lat; _prev_lng := _cur.lng;
  END LOOP;
  RETURN _stops;
END$$;
REVOKE EXECUTE ON FUNCTION public.admin_route_timeline(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_route_timeline(uuid,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_remove_service(_service_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row services%ROWTYPE;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_manager')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO _row FROM services WHERE id=_service_id;
  UPDATE services SET status='unavailable', delay_reason=_reason,
                       unavailable_at=now(), updated_at=now()
    WHERE id=_service_id;
  PERFORM public.admin_log_route_action(_row.partner_id, _service_id, _row.scheduled_date,
    'remove', _reason, to_jsonb(_row), jsonb_build_object('status','unavailable'));
END$$;
REVOKE EXECUTE ON FUNCTION public.admin_remove_service(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_service(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_accept_recalc(_snapshot_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _snap route_snapshots%ROWTYPE; _id text; _idx int := 1;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_manager')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO _snap FROM route_snapshots WHERE id=_snapshot_id;
  IF _snap.status <> 'pending' THEN RAISE EXCEPTION 'snapshot not pending'; END IF;
  FOR _id IN SELECT jsonb_array_elements_text(_snap.sequence) LOOP
    UPDATE services SET manual_sequence_no=_idx, updated_at=now() WHERE id=_id::uuid;
    _idx := _idx + 1;
  END LOOP;
  UPDATE route_snapshots SET status='applied' WHERE id=_snapshot_id;
  PERFORM public.admin_log_route_action(_snap.partner_id, NULL, _snap.date,
    'accept_recalc', NULL, NULL, jsonb_build_object('snapshot_id', _snapshot_id));
END$$;
REVOKE EXECUTE ON FUNCTION public.admin_accept_recalc(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_accept_recalc(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reject_recalc(_snapshot_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _snap route_snapshots%ROWTYPE;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_manager')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO _snap FROM route_snapshots WHERE id=_snapshot_id;
  UPDATE route_snapshots SET status='rejected' WHERE id=_snapshot_id;
  PERFORM public.admin_log_route_action(_snap.partner_id, NULL, _snap.date,
    'reject_recalc', NULL, NULL, jsonb_build_object('snapshot_id', _snapshot_id));
END$$;
REVOKE EXECUTE ON FUNCTION public.admin_reject_recalc(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_recalc(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_optimize_all(_date date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _out jsonb := '[]'::jsonb;
  _p record; _seq jsonb; _ids uuid[]; _snap_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_manager')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR _p IN
    SELECT DISTINCT partner_id FROM services
    WHERE scheduled_date=_date AND partner_id IS NOT NULL AND status<>'completed'
  LOOP
    SELECT array_agg(s.id ORDER BY
      CASE WHEN s.is_emergency THEN 0 ELSE 1 END,
      s.locked_position DESC NULLS LAST,
      c.latitude, c.longitude)
    INTO _ids
    FROM services s JOIN customers c ON c.id=s.customer_id
    WHERE s.partner_id=_p.partner_id AND s.scheduled_date=_date AND s.status<>'completed';

    _seq := to_jsonb(_ids);
    INSERT INTO route_snapshots(partner_id, date, kind, status, sequence, metrics, created_by)
    VALUES (_p.partner_id, _date, 'optimize_all', 'pending', _seq,
            (SELECT public.admin_route_dashboard(_p.partner_id, _date)), auth.uid())
    RETURNING id INTO _snap_id;
    _out := _out || jsonb_build_object('partner_id', _p.partner_id,
              'snapshot_id', _snap_id, 'count', array_length(_ids,1));
  END LOOP;
  RETURN _out;
END$$;
REVOKE EXECUTE ON FUNCTION public.admin_optimize_all(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_optimize_all(date) TO authenticated;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.route_change_log; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.route_snapshots; EXCEPTION WHEN duplicate_object THEN NULL; END;
END$$;
