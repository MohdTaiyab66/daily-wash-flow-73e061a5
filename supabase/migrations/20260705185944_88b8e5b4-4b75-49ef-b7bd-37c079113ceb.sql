
SELECT cron.unschedule('marketplace-push-15s') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='marketplace-push-15s');
SELECT cron.schedule(
  'marketplace-push-15s',
  '15 seconds',
  $$
  SELECT net.http_post(
    url := 'https://project--1206e21a-d7b1-4465-ae7c-4fc59022829f.lovable.app/api/public/cron/marketplace-push-dispatch',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_9vQjWw1OegGmaAcIk2VgyQ_MyuGCkj0"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
