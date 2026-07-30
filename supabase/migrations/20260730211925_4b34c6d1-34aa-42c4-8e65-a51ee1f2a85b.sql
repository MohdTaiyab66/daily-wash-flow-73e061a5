DO $$
DECLARE r record; n int;
BEGIN
  FOR r IN
    SELECT b.id
      FROM public.marketplace_broadcasts b
     WHERE b.status = 'assigned'
       AND b.winning_partner_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.assignments a
          WHERE a.partner_id = b.winning_partner_id AND a.status = 'active' AND a.end_date >= CURRENT_DATE)
       AND NOT EXISTS (
         SELECT 1 FROM public.services s
          WHERE s.partner_id = b.winning_partner_id
            AND s.customer_id = COALESCE((SELECT bk.user_id FROM public.bookings bk WHERE bk.id = b.booking_id), b.customer_id)
            AND s.scheduled_date >= CURRENT_DATE)
     ORDER BY b.updated_at DESC
  LOOP
    BEGIN
      n := public.mp_generate_services_for_broadcast(r.id);
      RAISE NOTICE 'repaired broadcast % -> % stops', r.id, n;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip broadcast %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;