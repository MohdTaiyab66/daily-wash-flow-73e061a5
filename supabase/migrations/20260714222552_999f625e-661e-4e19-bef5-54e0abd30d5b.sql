
CREATE OR REPLACE FUNCTION public.materialize_monthly_addons()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  addon RECORD;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  ent RECORD;
  bt public.benefit_type;
  qty integer;
  applied integer := 0;
  ledger_reason text;
BEGIN
  FOR addon IN
    SELECT ma.id, ma.subscription_id, ma.user_id, ma.addon_type, ma.quantity,
           s.vehicle_id, s.plan_slug
      FROM public.subscription_monthly_addons ma
      JOIN public.subscriptions s ON s.id = ma.subscription_id
     WHERE ma.is_active = true
       AND s.status IN ('active','assigned','awaiting_partner_assignment')
  LOOP
    -- Determine which benefit rows to bump (extra_both → both)
    FOR bt, qty IN
      SELECT * FROM (VALUES
        ('interior'::public.benefit_type,
          CASE WHEN addon.addon_type IN ('extra_interior','extra_both') THEN addon.quantity ELSE 0 END),
        ('exterior_daily'::public.benefit_type,
          CASE WHEN addon.addon_type IN ('extra_exterior','extra_both') THEN addon.quantity ELSE 0 END)
      ) t(bt, qty) WHERE qty > 0
    LOOP
      SELECT * INTO ent
        FROM public.subscription_entitlements
       WHERE subscription_id = addon.subscription_id
         AND benefit_type = bt
         AND cycle_start <= today
         AND cycle_end >= today
       LIMIT 1;

      IF ent.id IS NULL THEN
        CONTINUE;
      END IF;

      ledger_reason := 'monthly_addon:' || addon.id::text || ':' || ent.cycle_start::text;

      -- Idempotent: skip if this addon already applied for this cycle
      IF EXISTS (
        SELECT 1 FROM public.entitlement_ledger
         WHERE entitlement_id = ent.id AND reason = ledger_reason
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO public.entitlement_ledger (entitlement_id, subscription_id, vehicle_id, benefit_type, delta, reason)
      VALUES (ent.id, addon.subscription_id, addon.vehicle_id, bt, qty, ledger_reason);

      UPDATE public.subscription_entitlements
         SET total_allocated = total_allocated + qty,
             updated_at = now()
       WHERE id = ent.id;

      applied := applied + 1;
    END LOOP;
  END LOOP;

  RETURN applied;
END;
$$;

REVOKE ALL ON FUNCTION public.materialize_monthly_addons() FROM public;
GRANT EXECUTE ON FUNCTION public.materialize_monthly_addons() TO service_role;
