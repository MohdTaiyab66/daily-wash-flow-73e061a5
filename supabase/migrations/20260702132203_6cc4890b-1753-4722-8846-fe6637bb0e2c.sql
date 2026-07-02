
-- 1. Setting
INSERT INTO public.platform_settings (key, value, description)
VALUES ('partner_heartbeat_timeout_minutes', '5', 'Minutes of GPS/heartbeat silence before a partner is marked offline and DAR reclaims their route.')
ON CONFLICT (key) DO NOTHING;

-- 2. gps_source column
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS gps_source text;

-- 3. Centroid detection trigger
CREATE OR REPLACE FUNCTION public.customers_tag_gps_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hit boolean := false;
BEGIN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
    NEW.gps_source := 'missing';
    RETURN NEW;
  END IF;

  SELECT true INTO v_hit
  FROM public.service_areas sa
  WHERE sa.center_lat IS NOT NULL
    AND sa.center_lng IS NOT NULL
    AND abs(sa.center_lat - NEW.latitude) < 0.0005
    AND abs(sa.center_lng - NEW.longitude) < 0.0005
  LIMIT 1;

  NEW.gps_source := CASE WHEN v_hit THEN 'centroid' ELSE 'exact' END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_customers_tag_gps_source ON public.customers;
CREATE TRIGGER tg_customers_tag_gps_source
BEFORE INSERT OR UPDATE OF latitude, longitude ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.customers_tag_gps_source();

-- 4. Backfill existing rows (single pass)
UPDATE public.customers c
SET gps_source = CASE
  WHEN c.latitude IS NULL OR c.longitude IS NULL THEN 'missing'
  WHEN EXISTS (
    SELECT 1 FROM public.service_areas sa
    WHERE sa.center_lat IS NOT NULL AND sa.center_lng IS NOT NULL
      AND abs(sa.center_lat - c.latitude) < 0.0005
      AND abs(sa.center_lng - c.longitude) < 0.0005
  ) THEN 'centroid'
  ELSE 'exact'
END
WHERE gps_source IS NULL;

-- 5. Offline detection + DAR trigger
CREATE OR REPLACE FUNCTION public.dar_check_offline_partners()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timeout_min int;
  v_cutoff timestamptz;
  v_partner record;
  v_triggered int := 0;
BEGIN
  SELECT COALESCE(NULLIF(value,'')::int, 5) INTO v_timeout_min
  FROM public.platform_settings WHERE key = 'partner_heartbeat_timeout_minutes';
  v_timeout_min := COALESCE(v_timeout_min, 5);
  v_cutoff := now() - make_interval(mins => v_timeout_min);

  FOR v_partner IN
    SELECT id FROM public.partners
    WHERE availability = 'online'
      AND (last_seen IS NULL OR last_seen < v_cutoff)
  LOOP
    UPDATE public.partners
      SET availability = 'offline', updated_at = now()
      WHERE id = v_partner.id;

    PERFORM public.dar_trigger_recovery(v_partner.id, 'offline_timeout');

    INSERT INTO public.admin_alerts (type, severity, title, message, metadata)
    VALUES ('partner_offline_timeout', 'warning',
      'Partner auto-marked offline',
      'Partner ' || v_partner.id || ' was inactive for ' || v_timeout_min || ' min; DAR triggered.',
      jsonb_build_object('partner_id', v_partner.id, 'timeout_minutes', v_timeout_min));

    v_triggered := v_triggered + 1;
  END LOOP;

  RETURN v_triggered;
END;
$$;

-- 6. Admin GPS health view
CREATE OR REPLACE VIEW public.admin_gps_health AS
SELECT
  (SELECT count(*) FROM public.customers WHERE is_active) AS active_customers,
  (SELECT count(*) FROM public.customers WHERE is_active AND gps_source = 'exact') AS gps_exact,
  (SELECT count(*) FROM public.customers WHERE is_active AND gps_source = 'centroid') AS gps_centroid,
  (SELECT count(*) FROM public.customers WHERE is_active AND (gps_source = 'missing' OR gps_source IS NULL)) AS gps_missing,
  (SELECT count(*) FROM public.partners WHERE availability = 'online') AS partners_online,
  (SELECT count(*) FROM public.partners WHERE availability = 'offline') AS partners_offline,
  (SELECT count(*) FROM public.partners WHERE availability = 'online' AND last_seen < now() - interval '5 minutes') AS partners_stale_heartbeat,
  (SELECT count(*) FROM public.assignments WHERE status = 'pending' AND scheduled_date = current_date) AS customers_waiting_reassignment,
  now() AS as_of;

GRANT SELECT ON public.admin_gps_health TO authenticated;
