
UPDATE public.marketplace_broadcasts 
SET round_expires_at = now() - interval '1 minute'
WHERE id = '405d57f9-d1f2-4d2d-8cb2-0fa402faea05';

SELECT public.mp_advance_round('405d57f9-d1f2-4d2d-8cb2-0fa402faea05');
