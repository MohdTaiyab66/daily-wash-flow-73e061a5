
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove old job if present
DO $$ BEGIN PERFORM cron.unschedule('ds-assignment-tick'); EXCEPTION WHEN OTHERS THEN END $$;

SELECT cron.schedule(
  'ds-assignment-tick',
  '* * * * *',
  $$ SELECT public.sweep_subscription_offers(); $$
);
