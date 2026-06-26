
-- Route Optimizer Redesign: soft windows, admin manual overrides, scoring weights

-- customers: time window type + exact time
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS time_window_type text NOT NULL DEFAULT 'soft',
  ADD COLUMN IF NOT EXISTS exact_time time;

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_time_window_type_chk;
ALTER TABLE public.customers
  ADD CONSTRAINT customers_time_window_type_chk
  CHECK (time_window_type IN ('soft','exact'));

-- services: manual overrides + clusters + emergency + reassignment audit
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS locked_position boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_sequence_no integer,
  ADD COLUMN IF NOT EXISTS is_emergency boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cluster_id text,
  ADD COLUMN IF NOT EXISTS reassigned_from uuid REFERENCES public.partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_services_partner_date_seq
  ON public.services(partner_id, scheduled_date, COALESCE(manual_sequence_no, sequence_no));

-- platform_settings: optimizer config (jsonb values)
INSERT INTO public.platform_settings(key, value)
VALUES
  ('route_optimizer_weights',
   '{"route_impact":40,"distance":20,"travel_time":10,"preferred_time":8,"continuity":7,"reliability":6,"vip":5,"complaint":4}'::jsonb),
  ('route_soft_window_penalty_per_min', '0.5'::jsonb),
  ('route_cluster_radius_km', '0.8'::jsonb),
  ('route_avg_service_minutes', '10'::jsonb),
  ('route_avg_speed_kmh', '22'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Admin: reorder services for a partner/day
CREATE OR REPLACE FUNCTION public.admin_reorder_services(
  p_partner_id uuid,
  p_date date,
  p_ordered_ids uuid[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_idx int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  FOREACH v_id IN ARRAY p_ordered_ids LOOP
    v_idx := v_idx + 1;
    UPDATE public.services
      SET manual_sequence_no = v_idx,
          sequence_no = v_idx,
          updated_at = now()
      WHERE id = v_id
        AND partner_id = p_partner_id
        AND scheduled_date = p_date;
  END LOOP;
END $$;

-- Admin: lock/unlock a stop
CREATE OR REPLACE FUNCTION public.admin_lock_service(
  p_service_id uuid,
  p_locked boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.services
    SET locked_position = p_locked, updated_at = now()
    WHERE id = p_service_id;
END $$;

-- Admin: reassign a service to a different partner
CREATE OR REPLACE FUNCTION public.admin_reassign_service(
  p_service_id uuid,
  p_new_partner_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_partner uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT partner_id INTO v_old_partner FROM public.services WHERE id = p_service_id;
  UPDATE public.services
    SET partner_id = p_new_partner_id,
        reassigned_from = COALESCE(reassigned_from, v_old_partner),
        manual_sequence_no = NULL,
        sequence_no = 9999,
        updated_at = now()
    WHERE id = p_service_id;
END $$;

-- Admin: clear manual sequencing for unlocked stops to force a recalculation
CREATE OR REPLACE FUNCTION public.admin_force_recalculate(
  p_partner_id uuid,
  p_date date
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.services
    SET manual_sequence_no = NULL, updated_at = now()
    WHERE partner_id = p_partner_id
      AND scheduled_date = p_date
      AND locked_position = false;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_reorder_services(uuid,date,uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_lock_service(uuid,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_reassign_service(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_force_recalculate(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reorder_services(uuid,date,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_lock_service(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reassign_service(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_force_recalculate(uuid,date) TO authenticated;
