
DO $$ BEGIN
  CREATE TYPE public.benefit_type AS ENUM (
    'interior','exterior_daily','exterior_hydrophobic','dusting',
    'tyre_polish','paper_mats','fragrance'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.subscription_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.customer_vehicles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  plan_slug text NOT NULL,
  benefit_type public.benefit_type NOT NULL,
  total_allocated integer,
  consumed integer NOT NULL DEFAULT 0,
  cycle_start date NOT NULL,
  cycle_end date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (total_allocated IS NULL OR consumed <= total_allocated),
  UNIQUE (subscription_id, benefit_type, cycle_start)
);
CREATE INDEX IF NOT EXISTS idx_sub_ent_vehicle ON public.subscription_entitlements(vehicle_id, benefit_type);
CREATE INDEX IF NOT EXISTS idx_sub_ent_sub ON public.subscription_entitlements(subscription_id);
GRANT SELECT ON public.subscription_entitlements TO authenticated;
GRANT ALL ON public.subscription_entitlements TO service_role;
ALTER TABLE public.subscription_entitlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ent: owner read" ON public.subscription_entitlements;
CREATE POLICY "ent: owner read" ON public.subscription_entitlements FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "ent: admin manage" ON public.subscription_entitlements;
CREATE POLICY "ent: admin manage" ON public.subscription_entitlements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS trg_sub_ent_updated_at ON public.subscription_entitlements;
CREATE TRIGGER trg_sub_ent_updated_at BEFORE UPDATE ON public.subscription_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.entitlement_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL REFERENCES public.subscription_entitlements(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL,
  vehicle_id uuid NOT NULL,
  benefit_type public.benefit_type NOT NULL,
  delta integer NOT NULL,
  booking_id uuid,
  addon_request_id uuid,
  reason text,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ent_ledger_vehicle ON public.entitlement_ledger(vehicle_id, created_at DESC);
GRANT SELECT ON public.entitlement_ledger TO authenticated;
GRANT ALL ON public.entitlement_ledger TO service_role;
ALTER TABLE public.entitlement_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ent_ledger: admin read" ON public.entitlement_ledger;
CREATE POLICY "ent_ledger: admin read" ON public.entitlement_ledger FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.service_slug_to_benefit(p_slug text)
RETURNS public.benefit_type LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(p_slug,''))
    WHEN 'daily-shine-interior' THEN 'interior'::public.benefit_type
    WHEN 'interior-wash' THEN 'interior'::public.benefit_type
    WHEN 'premium-interior' THEN 'interior'::public.benefit_type
    WHEN 'daily-shine-exterior' THEN 'exterior_daily'::public.benefit_type
    WHEN 'exterior-wash' THEN 'exterior_daily'::public.benefit_type
    WHEN 'hydrophobic-exterior' THEN 'exterior_hydrophobic'::public.benefit_type
    WHEN 'pressure-wash' THEN 'exterior_hydrophobic'::public.benefit_type
    WHEN 'daily-shine-dusting' THEN 'dusting'::public.benefit_type
    WHEN 'dusting' THEN 'dusting'::public.benefit_type
    WHEN 'tyre-polish' THEN 'tyre_polish'::public.benefit_type
    WHEN 'paper-mats' THEN 'paper_mats'::public.benefit_type
    WHEN 'fragrance' THEN 'fragrance'::public.benefit_type
    ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.plan_benefit_allocation(p_plan text, p_benefit public.benefit_type)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_plan = 'daily-shine' THEN
      CASE p_benefit
        WHEN 'interior' THEN 1
        WHEN 'exterior_daily' THEN 26
        WHEN 'exterior_hydrophobic' THEN 1
        WHEN 'dusting' THEN NULL
        WHEN 'tyre_polish' THEN 1
        WHEN 'paper_mats' THEN 1
        WHEN 'fragrance' THEN 1
      END
    WHEN p_plan = 'daily-shine-interior' THEN
      CASE p_benefit WHEN 'interior' THEN 1 ELSE 0 END
    WHEN p_plan = 'daily-shine-exterior' THEN
      CASE p_benefit WHEN 'exterior_daily' THEN 26 ELSE 0 END
    WHEN p_plan = 'daily-shine-dusting' THEN
      CASE p_benefit WHEN 'dusting' THEN NULL ELSE 0 END
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_entitlements_for_subscription(p_sub_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  s record;
  b public.benefit_type;
  alloc integer;
  cs date;
  ce date;
BEGIN
  SELECT * INTO s FROM public.subscriptions WHERE id = p_sub_id;
  IF NOT FOUND OR s.vehicle_id IS NULL THEN RETURN; END IF;
  cs := COALESCE(s.service_start_date, s.start_date, CURRENT_DATE);
  ce := COALESCE(s.renewal_date, cs + INTERVAL '30 days');
  FOR b IN SELECT unnest(enum_range(NULL::public.benefit_type)) LOOP
    alloc := public.plan_benefit_allocation(s.plan_slug, b);
    CONTINUE WHEN alloc IS NOT NULL AND alloc = 0;
    INSERT INTO public.subscription_entitlements
      (subscription_id, vehicle_id, user_id, plan_slug, benefit_type,
       total_allocated, consumed, cycle_start, cycle_end)
    VALUES (s.id, s.vehicle_id, s.user_id, s.plan_slug, b, alloc, 0, cs, ce)
    ON CONFLICT (subscription_id, benefit_type, cycle_start) DO NOTHING;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.ensure_entitlements_for_subscription(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_subscription_ensure_entitlements()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status IN ('active','assigned','awaiting_partner_assignment') AND NEW.vehicle_id IS NOT NULL THEN
    PERFORM public.ensure_entitlements_for_subscription(NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sub_ensure_ent ON public.subscriptions;
CREATE TRIGGER trg_sub_ensure_ent
  AFTER INSERT OR UPDATE OF status, vehicle_id ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_subscription_ensure_entitlements();

CREATE OR REPLACE FUNCTION public.get_vehicle_entitlements(p_vehicle_id uuid)
RETURNS TABLE (
  benefit_type public.benefit_type,
  total_allocated integer,
  consumed integer,
  remaining integer,
  unlimited boolean,
  subscription_id uuid,
  cycle_end date
) LANGUAGE sql SECURITY DEFINER SET search_path=public STABLE AS $$
  SELECT e.benefit_type, e.total_allocated, e.consumed,
    CASE WHEN e.total_allocated IS NULL THEN NULL
         ELSE GREATEST(0, e.total_allocated - e.consumed) END,
    (e.total_allocated IS NULL),
    e.subscription_id, e.cycle_end
  FROM public.subscription_entitlements e
  JOIN public.subscriptions s ON s.id = e.subscription_id
  WHERE e.vehicle_id = p_vehicle_id
    AND (e.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    AND s.status IN ('active','assigned','awaiting_partner_assignment')
    AND CURRENT_DATE BETWEEN e.cycle_start AND e.cycle_end
  ORDER BY e.benefit_type;
$$;
GRANT EXECUTE ON FUNCTION public.get_vehicle_entitlements(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.try_consume_entitlement(
  p_vehicle_id uuid, p_benefit public.benefit_type,
  p_booking_id uuid DEFAULT NULL, p_addon_request_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'booking'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  e record;
  v_user uuid := auth.uid();
  v_remaining integer;
  v_last boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('consumed', false, 'reason', 'unauthenticated');
  END IF;
  SELECT * INTO e FROM public.subscription_entitlements
   WHERE vehicle_id = p_vehicle_id AND benefit_type = p_benefit
     AND CURRENT_DATE BETWEEN cycle_start AND cycle_end
     AND (user_id = v_user OR public.has_role(v_user, 'admin'))
   ORDER BY cycle_start DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('consumed', false, 'reason', 'no_entitlement');
  END IF;
  IF e.total_allocated IS NOT NULL AND e.consumed >= e.total_allocated THEN
    RETURN jsonb_build_object('consumed', false, 'reason', 'exhausted',
      'entitlement_id', e.id, 'remaining', 0);
  END IF;
  UPDATE public.subscription_entitlements
     SET consumed = consumed + 1, updated_at = now() WHERE id = e.id;
  INSERT INTO public.entitlement_ledger
    (entitlement_id, subscription_id, vehicle_id, benefit_type, delta,
     booking_id, addon_request_id, reason, actor_user_id)
  VALUES (e.id, e.subscription_id, e.vehicle_id, e.benefit_type, -1,
     p_booking_id, p_addon_request_id, p_reason, v_user);
  IF e.total_allocated IS NULL THEN
    v_remaining := NULL;
  ELSE
    v_remaining := e.total_allocated - (e.consumed + 1);
    v_last := (v_remaining = 0);
  END IF;
  IF v_last THEN
    BEGIN
      INSERT INTO public.customer_notifications(user_id, kind, title, body, meta)
      VALUES (e.user_id, 'entitlement_exhausted',
        'Included ' || replace(e.benefit_type::text, '_', ' ') || ' used',
        'You''ve used all included ' || replace(e.benefit_type::text, '_', ' ') ||
          ' washes in your Daily Shine plan for this vehicle.',
        jsonb_build_object('vehicle_id', e.vehicle_id, 'benefit_type', e.benefit_type,
                           'subscription_id', e.subscription_id));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN jsonb_build_object(
    'consumed', true, 'entitlement_id', e.id, 'benefit_type', e.benefit_type,
    'remaining', v_remaining, 'unlimited', (e.total_allocated IS NULL), 'last_one', v_last);
END $$;
GRANT EXECUTE ON FUNCTION public.try_consume_entitlement(uuid, public.benefit_type, uuid, uuid, text) TO authenticated;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM public.subscriptions
           WHERE status IN ('active','assigned','awaiting_partner_assignment')
             AND vehicle_id IS NOT NULL LOOP
    PERFORM public.ensure_entitlements_for_subscription(r.id);
  END LOOP;
END $$;

-- Rewrite create_addon_request to consume entitlement first (return type changes to jsonb)
DROP FUNCTION IF EXISTS public.create_addon_request(uuid, uuid, date, text, text, uuid);

CREATE OR REPLACE FUNCTION public.create_addon_request(
  p_subscription_id uuid, p_service_id uuid, p_preferred_date date,
  p_preferred_time text, p_notes text, p_vehicle_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_id uuid;
  v_user uuid := auth.uid();
  v_sub record;
  v_svc record;
  v_name text;
  v_phone text;
  v_veh_id uuid;
  v_veh text;
  v_plan_veh text;
  v_benefit public.benefit_type;
  v_consume jsonb := jsonb_build_object('consumed', false, 'reason', 'no_benefit_type');
  v_paid boolean := true;
  v_meta jsonb := '{}'::jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT * INTO v_sub FROM public.subscriptions
   WHERE id = p_subscription_id AND user_id = v_user
     AND status IN ('active','assigned','awaiting_partner_assignment');
  IF NOT FOUND THEN RAISE EXCEPTION 'Active Daily Shine subscription not found'; END IF;
  SELECT * INTO v_svc FROM public.service_catalog WHERE id = p_service_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service not found'; END IF;
  SELECT full_name, phone INTO v_name, v_phone
    FROM public.customer_profiles WHERE user_id = v_user LIMIT 1;
  v_veh_id := COALESCE(p_vehicle_id, v_sub.vehicle_id);
  IF v_veh_id IS NULL THEN RAISE EXCEPTION 'Select a vehicle'; END IF;
  SELECT concat_ws(' ', make, model, NULLIF(registration_number, ''))
    INTO v_veh FROM public.customer_vehicles
    WHERE id = v_veh_id AND user_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected vehicle does not belong to you'; END IF;
  IF v_sub.vehicle_id IS DISTINCT FROM v_veh_id THEN
    SELECT concat_ws(' ', make, model, NULLIF(registration_number, ''))
      INTO v_plan_veh FROM public.customer_vehicles WHERE id = v_sub.vehicle_id;
    RAISE EXCEPTION 'This Daily Shine plan belongs to %. Switch to that vehicle or subscribe this vehicle first.',
      COALESCE(v_plan_veh, 'another vehicle');
  END IF;
  v_benefit := public.service_slug_to_benefit(v_svc.slug);
  IF v_benefit IS NOT NULL THEN
    v_consume := public.try_consume_entitlement(v_veh_id, v_benefit, NULL, NULL, 'addon_request');
    v_paid := NOT (v_consume->>'consumed')::boolean;
  END IF;
  v_meta := jsonb_build_object('entitlement', v_consume, 'paid', v_paid, 'benefit_type', v_benefit);
  INSERT INTO public.subscription_addon_requests(
    subscription_id, user_id, customer_name, customer_phone,
    vehicle_id, vehicle_label, service_id, service_name, service_slug,
    preferred_date, preferred_time, notes, status, metadata
  ) VALUES (
    p_subscription_id, v_user, v_name, v_phone,
    v_veh_id, v_veh, p_service_id, v_svc.name, v_svc.slug,
    p_preferred_date, p_preferred_time, p_notes, 'new', v_meta
  ) RETURNING id INTO v_id;
  IF (v_consume->>'consumed')::boolean IS TRUE THEN
    UPDATE public.entitlement_ledger
       SET addon_request_id = v_id
     WHERE entitlement_id = (v_consume->>'entitlement_id')::uuid
       AND addon_request_id IS NULL AND created_at > now() - INTERVAL '10 seconds';
  END IF;
  INSERT INTO public.admin_alerts(kind, title, body, severity, meta)
  VALUES (
    'subscription_addon',
    CASE WHEN v_paid THEN 'Paid add-on request' ELSE 'Included benefit consumed' END,
    format('%s for %s on %s (%s)', v_svc.name, COALESCE(v_veh,'vehicle'),
           coalesce(p_preferred_date::text,'TBD'), COALESCE(p_preferred_time,'')),
    'info',
    jsonb_build_object('addon_request_id', v_id, 'subscription_id', p_subscription_id,
      'vehicle_id', v_veh_id, 'service_id', p_service_id, 'paid', v_paid,
      'benefit_type', v_benefit, 'entitlement', v_consume));
  RETURN jsonb_build_object('addon_request_id', v_id, 'paid', v_paid,
    'benefit_type', v_benefit, 'entitlement', v_consume);
END $$;
GRANT EXECUTE ON FUNCTION public.create_addon_request(uuid, uuid, date, text, text, uuid) TO authenticated;
