DO $$
DECLARE r record; n int;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (COALESCE((SELECT bk.user_id FROM public.bookings bk WHERE bk.id = b.booking_id), b.customer_id))
           b.id, b.updated_at
      FROM public.marketplace_broadcasts b
     WHERE b.status = 'assigned' AND b.winning_partner_id IS NOT NULL
     ORDER BY COALESCE((SELECT bk.user_id FROM public.bookings bk WHERE bk.id = b.booking_id), b.customer_id),
              b.updated_at DESC
  LOOP
    BEGIN
      n := public.mp_generate_services_for_broadcast(r.id);
      RAISE NOTICE 'broadcast % -> %', r.id, n;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;