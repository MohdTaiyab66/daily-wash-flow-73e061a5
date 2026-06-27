
-- 1. Partners: manual mode flags
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS manual_mode_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_mode_since timestamptz,
  ADD COLUMN IF NOT EXISTS manual_mode_by uuid;

-- 2. Services: priority
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='services' AND column_name='priority') THEN
    ALTER TABLE public.services ADD COLUMN priority text NOT NULL DEFAULT 'normal';
    ALTER TABLE public.services ADD CONSTRAINT services_priority_check
      CHECK (priority IN ('normal','vip','emergency','complaint','corporate','repeat','high'));
  END IF;
END $$;
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS priority_set_by uuid,
  ADD COLUMN IF NOT EXISTS priority_set_at timestamptz;

-- 3. Platform settings rows
INSERT INTO public.platform_settings (key, value, description)
VALUES
  ('trial_operations_mode', 'true'::jsonb, 'When true, Operations team has full manual control of routes; AI optimizer never overrides manual edits.'),
  ('customer_eta_shift_threshold_min', '15'::jsonb, 'Minutes — if manual route changes shift a customer ETA beyond this, notify the customer.')
ON CONFLICT (key) DO NOTHING;

-- 4. route_drafts
CREATE TABLE IF NOT EXISTS public.route_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL,
  service_date date NOT NULL,
  payload jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, service_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.route_drafts TO authenticated;
GRANT ALL ON public.route_drafts TO service_role;

ALTER TABLE public.route_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and ops can read drafts"
  ON public.route_drafts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_manager'));

CREATE POLICY "Admins and ops can write drafts"
  ON public.route_drafts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ops_manager'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.route_drafts;

-- 5. Helper: check admin or ops
CREATE OR REPLACE FUNCTION public.is_admin_or_ops(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid,'admin') OR public.has_role(_uid,'ops_manager');
$$;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_ops(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_or_ops(uuid) TO authenticated;

-- 6. RPC: get draft (or build from live services)
CREATE OR REPLACE FUNCTION public.admin_route_draft_get(p_partner_id uuid, p_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payload jsonb;
  v_has_draft boolean := false;
BEGIN
  IF NOT public.is_admin_or_ops(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT payload INTO v_payload FROM public.route_drafts
   WHERE partner_id = p_partner_id AND service_date = p_date;
  IF v_payload IS NOT NULL THEN v_has_draft := true; END IF;

  IF NOT v_has_draft THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'service_id', s.id,
      'sequence', COALESCE(s.manual_sequence_no, s.sequence_no, 0),
      'locked', COALESCE(s.locked_position,false),
      'priority', COALESCE(s.priority,'normal'),
      'is_emergency', COALESCE(s.is_emergency,false)
    ) ORDER BY COALESCE(s.manual_sequence_no, s.sequence_no, 9999)), '[]'::jsonb)
    INTO v_payload
    FROM public.services s
    WHERE s.partner_id = p_partner_id AND s.scheduled_date = p_date;
  END IF;

  RETURN jsonb_build_object('has_draft', v_has_draft, 'payload', COALESCE(v_payload,'[]'::jsonb));
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_route_draft_get(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_route_draft_get(uuid,date) TO authenticated;

-- 7. RPC: set/upsert draft
CREATE OR REPLACE FUNCTION public.admin_route_draft_set(
  p_partner_id uuid, p_date date, p_payload jsonb, p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF NOT public.is_admin_or_ops(v_actor) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  INSERT INTO public.route_drafts(partner_id, service_date, payload, updated_by, updated_at)
  VALUES (p_partner_id, p_date, p_payload, v_actor, now())
  ON CONFLICT (partner_id, service_date) DO UPDATE
    SET payload = EXCLUDED.payload, updated_by = v_actor, updated_at = now();

  INSERT INTO public.route_change_log(partner_id, date, actor_id, action, reason, new_value)
  VALUES (p_partner_id, p_date, v_actor, 'draft_update', p_reason, p_payload);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_route_draft_set(uuid,date,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_route_draft_set(uuid,date,jsonb,text) TO authenticated;

-- 8. RPC: discard
CREATE OR REPLACE FUNCTION public.admin_route_draft_discard(p_partner_id uuid, p_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin_or_ops(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  DELETE FROM public.route_drafts WHERE partner_id = p_partner_id AND service_date = p_date;
  INSERT INTO public.route_change_log(partner_id, date, actor_id, action) VALUES (p_partner_id, p_date, auth.uid(), 'draft_discard');
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_route_draft_discard(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_route_draft_discard(uuid,date) TO authenticated;

-- 9. RPC: save (apply draft → services, set manual mode, snapshot, clear draft)
CREATE OR REPLACE FUNCTION public.admin_route_draft_save(p_partner_id uuid, p_date date, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_payload jsonb;
  v_item jsonb;
  v_seq int := 0;
  v_old_seq jsonb;
BEGIN
  IF NOT public.is_admin_or_ops(v_actor) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT payload INTO v_payload FROM public.route_drafts
   WHERE partner_id = p_partner_id AND service_date = p_date;
  IF v_payload IS NULL THEN RAISE EXCEPTION 'No draft to save'; END IF;

  -- Snapshot prior live order
  SELECT jsonb_agg(jsonb_build_object('service_id', s.id, 'sequence', COALESCE(s.manual_sequence_no, s.sequence_no))
                   ORDER BY COALESCE(s.manual_sequence_no, s.sequence_no))
    INTO v_old_seq
    FROM public.services s
   WHERE s.partner_id = p_partner_id AND s.scheduled_date = p_date;

  INSERT INTO public.route_snapshots(partner_id, date, kind, status, sequence, created_by)
  VALUES (p_partner_id, p_date, 'manual_saved', 'active', v_payload, v_actor);

  -- Apply payload
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_payload)
  LOOP
    v_seq := v_seq + 1;
    UPDATE public.services
       SET manual_sequence_no = v_seq,
           locked_position = COALESCE((v_item->>'locked')::boolean, false),
           priority = COALESCE(v_item->>'priority','normal'),
           is_emergency = COALESCE((v_item->>'is_emergency')::boolean,false),
           updated_at = now()
     WHERE id = (v_item->>'service_id')::uuid
       AND partner_id = p_partner_id;
  END LOOP;

  UPDATE public.partners
     SET manual_mode_enabled = true,
         manual_mode_since = now(),
         manual_mode_by = v_actor
   WHERE id = p_partner_id;

  DELETE FROM public.route_drafts WHERE partner_id = p_partner_id AND service_date = p_date;

  INSERT INTO public.route_change_log(partner_id, date, actor_id, action, reason, old_value, new_value)
  VALUES (p_partner_id, p_date, v_actor, 'save', p_reason, v_old_seq, v_payload);

  RETURN jsonb_build_object('ok', true, 'stops', v_seq);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_route_draft_save(uuid,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_route_draft_save(uuid,date,text) TO authenticated;

-- 10. RPC: resume AI
CREATE OR REPLACE FUNCTION public.admin_route_resume_ai(p_partner_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin_or_ops(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.partners
     SET manual_mode_enabled = false, manual_mode_since = NULL, manual_mode_by = NULL
   WHERE id = p_partner_id;
  INSERT INTO public.route_change_log(partner_id, date, actor_id, action)
  VALUES (p_partner_id, CURRENT_DATE, auth.uid(), 'resume_ai');
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_route_resume_ai(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_route_resume_ai(uuid) TO authenticated;

-- 11. RPC: search customers for "+" insert
CREATE OR REPLACE FUNCTION public.admin_route_search_customers(p_query text, p_date date)
RETURNS TABLE (
  customer_id uuid,
  service_id uuid,
  full_name text,
  phone text,
  area text,
  address_line text,
  vehicle_reg text,
  preferred_time text,
  current_partner_id uuid,
  current_partner_name text,
  status text
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    c.id AS customer_id,
    s.id AS service_id,
    c.full_name,
    c.phone,
    c.area,
    c.address_line,
    cv.registration_number AS vehicle_reg,
    c.preferred_time,
    s.partner_id AS current_partner_id,
    p.full_name AS current_partner_name,
    s.status::text AS status
  FROM public.customers c
  LEFT JOIN public.services s
    ON s.customer_id = c.id AND s.scheduled_date = p_date
  LEFT JOIN public.customer_vehicles cv ON cv.id = s.vehicle_id
  LEFT JOIN public.partners p ON p.id = s.partner_id
  WHERE
    public.is_admin_or_ops(auth.uid())
    AND c.is_active = true
    AND (
      p_query IS NULL OR p_query = '' OR
      c.full_name ILIKE '%'||p_query||'%' OR
      c.phone ILIKE '%'||p_query||'%' OR
      c.area ILIKE '%'||p_query||'%' OR
      c.address_line ILIKE '%'||p_query||'%' OR
      COALESCE(cv.registration_number,'') ILIKE '%'||p_query||'%'
    )
  ORDER BY (s.id IS NULL) DESC, c.full_name
  LIMIT 50;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_route_search_customers(text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_route_search_customers(text,date) TO authenticated;

-- 12. RPC: reassign a service to another partner (writes to BOTH partners' drafts at position)
CREATE OR REPLACE FUNCTION public.admin_route_reassign(
  p_service_id uuid, p_to_partner uuid, p_position int DEFAULT NULL, p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_from_partner uuid;
  v_date date;
  v_priority text;
BEGIN
  IF NOT public.is_admin_or_ops(v_actor) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT partner_id, scheduled_date, COALESCE(priority,'normal')
    INTO v_from_partner, v_date, v_priority
    FROM public.services WHERE id = p_service_id;
  IF v_date IS NULL THEN RAISE EXCEPTION 'Service not found'; END IF;

  UPDATE public.services
     SET partner_id = p_to_partner,
         reassigned_from = v_from_partner,
         manual_sequence_no = NULL,
         updated_at = now()
   WHERE id = p_service_id;

  INSERT INTO public.route_change_log(partner_id, service_id, date, actor_id, action, reason,
                                      old_value, new_value)
  VALUES (p_to_partner, p_service_id, v_date, v_actor, 'reassign', p_reason,
          to_jsonb(v_from_partner), to_jsonb(p_to_partner));
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_route_reassign(uuid,uuid,int,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_route_reassign(uuid,uuid,int,text) TO authenticated;

-- 13. RPC: restore from snapshot
CREATE OR REPLACE FUNCTION public.admin_route_restore_snapshot(p_snapshot_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_partner uuid; v_date date; v_seq jsonb;
BEGIN
  IF NOT public.is_admin_or_ops(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT partner_id, date, sequence INTO v_partner, v_date, v_seq
    FROM public.route_snapshots WHERE id = p_snapshot_id;
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Snapshot not found'; END IF;

  INSERT INTO public.route_drafts(partner_id, service_date, payload, updated_by)
  VALUES (v_partner, v_date, v_seq, auth.uid())
  ON CONFLICT (partner_id, service_date)
    DO UPDATE SET payload = EXCLUDED.payload, updated_by = auth.uid(), updated_at = now();

  INSERT INTO public.route_change_log(partner_id, date, actor_id, action, reason, new_value)
  VALUES (v_partner, v_date, auth.uid(), 'restore', p_reason, v_seq);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_route_restore_snapshot(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_route_restore_snapshot(uuid,text) TO authenticated;
