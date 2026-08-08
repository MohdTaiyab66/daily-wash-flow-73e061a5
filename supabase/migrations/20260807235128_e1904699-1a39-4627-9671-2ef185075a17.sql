CREATE OR REPLACE FUNCTION public.tg_offer_decline_cooldown()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.response = 'declined' AND COALESCE(OLD.response,'') <> 'declined' THEN
    INSERT INTO public.subscription_offer_partner_state (queue_id, partner_id, declined_at, next_retry_at)
    VALUES (NEW.queue_id, NEW.partner_id, now(), now() + interval '15 minutes')
    ON CONFLICT (queue_id, partner_id) DO UPDATE
      SET declined_at = now(),
          next_retry_at = now() + interval '15 minutes',
          updated_at = now();

    -- Release the lead back to the pool so other eligible partners get it
    -- on the very next tick. Never touch a lead that is already assigned.
    UPDATE public.subscription_assignment_queue
       SET status = 'waiting_for_partner',
           current_offer_partner_id = NULL,
           offer_expires_at = NULL,
           next_retry_at = now(),
           updated_at = now()
     WHERE id = NEW.queue_id
       AND status NOT IN ('assigned','cancelled');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sweep_subscription_offers()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT o.id, o.queue_id
    FROM public.subscription_offers o
    JOIN public.subscription_assignment_queue q ON q.id = o.queue_id
    JOIN public.bookings b ON b.id = q.booking_id
    WHERE o.response = 'pending'
      AND o.expires_at <= now()
      AND q.status NOT IN ('assigned','cancelled','failed_no_partner')
      AND b.payment_status = 'paid'
      AND b.status NOT IN ('cancelled','failed')
    ORDER BY o.expires_at ASC
    LIMIT 100
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    -- Ignoring an offer carries no penalty: no cooldown row is written here.
    UPDATE public.subscription_offers
       SET response = 'timeout', responded_at = COALESCE(responded_at, now())
     WHERE id = r.id
       AND response = 'pending';

    UPDATE public.offer_delivery_events
       SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('expired_by','sweep_subscription_offers')
     WHERE offer_id = r.id
       AND stage = 'created';

    PERFORM public.offer_next_for_queue(r.queue_id);
    n := n + 1;
  END LOOP;

  FOR r IN
    SELECT q.id
    FROM public.subscription_assignment_queue q
    JOIN public.bookings b ON b.id = q.booking_id
    WHERE (
        (q.status = 'waiting_for_partner' AND (q.next_retry_at IS NULL OR q.next_retry_at <= now()))
        -- Crash/lock recovery: a live lead must never idle past one retry cycle.
        OR (q.status IN ('processing','offered') AND q.updated_at < now() - interval '90 seconds')
      )
      AND b.payment_status = 'paid'
      AND b.status NOT IN ('cancelled','failed')
      AND NOT EXISTS (
        SELECT 1 FROM public.subscription_offers o
        WHERE o.queue_id = q.id
          AND (o.response = 'accepted'
               OR (o.response = 'pending' AND o.expires_at > now()))
      )
    ORDER BY q.created_at ASC
    LIMIT 50
    FOR UPDATE OF q SKIP LOCKED
  LOOP
    PERFORM public.offer_next_for_queue(r.id);
    n := n + 1;
  END LOOP;

  RETURN n;
END;
$function$;