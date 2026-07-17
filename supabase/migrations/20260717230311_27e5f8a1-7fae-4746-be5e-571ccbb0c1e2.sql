
SELECT cron.unschedule(4);
SELECT cron.schedule(
  'assignment-tick-direct',
  '30 seconds',
  $$SELECT public.sweep_subscription_offers();$$
);
