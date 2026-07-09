
-- Ensure extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any older versions of these jobs
DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid, jobname FROM cron.job
    WHERE jobname IN ('close-expired-assignments','regenerate-active-assignments')
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END$$;

-- 18:45 UTC = 00:15 IST — close expired assignments first, then regen services.
SELECT cron.schedule(
  'close-expired-assignments',
  '45 18 * * *',
  $$SELECT public.close_expired_assignments();$$
);
SELECT cron.schedule(
  'regenerate-active-assignments',
  '50 18 * * *',
  $$SELECT public.sweep_regenerate_active_assignments();$$
);
