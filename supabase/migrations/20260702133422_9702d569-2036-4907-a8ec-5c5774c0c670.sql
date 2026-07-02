
-- 1. pushed_at markers
ALTER TABLE public.customer_notifications ADD COLUMN IF NOT EXISTS pushed_at timestamptz;
ALTER TABLE public.partner_notifications  ADD COLUMN IF NOT EXISTS pushed_at timestamptz;
ALTER TABLE public.admin_alerts           ADD COLUMN IF NOT EXISTS pushed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_cn_unpushed ON public.customer_notifications (created_at) WHERE pushed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pn_unpushed ON public.partner_notifications  (created_at) WHERE pushed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_aa_unpushed ON public.admin_alerts           (created_at) WHERE pushed_at IS NULL;

-- 2. centroid detection + write guards
CREATE OR REPLACE FUNCTION public.is_centroid_coord(_lat numeric, _lng numeric)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_areas sa
    WHERE sa.center_lat IS NOT NULL AND sa.center_lng IS NOT NULL
      AND abs(sa.center_lat - _lat) < 0.0005
      AND abs(sa.center_lng - _lng) < 0.0005
  );
$$;

CREATE OR REPLACE FUNCTION public.tg_reject_centroid_address()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Location required. Enable GPS or move to an open area and try again.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF public.is_centroid_coord(NEW.latitude, NEW.longitude)
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'We couldn''t determine your exact location. Please enable GPS or move to an open area.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_centroid_ca ON public.customer_addresses;
CREATE TRIGGER trg_reject_centroid_ca
  BEFORE INSERT OR UPDATE OF latitude, longitude ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.tg_reject_centroid_address();

CREATE OR REPLACE FUNCTION public.tg_reject_centroid_customer()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
    RETURN NEW;  -- admins can create without GPS; audit surfaces these
  END IF;
  IF public.is_centroid_coord(NEW.latitude, NEW.longitude)
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Exact GPS required for customer location.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_centroid_customer ON public.customers;
CREATE TRIGGER trg_reject_centroid_customer
  BEFORE INSERT OR UPDATE OF latitude, longitude ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_reject_centroid_customer();

-- 3. GPS audit report
CREATE OR REPLACE FUNCTION public.gps_audit_report()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _total int; _exact int; _centroid int; _missing int; _invalid int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  SELECT
    count(*),
    count(*) FILTER (WHERE gps_source = 'exact'),
    count(*) FILTER (WHERE gps_source = 'centroid'),
    count(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL),
    count(*) FILTER (WHERE latitude IS NOT NULL AND (latitude NOT BETWEEN -90 AND 90 OR longitude NOT BETWEEN -180 AND 180))
  INTO _total, _exact, _centroid, _missing, _invalid
  FROM public.customers
  WHERE COALESCE(status, 'active') = 'active';
  RETURN jsonb_build_object(
    'total', _total,
    'exact', _exact,
    'centroid', _centroid,
    'missing', _missing,
    'invalid', _invalid,
    'as_of', now()
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.gps_audit_report() TO authenticated;

-- 4. Admin user ids helper (used by notification push dispatcher)
CREATE OR REPLACE FUNCTION public.get_admin_user_ids()
RETURNS TABLE (user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'::app_role;
$$;
GRANT EXECUTE ON FUNCTION public.get_admin_user_ids() TO authenticated, service_role;

-- 5. Cron: dispatch pending notification pushes every minute
DO $$
BEGIN
  PERFORM cron.unschedule('notification-push-dispatch');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'notification-push-dispatch',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://project--1206e21a-d7b1-4465-ae7c-4fc59022829f.lovable.app/api/public/hooks/notification-push',
    headers:='{"Content-Type":"application/json","apikey":"sb_publishable_9vQjWw1OegGmaAcIk2VgyQ_MyuGCkj0"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
