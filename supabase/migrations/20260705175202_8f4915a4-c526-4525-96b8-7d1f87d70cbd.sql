
CREATE OR REPLACE FUNCTION public.try_consume_entitlement(
  p_vehicle_id uuid, p_benefit public.benefit_type,
  p_booking_id uuid DEFAULT NULL, p_addon_request_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'booking'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  ent record;
  v_user uuid := auth.uid();
  v_remaining integer;
  v_last boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('consumed', false, 'reason', 'unauthenticated');
  END IF;

  SELECT se.* INTO ent
  FROM public.subscription_entitlements se
  JOIN public.subscriptions s ON s.id = se.subscription_id
  WHERE se.vehicle_id = p_vehicle_id
    AND se.benefit_type = p_benefit
    AND s.status IN ('active','assigned','awaiting_partner_assignment')
    AND (se.user_id = v_user OR public.has_role(v_user, 'admin'))
  ORDER BY
    CASE WHEN CURRENT_DATE BETWEEN se.cycle_start AND se.cycle_end THEN 0 ELSE 1 END,
    se.cycle_start DESC
  LIMIT 1
  FOR UPDATE OF se;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('consumed', false, 'reason', 'no_entitlement');
  END IF;

  IF ent.total_allocated IS NOT NULL AND ent.consumed >= ent.total_allocated THEN
    RETURN jsonb_build_object('consumed', false, 'reason', 'exhausted',
      'entitlement_id', ent.id, 'remaining', 0);
  END IF;

  UPDATE public.subscription_entitlements
     SET consumed = consumed + 1, updated_at = now()
   WHERE id = ent.id;

  INSERT INTO public.entitlement_ledger
    (entitlement_id, subscription_id, vehicle_id, benefit_type, delta,
     booking_id, addon_request_id, reason, actor_user_id)
  VALUES (ent.id, ent.subscription_id, ent.vehicle_id, ent.benefit_type, -1,
     p_booking_id, p_addon_request_id, p_reason, v_user);

  IF ent.total_allocated IS NULL THEN
    v_remaining := NULL;
  ELSE
    v_remaining := ent.total_allocated - (ent.consumed + 1);
    v_last := (v_remaining = 0);
  END IF;

  IF v_last THEN
    BEGIN
      INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata, vehicle_id, category)
      VALUES (ent.user_id, 'entitlement_exhausted',
        'Included ' || replace(ent.benefit_type::text, '_', ' ') || ' used',
        'You''ve used all included ' || replace(ent.benefit_type::text, '_', ' ') ||
          ' washes in your Daily Shine plan for this vehicle.',
        '/c/subscriptions',
        jsonb_build_object('vehicle_id', ent.vehicle_id, 'benefit_type', ent.benefit_type,
                           'subscription_id', ent.subscription_id),
        ent.vehicle_id,
        'subscription');
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  RETURN jsonb_build_object(
    'consumed', true, 'entitlement_id', ent.id, 'benefit_type', ent.benefit_type,
    'remaining', v_remaining, 'unlimited', (ent.total_allocated IS NULL), 'last_one', v_last);
END $$;

GRANT EXECUTE ON FUNCTION public.try_consume_entitlement(uuid, public.benefit_type, uuid, uuid, text) TO authenticated;
