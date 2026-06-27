
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS eta_at timestamptz,
  ADD COLUMN IF NOT EXISTS travel_min integer,
  ADD COLUMN IF NOT EXISTS distance_km numeric(6,2),
  ADD COLUMN IF NOT EXISTS last_sequence_change_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sequence_change_by uuid;

DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='services';
  IF NOT FOUND THEN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.services'; END IF;
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='customer_notifications';
  IF NOT FOUND THEN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_notifications'; END IF;
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='partner_notifications';
  IF NOT FOUND THEN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_notifications'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_route_search_customers(p_query text, p_date date)
RETURNS TABLE(
  customer_id uuid, service_id uuid, full_name text, phone text, area text,
  address_line text, vehicle_reg text, vehicle_model text, preferred_time text,
  current_partner_id uuid, current_partner_name text, status text,
  has_active_subscription boolean
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    c.id, s.id, c.full_name, c.phone, c.area, c.address_line,
    cv.registration_number,
    NULLIF(trim(coalesce(cv.make,'')||' '||coalesce(cv.model,'')), ''),
    c.preferred_time,
    s.partner_id, p.full_name, s.status::text,
    EXISTS(SELECT 1 FROM public.subscriptions sub
           WHERE sub.customer_id = c.id AND sub.status = 'active'
             AND sub.start_date <= p_date
             AND (sub.renewal_date IS NULL OR sub.renewal_date >= p_date))
  FROM public.customers c
  LEFT JOIN public.services s ON s.customer_id = c.id AND s.scheduled_date = p_date
  LEFT JOIN public.customer_vehicles cv ON cv.id = s.vehicle_id
  LEFT JOIN public.partners p ON p.id = s.partner_id
  WHERE public.is_admin_or_ops(auth.uid()) AND c.is_active = true
    AND (
      p_query IS NULL OR p_query = '' OR
      c.full_name ILIKE '%'||p_query||'%' OR
      c.phone ILIKE '%'||p_query||'%' OR
      c.area ILIKE '%'||p_query||'%' OR
      c.address_line ILIKE '%'||p_query||'%' OR
      COALESCE(cv.registration_number,'') ILIKE '%'||p_query||'%' OR
      COALESCE(cv.make||' '||cv.model,'') ILIKE '%'||p_query||'%'
    )
  ORDER BY (s.id IS NULL) DESC, c.full_name
  LIMIT 50;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_route_search_customers(text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_route_search_customers(text,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_route_draft_save(
  p_partner_id uuid, p_date date, p_items jsonb, p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor text;
  v_threshold int;
  v_snap_id uuid;
  v_version int;
  v_prev_seq jsonb;
  v_item jsonb;
  v_svc record;
  v_changed int := 0;
  v_eta_changed int := 0;
  v_other_partners uuid[] := '{}';
BEGIN
  IF NOT public.is_admin_or_ops(v_uid) THEN
    RAISE EXCEPTION 'forbidden: requires admin or ops_manager';
  END IF;

  SELECT full_name INTO v_actor FROM public.partners WHERE id=v_uid;
  IF v_actor IS NULL THEN SELECT email INTO v_actor FROM auth.users WHERE id=v_uid; END IF;

  SELECT COALESCE((value)::int, 15) INTO v_threshold
    FROM platform_settings WHERE key='customer_eta_shift_threshold_min';
  v_threshold := COALESCE(v_threshold, 15);

  SELECT jsonb_agg(jsonb_build_object(
    'service_id', id, 'sequence', sequence_no, 'eta_at', eta_at,
    'travel_min', travel_min, 'distance_km', distance_km,
    'locked', locked_position, 'priority', priority,
    'is_emergency', is_emergency, 'cluster_id', cluster_id
  ) ORDER BY sequence_no NULLS LAST)
  INTO v_prev_seq
  FROM public.services
  WHERE partner_id = p_partner_id AND scheduled_date = p_date;

  SELECT COALESCE(MAX((metrics->>'version')::int),0)+1 INTO v_version
  FROM public.route_snapshots WHERE partner_id=p_partner_id AND date=p_date;

  INSERT INTO public.route_snapshots(partner_id,date,kind,status,sequence,metrics,created_by)
  VALUES(p_partner_id,p_date,'manual','applied',
         COALESCE(v_prev_seq,'[]'::jsonb),
         jsonb_build_object('version',v_version,'reason',p_reason,'actor',v_actor),
         v_uid)
  RETURNING id INTO v_snap_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT s.id, s.sequence_no, s.eta_at, s.partner_id, s.customer_id,
           s.locked_position, s.priority, s.is_emergency, s.cluster_id
      INTO v_svc
      FROM public.services s
      WHERE s.id=(v_item->>'service_id')::uuid;
    CONTINUE WHEN NOT FOUND;

    UPDATE public.services SET
      sequence_no = (v_item->>'sequence')::int,
      manual_sequence_no = (v_item->>'sequence')::int,
      eta_at = NULLIF(v_item->>'eta_at','')::timestamptz,
      travel_min = NULLIF(v_item->>'travel_min','')::int,
      distance_km = NULLIF(v_item->>'distance_km','')::numeric,
      locked_position = COALESCE((v_item->>'locked')::boolean, false),
      priority = COALESCE(v_item->>'priority','normal'),
      is_emergency = COALESCE((v_item->>'is_emergency')::boolean,false),
      cluster_id = COALESCE(v_item->>'cluster_id', cluster_id),
      partner_id = COALESCE(NULLIF(v_item->>'partner_id','')::uuid, p_partner_id),
      last_sequence_change_at = now(),
      last_sequence_change_by = v_uid,
      priority_set_by = CASE WHEN COALESCE(v_item->>'priority','normal') IS DISTINCT FROM v_svc.priority THEN v_uid ELSE priority_set_by END,
      priority_set_at = CASE WHEN COALESCE(v_item->>'priority','normal') IS DISTINCT FROM v_svc.priority THEN now() ELSE priority_set_at END
    WHERE id = v_svc.id;

    IF v_svc.partner_id IS NOT NULL AND v_svc.partner_id <> p_partner_id THEN
      v_other_partners := array_append(v_other_partners, v_svc.partner_id);
    END IF;

    IF v_svc.sequence_no IS DISTINCT FROM (v_item->>'sequence')::int
       OR v_svc.priority IS DISTINCT FROM COALESCE(v_item->>'priority','normal')
       OR v_svc.locked_position IS DISTINCT FROM COALESCE((v_item->>'locked')::boolean,false)
       OR v_svc.is_emergency IS DISTINCT FROM COALESCE((v_item->>'is_emergency')::boolean,false)
       OR v_svc.eta_at IS DISTINCT FROM NULLIF(v_item->>'eta_at','')::timestamptz
    THEN
      v_changed := v_changed + 1;
      INSERT INTO public.route_change_log(partner_id, service_id, date, actor_id, actor_name, action, reason, old_value, new_value)
      VALUES (p_partner_id, v_svc.id, p_date, v_uid, v_actor, 'manual_edit', p_reason,
        jsonb_build_object('sequence',v_svc.sequence_no,'eta_at',v_svc.eta_at,'priority',v_svc.priority,'locked',v_svc.locked_position,'is_emergency',v_svc.is_emergency),
        jsonb_build_object('sequence',(v_item->>'sequence')::int,'eta_at',v_item->>'eta_at','priority',v_item->>'priority','locked',v_item->>'locked','is_emergency',v_item->>'is_emergency'));

      IF v_svc.eta_at IS NOT NULL AND NULLIF(v_item->>'eta_at','') IS NOT NULL
         AND ABS(EXTRACT(EPOCH FROM (NULLIF(v_item->>'eta_at','')::timestamptz - v_svc.eta_at))/60) >= v_threshold
         AND v_svc.customer_id IS NOT NULL
      THEN
        v_eta_changed := v_eta_changed + 1;
        INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
        SELECT c.user_id, 'eta_updated', 'Estimated arrival updated',
               'Your wash arrival time has changed. Operations optimized today''s route.',
               '/c/home',
               jsonb_build_object('service_id',v_svc.id,'old_eta',v_svc.eta_at,'new_eta',v_item->>'eta_at','reason',COALESCE(p_reason,'Operations optimized today''s route'))
        FROM public.customers c WHERE c.id = v_svc.customer_id AND c.user_id IS NOT NULL;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.partner_notifications(partner_id,type,title,body,link,metadata)
  VALUES(p_partner_id,'route_updated','Route updated by Operations',
         COALESCE(p_reason,'Your route was updated. Tap to refresh.'),
         '/app/live',
         jsonb_build_object('date',p_date,'changed',v_changed));

  IF array_length(v_other_partners,1) IS NOT NULL THEN
    INSERT INTO public.partner_notifications(partner_id,type,title,body,link,metadata)
    SELECT DISTINCT op,'route_updated','Route updated by Operations',
           'A stop was reassigned. Your route was updated.',
           '/app/live',
           jsonb_build_object('date',p_date)
    FROM unnest(v_other_partners) op;
  END IF;

  DELETE FROM public.route_drafts WHERE partner_id=p_partner_id AND service_date=p_date;

  RETURN jsonb_build_object(
    'ok',true,'snapshot_id',v_snap_id,'version',v_version,
    'changed',v_changed,'eta_notifications',v_eta_changed
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_route_draft_save(uuid,date,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_route_draft_save(uuid,date,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_route_remove_stop(
  p_service_id uuid, p_mode text, p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_svc record;
BEGIN
  IF NOT public.is_admin_or_ops(v_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_mode NOT IN ('today_only','cancel') THEN RAISE EXCEPTION 'invalid mode'; END IF;
  SELECT id,partner_id,scheduled_date,status,customer_id INTO v_svc
    FROM public.services WHERE id=p_service_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'service not found'; END IF;

  IF p_mode = 'today_only' THEN
    UPDATE public.services
      SET partner_id=NULL, sequence_no=NULL, manual_sequence_no=NULL,
          last_sequence_change_at=now(), last_sequence_change_by=v_uid
      WHERE id=p_service_id;
  ELSE
    UPDATE public.services
      SET status='cancelled', delay_reason=p_reason,
          last_sequence_change_at=now(), last_sequence_change_by=v_uid
      WHERE id=p_service_id;
  END IF;

  INSERT INTO public.route_change_log(partner_id,service_id,date,actor_id,action,reason,old_value,new_value)
  VALUES(v_svc.partner_id,p_service_id,v_svc.scheduled_date,v_uid,
         'remove_'||p_mode,p_reason,
         jsonb_build_object('status',v_svc.status,'partner_id',v_svc.partner_id),
         jsonb_build_object('mode',p_mode));

  IF v_svc.partner_id IS NOT NULL THEN
    INSERT INTO public.partner_notifications(partner_id,type,title,body,link,metadata)
    VALUES(v_svc.partner_id,'route_updated','Route updated by Operations',
           'A stop was removed from your route.','/app/live',
           jsonb_build_object('service_id',p_service_id,'mode',p_mode));
  END IF;
  RETURN jsonb_build_object('ok',true);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_route_remove_stop(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_route_remove_stop(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_route_history(p_partner_id uuid, p_date date)
RETURNS TABLE(
  snapshot_id uuid, version int, kind text, status text, reason text,
  actor text, created_at timestamptz, metrics jsonb
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, COALESCE((metrics->>'version')::int,0), kind, status,
         metrics->>'reason', metrics->>'actor', created_at, metrics
  FROM public.route_snapshots
  WHERE partner_id=p_partner_id AND date=p_date
    AND public.is_admin_or_ops(auth.uid())
  ORDER BY created_at DESC
  LIMIT 50;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_route_history(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_route_history(uuid,date) TO authenticated;
