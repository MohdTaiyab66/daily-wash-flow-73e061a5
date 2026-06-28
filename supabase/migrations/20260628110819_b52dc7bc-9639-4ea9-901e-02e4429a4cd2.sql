
-- ============================================================
-- PHASE 1: Enable Realtime publication for app-critical tables
-- ============================================================
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'services',
    'partner_notifications',
    'customer_notifications',
    'subscription_offers',
    'subscription_assignment_queue',
    'bookings',
    'subscriptions',
    'partners',
    'route_drafts',
    'route_change_log',
    'offer_delivery_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
    -- Ensure UPDATE payloads include full row (needed for partner offer popup, etc.)
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;

-- ============================================================
-- PHASE 7: Schedule background jobs via pg_cron + pg_net
-- ============================================================

-- Unschedule any prior versions (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job
   WHERE jobname IN ('uw-offer-push-dispatch','uw-offer-sweep');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Offer push dispatch — every 20 seconds
SELECT cron.schedule(
  'uw-offer-push-dispatch',
  '20 seconds',
  $cron$
  SELECT net.http_post(
    url := 'https://project--1206e21a-d7b1-4465-ae7c-4fc59022829f.lovable.app/api/public/cron/offer-push-dispatch',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_9vQjWw1OegGmaAcIk2VgyQ_MyuGCkj0"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);

-- Offer sweep / expiry — every 30 seconds
SELECT cron.schedule(
  'uw-offer-sweep',
  '30 seconds',
  $cron$
  SELECT net.http_post(
    url := 'https://project--1206e21a-d7b1-4465-ae7c-4fc59022829f.lovable.app/api/public/cron/assignment-tick',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_9vQjWw1OegGmaAcIk2VgyQ_MyuGCkj0"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);
