
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND ( p.proname IN ('send_partner_notification','dar_expire_offers','dar_dashboard_metrics')
            OR p.proname LIKE 'admin\_%' ESCAPE '\' )
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION '||r.sig||' FROM PUBLIC, anon';
    IF r.proname IN ('send_partner_notification','dar_expire_offers') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION '||r.sig||' FROM authenticated';
      EXECUTE 'GRANT EXECUTE ON FUNCTION '||r.sig||' TO service_role';
    END IF;
  END LOOP;
END$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_my_service_photo_url'
  LOOP
    EXECUTE 'ALTER FUNCTION '||r.sig||' SET search_path = public';
  END LOOP;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='services_partner_id_fkey') THEN
    ALTER TABLE public.services ADD CONSTRAINT services_partner_id_fkey
      FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='services_customer_id_fkey') THEN
    ALTER TABLE public.services ADD CONSTRAINT services_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='subscriptions_customer_id_fkey') THEN
    ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='route_change_log_partner_id_fkey') THEN
    ALTER TABLE public.route_change_log ADD CONSTRAINT route_change_log_partner_id_fkey
      FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='route_change_log_service_id_fkey') THEN
    ALTER TABLE public.route_change_log ADD CONSTRAINT route_change_log_service_id_fkey
      FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='route_drafts_partner_id_fkey') THEN
    ALTER TABLE public.route_drafts ADD CONSTRAINT route_drafts_partner_id_fkey
      FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='route_snapshots_partner_id_fkey') THEN
    ALTER TABLE public.route_snapshots ADD CONSTRAINT route_snapshots_partner_id_fkey
      FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='unavailability_reports_partner_id_fkey') THEN
    ALTER TABLE public.unavailability_reports ADD CONSTRAINT unavailability_reports_partner_id_fkey
      FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='unavailability_reports_customer_id_fkey') THEN
    ALTER TABLE public.unavailability_reports ADD CONSTRAINT unavailability_reports_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='partner_reliability_events_service_id_fkey') THEN
    ALTER TABLE public.partner_reliability_events ADD CONSTRAINT partner_reliability_events_service_id_fkey
      FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL NOT VALID;
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_services_customer_date
  ON public.services(customer_id, scheduled_date)
  WHERE status IN ('pending','in_progress','completed') AND customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_assignments_partner_active_start
  ON public.assignments(partner_id, start_date)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_assignments_partner_status ON public.assignments(partner_id, status);
CREATE INDEX IF NOT EXISTS idx_assignments_date_range ON public.assignments(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_services_status_date ON public.services(status, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_assigned_partner_status ON public.subscriptions(assigned_partner_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_pn_unread ON public.partner_notifications(partner_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wl_entry_type ON public.wallet_ledger(entry_type, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='assignments'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.assignments';
  END IF;
END$$;
