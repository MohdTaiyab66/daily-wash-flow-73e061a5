
UPDATE public.marketplace_broadcasts 
SET status = 'open', 
    current_round = 1, 
    round_expires_at = now() - interval '1 minute', 
    round_started_at = now() - interval '5 minutes'
WHERE id = '405d57f9-d1f2-4d2d-8cb2-0fa402faea05';

UPDATE public.marketplace_offers 
SET response = 'expired', viewed_at = now()
WHERE broadcast_id = '405d57f9-d1f2-4d2d-8cb2-0fa402faea05' AND response = 'pending';

SELECT public.mp_advance_round('405d57f9-d1f2-4d2d-8cb2-0fa402faea05');
