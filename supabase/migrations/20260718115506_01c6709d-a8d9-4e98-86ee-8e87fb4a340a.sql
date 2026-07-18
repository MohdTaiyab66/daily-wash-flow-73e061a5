-- P0: one offer_id -> one FCM attempt. Claim before send.

-- Remove duplicate in-flight/terminal push rows if any exist.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY offer_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.offer_delivery_events
  WHERE stage IN ('push_claimed', 'push_sent', 'push_failed')
)
DELETE FROM public.offer_delivery_events ode
USING ranked r
WHERE ode.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_offer_delivery_events_one_push_attempt_per_offer
  ON public.offer_delivery_events(offer_id)
  WHERE stage IN ('push_claimed', 'push_sent', 'push_failed');