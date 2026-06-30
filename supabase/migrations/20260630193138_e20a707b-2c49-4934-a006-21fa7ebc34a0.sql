
-- 1) Audit log of blocked duplicate-subscription attempts
CREATE TABLE IF NOT EXISTS public.subscription_block_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  vehicle_id uuid,
  service_id uuid,
  existing_subscription_id uuid,
  source text NOT NULL,            -- 'rpc' | 'razorpay_order' | 'ui'
  reason text NOT NULL DEFAULT 'duplicate_active_subscription',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_block_log_vehicle ON public.subscription_block_log(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_sub_block_log_user    ON public.subscription_block_log(user_id);
CREATE INDEX IF NOT EXISTS idx_sub_block_log_created ON public.subscription_block_log(created_at DESC);

GRANT SELECT ON public.subscription_block_log TO authenticated;
GRANT ALL    ON public.subscription_block_log TO service_role;

ALTER TABLE public.subscription_block_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read sub block log" ON public.subscription_block_log;
CREATE POLICY "admins read sub block log"
  ON public.subscription_block_log
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ops_manager')
  );

-- 2) Patch confirm_customer_booking to log the blocked attempt before raising
CREATE OR REPLACE FUNCTION public.confirm_customer_booking(
  p_service_id uuid, p_vehicle_id uuid, p_address_id uuid,
  p_scheduled_date date, p_scheduled_time text,
  p_notes text DEFAULT NULL, p_coupon_code text DEFAULT NULL,
  p_addons jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_service record; v_vehicle record; v_address record;
  v_base numeric := 0; v_addon numeric := 0; v_discount numeric := 0; v_total numeric := 0;
  v_booking uuid;
  v_coupon text := upper(nullif(trim(coalesce(p_coupon_code, '')), ''));
  v_percent int := 0; v_min_vehicles int := 0; v_vehicle_count int := 0;
  item record; addon_rec record; v_qty int;
  v_has_active_sub boolean;
  v_dup_sub_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Please sign in again'; END IF;
  IF p_scheduled_date IS NULL OR p_scheduled_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Choose a valid service date';
  END IF;

  SELECT * INTO v_service FROM public.service_catalog WHERE id = p_service_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service is not available'; END IF;

  -- P0-02: Daily Shine inclusions go through subscription_addon_requests, not premium booking
  IF v_service.slug IN ('daily-shine-interior','daily-shine-exterior','daily-shine-dusting') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.subscriptions WHERE user_id = v_user AND status = 'active'
    ) INTO v_has_active_sub;
    IF v_has_active_sub THEN
      RAISE EXCEPTION 'Use My Plan → Schedule wash for included services (no premium charge).'
        USING ERRCODE = 'P0202', HINT = 'Call create_addon_request instead.';
    END IF;
  END IF;

  -- P0-DUP-01: vehicle-scoped one-active-subscription rule
  IF v_service.service_type = 'subscription' OR v_service.category = 'subscription' THEN
    SELECT id INTO v_dup_sub_id
      FROM public.subscriptions
     WHERE vehicle_id = p_vehicle_id
       AND status IN ('active','awaiting_partner_assignment','assigned')
     LIMIT 1;
    IF v_dup_sub_id IS NOT NULL THEN
      INSERT INTO public.subscription_block_log(
        user_id, vehicle_id, service_id, existing_subscription_id, source, reason, meta
      ) VALUES (
        v_user, p_vehicle_id, p_service_id, v_dup_sub_id, 'rpc',
        'duplicate_active_subscription',
        jsonb_build_object('service_slug', v_service.slug, 'scheduled_date', p_scheduled_date)
      );
      RAISE EXCEPTION 'This vehicle already has an active Daily Shine subscription.'
        USING ERRCODE = 'P0DUP';
    END IF;
  END IF;

  SELECT * INTO v_vehicle FROM public.customer_vehicles WHERE id = p_vehicle_id AND user_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vehicle not found'; END IF;
  SELECT * INTO v_address FROM public.customer_addresses WHERE id = p_address_id AND user_id = v_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Address not found'; END IF;

  v_base := CASE WHEN v_vehicle.category = 'sedan_suv'
                 THEN v_service.price_sedan_suv ELSE v_service.price_hatchback END;

  IF jsonb_typeof(p_addons) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(p_addons) AS e LOOP
      v_qty := GREATEST(1, COALESCE((item.value->>'quantity')::int, 1));
      SELECT * INTO addon_rec FROM public.service_addons WHERE id = (item.value->>'id')::uuid AND active = true;
      IF FOUND THEN
        v_addon := v_addon + v_qty * (CASE WHEN v_vehicle.category = 'sedan_suv'
                                            THEN addon_rec.price_sedan_suv ELSE addon_rec.price_hatchback END);
      END IF;
    END LOOP;
  END IF;

  IF v_coupon IS NOT NULL THEN
    SELECT percent, min_vehicles INTO v_percent, v_min_vehicles
      FROM public.multi_vehicle_discounts WHERE upper(code) = v_coupon AND active = true;
    IF v_percent IS NULL THEN RAISE EXCEPTION 'Invalid coupon'; END IF;
    SELECT count(*) INTO v_vehicle_count FROM public.customer_vehicles WHERE user_id = v_user;
    IF v_vehicle_count < v_min_vehicles THEN
      RAISE EXCEPTION 'Coupon requires at least % vehicles on your account', v_min_vehicles;
    END IF;
    v_discount := round(((v_base + v_addon) * v_percent) / 100.0, 2);
  END IF;

  v_total := GREATEST(0, v_base + v_addon - v_discount);

  INSERT INTO public.bookings(
    user_id, service_id, vehicle_id, address_id, scheduled_date, scheduled_time,
    notes, coupon_code, base_amount, addon_amount, discount_amount, total_amount,
    status, payment_status
  ) VALUES (
    v_user, p_service_id, p_vehicle_id, p_address_id, p_scheduled_date, p_scheduled_time,
    p_notes, v_coupon, v_base, v_addon, v_discount, v_total,
    'pending_payment', 'pending'
  ) RETURNING id INTO v_booking;

  IF jsonb_typeof(p_addons) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(p_addons) AS e LOOP
      v_qty := GREATEST(1, COALESCE((item.value->>'quantity')::int, 1));
      SELECT * INTO addon_rec FROM public.service_addons WHERE id = (item.value->>'id')::uuid AND active = true;
      IF FOUND THEN
        INSERT INTO public.booking_addons(booking_id, addon_id, name, quantity, unit_price, line_total)
        VALUES (v_booking, addon_rec.id, addon_rec.name, v_qty,
                CASE WHEN v_vehicle.category = 'sedan_suv' THEN addon_rec.price_sedan_suv ELSE addon_rec.price_hatchback END,
                v_qty * (CASE WHEN v_vehicle.category = 'sedan_suv' THEN addon_rec.price_sedan_suv ELSE addon_rec.price_hatchback END));
      END IF;
    END LOOP;
  END IF;

  RETURN v_booking;
END;
$function$;

-- 3) Reconciliation: find vehicles with more than one open subscription
CREATE OR REPLACE FUNCTION public.reconcile_duplicate_subscriptions()
RETURNS TABLE(vehicle_id uuid, open_count int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT s.vehicle_id, count(*)::int AS open_count,
           array_agg(s.id ORDER BY s.created_at) AS sub_ids,
           array_agg(s.user_id) AS user_ids
      FROM public.subscriptions s
     WHERE s.status IN ('active','awaiting_partner_assignment','assigned')
       AND s.vehicle_id IS NOT NULL
     GROUP BY s.vehicle_id
    HAVING count(*) > 1
  LOOP
    INSERT INTO public.admin_alerts(kind, severity, meta)
    VALUES (
      'duplicate_subscription',
      'high',
      jsonb_build_object(
        'vehicle_id', r.vehicle_id,
        'open_count', r.open_count,
        'subscription_ids', r.sub_ids,
        'user_ids', r.user_ids,
        'detected_at', now()
      )
    );
    vehicle_id := r.vehicle_id;
    open_count := r.open_count;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_duplicate_subscriptions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_duplicate_subscriptions() TO service_role;

-- 4) Daily cron: 03:10 IST (= 21:40 UTC)
DO $$ BEGIN
  PERFORM cron.unschedule('reconcile-duplicate-subscriptions-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'reconcile-duplicate-subscriptions-daily',
  '40 21 * * *',
  $cron$ SELECT public.reconcile_duplicate_subscriptions(); $cron$
);
