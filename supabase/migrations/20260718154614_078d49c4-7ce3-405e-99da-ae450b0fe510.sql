CREATE OR REPLACE FUNCTION public.get_pending_offer_for_partner(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    '_customer_name', COALESCE(cp.full_name, c.full_name),
    '_server_now', now(),
    '_remaining_seconds', GREATEST(0, CEIL(EXTRACT(EPOCH FROM (o.expires_at - now()))))::int,
    '_server_txid', txid_current()
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
    AND (b.id IS NULL OR b.payment_status = 'paid')
  ORDER BY b.created_at DESC NULLS LAST,
           o.offered_at DESC,
           o.id DESC
  LIMIT 1;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_offer_client_event(
  p_offer_id uuid,
  p_stage text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_offer public.subscription_offers%ROWTYPE;
  v_event_id uuid;
  v_allowed_stages constant text[] := ARRAY[
    'popup_open',
    'popup_ignored_duplicate',
    'popup_closed',
    'popup_timer_expired',
    'realtime_event',
    'polling_refetch',
    'push_received',
    'notification_opened',
    'accept_clicked',
    'decline_clicked',
    'client_response_success',
    'client_response_error'
  ];
BEGIN
  IF p_stage IS NULL OR NOT (p_stage = ANY(v_allowed_stages)) THEN
    RAISE EXCEPTION 'Invalid offer client event stage: %', p_stage;
  END IF;

  SELECT * INTO v_offer
  FROM public.subscription_offers
  WHERE id = p_offer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;

  IF NOT (auth.uid() = v_offer.partner_id OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.offer_delivery_events(offer_id, queue_id, partner_id, stage, meta)
  VALUES (
    v_offer.id,
    v_offer.queue_id,
    v_offer.partner_id,
    p_stage,
    COALESCE(p_meta, '{}'::jsonb) || jsonb_build_object(
      'caller', COALESCE(p_meta->>'caller', 'partner_app'),
      'server_now', now(),
      'server_txid', txid_current(),
      'offer_status', v_offer.response,
      'offered_at', v_offer.offered_at,
      'expires_at', v_offer.expires_at,
      'remaining_seconds_server', GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_offer.expires_at - now()))))::int
    )
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.log_offer_client_event(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_offer_client_event(uuid, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_offer_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.offer_delivery_events(offer_id, queue_id, partner_id, stage, meta)
  VALUES (
    NEW.id,
    NEW.queue_id,
    NEW.partner_id,
    'created',
    jsonb_build_object(
      'scope', NEW.scope,
      'caller', COALESCE(NEW.score_breakdown->>'created_by', 'unknown'),
      'server_now', now(),
      'server_txid', txid_current(),
      'offer_status', NEW.response,
      'offered_at', NEW.offered_at,
      'expires_at', NEW.expires_at,
      'remaining_seconds_server', GREATEST(0, CEIL(EXTRACT(EPOCH FROM (NEW.expires_at - now()))))::int
    )
  );
  INSERT INTO public.offer_delivery_events(offer_id, queue_id, partner_id, stage, meta)
  VALUES (
    NEW.id,
    NEW.queue_id,
    NEW.partner_id,
    'selected',
    jsonb_build_object(
      'caller', 'offer_next_for_queue',
      'server_now', now(),
      'server_txid', txid_current(),
      'offer_status', NEW.response
    )
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_offer_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.response IS DISTINCT FROM OLD.response AND NEW.response IN ('accepted','declined','timeout','superseded') THEN
    INSERT INTO public.offer_delivery_events(offer_id, queue_id, partner_id, stage, meta)
    VALUES (
      NEW.id, NEW.queue_id, NEW.partner_id,
      CASE NEW.response
        WHEN 'accepted' THEN 'accepted'
        WHEN 'declined' THEN 'declined'
        WHEN 'timeout' THEN 'timed_out'
        WHEN 'superseded' THEN 'superseded'
      END,
      jsonb_build_object(
        'caller', 'subscription_offers_update_trigger',
        'server_now', now(),
        'server_txid', txid_current(),
        'previous_status', OLD.response,
        'new_status', NEW.response,
        'responded_at', NEW.responded_at,
        'expires_at', NEW.expires_at,
        'remaining_seconds_server', GREATEST(0, CEIL(EXTRACT(EPOCH FROM (NEW.expires_at - now()))))::int
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP VIEW IF EXISTS public.v_offer_debug;

CREATE VIEW public.v_offer_debug AS
SELECT
  b.id AS booking_id,
  b.created_at AS booking_created_at,
  b.payment_status,
  b.status AS booking_status,
  q.id AS queue_id,
  q.created_at AS queue_created_at,
  q.status AS queue_status,
  cardinality(q.tried_partner_ids) AS retry_count,
  q.next_retry_at,
  q.current_offer_partner_id,
  o.id AS offer_id,
  o.partner_id,
  o.created_at AS offer_created_at,
  o.offered_at,
  o.expires_at,
  GREATEST(0, CEIL(EXTRACT(EPOCH FROM (o.expires_at - now()))))::int AS remaining_seconds_server,
  o.response AS offer_status,
  o.responded_at,
  COALESCE(o.score_breakdown ->> 'created_by', 'unknown') AS created_by,
  CASE
    WHEN o.score_breakdown ? 'created_by' THEN o.score_breakdown ->> 'created_by'
    WHEN o.scope = 'admin_force' THEN 'admin_force_assign_queue'
    ELSE 'legacy_or_unknown'
  END AS rpc,
  pn.id AS partner_notification_id,
  pn.created_at AS partner_notification_at,
  pn.pushed_at AS partner_notification_pushed_at,
  e.id AS offer_delivery_event_id,
  e.stage AS transition_stage,
  e.created_at AS transition_at,
  e.meta AS transition_meta,
  e.meta->>'caller' AS caller,
  e.meta->>'server_txid' AS server_txid,
  q.attempts_log
FROM public.bookings b
LEFT JOIN public.subscription_assignment_queue q ON q.booking_id = b.id
LEFT JOIN public.subscription_offers o ON o.queue_id = q.id
LEFT JOIN public.partner_notifications pn
  ON pn.type = 'daily_shine_offer'
 AND pn.metadata ->> 'offer_id' = o.id::text
LEFT JOIN public.offer_delivery_events e ON e.offer_id = o.id;

GRANT SELECT ON public.v_offer_debug TO authenticated;
GRANT SELECT ON public.v_offer_debug TO service_role;