
CREATE OR REPLACE FUNCTION public.get_pending_offer_for_partner(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (auth.uid() = p_partner_id OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT to_jsonb(o) || jsonb_build_object(
    'subscription_assignment_queue', to_jsonb(q) || jsonb_build_object(
      'bookings', to_jsonb(b) || jsonb_build_object(
        'customer_vehicles', to_jsonb(cv),
        'customer_addresses', to_jsonb(ca)
      )
    ),
    '_customer_name', COALESCE(cp.full_name, c.full_name)
  )
  INTO v_result
  FROM public.subscription_offers o
  JOIN public.subscription_assignment_queue q ON q.id = o.queue_id
  LEFT JOIN public.bookings b ON b.id = q.booking_id
  LEFT JOIN public.customer_vehicles cv ON cv.id = b.vehicle_id
  LEFT JOIN public.customer_addresses ca ON ca.id = b.address_id
  LEFT JOIN public.customer_profiles cp ON cp.user_id = q.customer_id
  LEFT JOIN public.customers c ON c.id = q.customer_id
  WHERE o.partner_id = p_partner_id
    AND o.response = 'pending'
    AND o.expires_at > now()
  ORDER BY o.offered_at DESC
  LIMIT 1;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_pending_offer_for_partner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_offer_for_partner(uuid) TO authenticated, service_role;
