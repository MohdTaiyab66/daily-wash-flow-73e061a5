-- 1. One service per VEHICLE per day (was: per customer per day)
DROP INDEX IF EXISTS public.uq_services_customer_date;
CREATE UNIQUE INDEX IF NOT EXISTS uq_services_vehicle_date
  ON public.services (vehicle_id, scheduled_date)
  WHERE status = ANY (ARRAY['pending'::service_status,'in_progress'::service_status,'completed'::service_status])
    AND vehicle_id IS NOT NULL;

-- 2. Booking completion must only close the SAME vehicle's covered service
CREATE OR REPLACE FUNCTION public.tg_booking_completes_daily_shine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN RETURN NEW; END IF;

  UPDATE public.services s
     SET status = 'completed',
         completed_at = COALESCE(s.completed_at, now()),
         updated_at = now()
    FROM public.customer_profiles cp
    JOIN public.customers c
      ON (c.phone IS NOT NULL AND cp.phone IS NOT NULL AND c.phone = cp.phone)
      OR (c.email IS NOT NULL AND cp.email IS NOT NULL AND lower(c.email) = lower(cp.email))
   WHERE cp.user_id = NEW.user_id
     AND s.customer_id = c.id
     AND s.scheduled_date = NEW.scheduled_date
     AND (NEW.vehicle_id IS NULL OR s.vehicle_id = NEW.vehicle_id)
     AND s.status = 'covered_by_booking';
  RETURN NEW;
END $function$;

-- 3. Daily Shine = exactly 25 daily washes
CREATE OR REPLACE FUNCTION public.plan_benefit_allocation(p_plan text, p_benefit benefit_type)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_plan = 'daily-shine' THEN
      CASE p_benefit
        WHEN 'interior' THEN 1
        WHEN 'exterior_daily' THEN 25
        WHEN 'exterior_hydrophobic' THEN 1
        WHEN 'dusting' THEN NULL
        WHEN 'tyre_polish' THEN 1
        WHEN 'paper_mats' THEN 1
        WHEN 'fragrance' THEN 1
      END
    WHEN p_plan = 'daily-shine-interior' THEN
      CASE p_benefit WHEN 'interior' THEN 1 ELSE 0 END
    WHEN p_plan = 'daily-shine-exterior' THEN
      CASE p_benefit WHEN 'exterior_daily' THEN 25 ELSE 0 END
    WHEN p_plan = 'daily-shine-dusting' THEN
      CASE p_benefit WHEN 'dusting' THEN NULL ELSE 0 END
    ELSE 0
  END;
$function$;

-- 4. Consume one daily credit when a daily service is completed (idempotent)
CREATE OR REPLACE FUNCTION public.tg_consume_daily_shine_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ent record;
  v_reason text;
BEGIN
  IF NEW.status <> 'completed'::public.service_status
     OR OLD.status IS NOT DISTINCT FROM NEW.status
     OR NEW.vehicle_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_reason := 'daily_service:' || NEW.id::text;
  IF EXISTS (SELECT 1 FROM public.entitlement_ledger WHERE reason = v_reason) THEN
    RETURN NEW;
  END IF;

  SELECT se.* INTO ent
  FROM public.subscription_entitlements se
  JOIN public.subscriptions s ON s.id = se.subscription_id
  WHERE se.vehicle_id = NEW.vehicle_id
    AND se.benefit_type = 'exterior_daily'
    AND s.status IN ('active','assigned','awaiting_partner_assignment')
  ORDER BY
    CASE WHEN NEW.scheduled_date BETWEEN se.cycle_start AND se.cycle_end THEN 0 ELSE 1 END,
    se.cycle_start DESC
  LIMIT 1
  FOR UPDATE OF se;

  IF NOT FOUND OR ent.total_allocated IS NULL OR ent.consumed >= ent.total_allocated THEN
    RETURN NEW;
  END IF;

  UPDATE public.subscription_entitlements
     SET consumed = consumed + 1, updated_at = now()
   WHERE id = ent.id;

  INSERT INTO public.entitlement_ledger
    (entitlement_id, subscription_id, vehicle_id, benefit_type, delta, reason)
  VALUES (ent.id, ent.subscription_id, ent.vehicle_id, ent.benefit_type, -1, v_reason);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_consume_daily_shine_credit ON public.services;
CREATE TRIGGER trg_consume_daily_shine_credit
AFTER UPDATE OF status ON public.services
FOR EACH ROW EXECUTE FUNCTION public.tg_consume_daily_shine_credit();

-- 5. Stop creating new daily services once the 25 credits are used up
CREATE OR REPLACE FUNCTION public.tg_services_respect_daily_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ent record;
  v_scheduled int;
BEGIN
  IF NEW.vehicle_id IS NULL
     OR NEW.status NOT IN ('pending'::public.service_status, 'covered_by_booking'::public.service_status) THEN
    RETURN NEW;
  END IF;

  SELECT se.* INTO ent
  FROM public.subscription_entitlements se
  JOIN public.subscriptions s ON s.id = se.subscription_id
  WHERE se.vehicle_id = NEW.vehicle_id
    AND se.benefit_type = 'exterior_daily'
    AND s.status IN ('active','assigned','awaiting_partner_assignment')
  ORDER BY
    CASE WHEN NEW.scheduled_date BETWEEN se.cycle_start AND se.cycle_end THEN 0 ELSE 1 END,
    se.cycle_start DESC
  LIMIT 1;

  IF NOT FOUND OR ent.total_allocated IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_scheduled
  FROM public.services
  WHERE vehicle_id = NEW.vehicle_id
    AND status IN ('pending'::public.service_status, 'in_progress'::public.service_status)
    AND scheduled_date >= CURRENT_DATE;

  IF ent.consumed + v_scheduled >= ent.total_allocated THEN
    RETURN NULL; -- plan exhausted: skip generating another day
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_services_respect_daily_credits ON public.services;
CREATE TRIGGER trg_services_respect_daily_credits
BEFORE INSERT ON public.services
FOR EACH ROW EXECUTE FUNCTION public.tg_services_respect_daily_credits();

-- 6. Exactly one "partner accepted" notification per subscription
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_notifications_partner_accepted
  ON public.customer_notifications (user_id, (metadata->>'subscription_id'))
  WHERE type = 'partner_accepted' AND metadata ? 'subscription_id';
