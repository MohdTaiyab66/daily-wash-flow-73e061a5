
UPDATE public.subscription_offers
   SET response = 'expired', expires_at = now() - interval '1 second'
 WHERE response = 'pending';

UPDATE public.subscription_assignment_queue
   SET status = 'waiting_for_partner',
       current_offer_partner_id = NULL,
       offer_expires_at = NULL,
       next_retry_at = now() + interval '10 minutes'
 WHERE status = 'offered';
