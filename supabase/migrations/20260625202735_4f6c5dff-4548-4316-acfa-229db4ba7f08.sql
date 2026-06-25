
-- 1. Heartbeat column (informational only — availability is never auto-changed)
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS last_seen timestamptz;

-- 2. Realtime coverage for every table the marketplace + customer status depend on
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'subscriptions',
    'payments',
    'customer_notifications',
    'dirty_vehicle_reports',
    'unavailability_reports',
    'subscription_extensions',
    'subscription_pauses',
    'partners',
    'customer_addresses',
    'customer_vehicles',
    'assignment_changes'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- 3. REPLICA IDENTITY FULL for tables we filter on by partner_id / customer_id
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'subscription_offers',
    'subscription_assignment_queue',
    'partners',
    'assignments',
    'services',
    'subscriptions',
    'payments',
    'customer_notifications'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
END $$;
