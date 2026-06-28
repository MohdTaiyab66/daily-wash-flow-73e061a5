
SELECT cron.unschedule('uw-offer-push-dispatch');
SELECT cron.unschedule('uw-offer-sweep');

SELECT cron.schedule(
  'uw-offer-push-dispatch',
  '20 seconds',
  $cron$
  SELECT net.http_post(
    url := 'https://project--1206e21a-d7b1-4465-ae7c-4fc59022829f-dev.lovable.app/api/public/cron/offer-push-dispatch',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_9vQjWw1OegGmaAcIk2VgyQ_MyuGCkj0"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'uw-offer-sweep',
  '30 seconds',
  $cron$
  SELECT net.http_post(
    url := 'https://project--1206e21a-d7b1-4465-ae7c-4fc59022829f-dev.lovable.app/api/public/cron/assignment-tick',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_9vQjWw1OegGmaAcIk2VgyQ_MyuGCkj0"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);
