
-- Helper: compute effective area lock date for a partner given the CURRENT setting.
CREATE OR REPLACE FUNCTION public.compute_area_lock_until(_partner uuid)
RETURNS date
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int;
  v_last date;
BEGIN
  SELECT COALESCE((value::text)::int, 0) INTO v_days
    FROM public.platform_settings WHERE key = 'area_lock_days';
  v_days := COALESCE(v_days, 0);
  IF v_days <= 0 THEN RETURN NULL; END IF;

  SELECT MAX(changed_at)::date INTO v_last
    FROM public.area_change_history WHERE partner_id = _partner;

  IF v_last IS NULL THEN
    -- No recorded change (initial set only): use partner updated_at as best-effort anchor.
    SELECT updated_at::date INTO v_last FROM public.partners WHERE id = _partner;
  END IF;

  IF v_last IS NULL THEN RETURN NULL; END IF;
  RETURN v_last + v_days;
END $$;

GRANT EXECUTE ON FUNCTION public.compute_area_lock_until(uuid) TO authenticated, service_role;

-- Rewrite set_partner_area to use live-computed lock instead of stored snapshot.
CREATE OR REPLACE FUNCTION public.set_partner_area(p_area text, p_lat numeric, p_lng numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_current text;
  v_lock_days int;
  v_effective date;
  v_cov record;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT home_area INTO v_current FROM public.partners WHERE id = v_partner;

  SELECT COALESCE((value::text)::int, 0) INTO v_lock_days
    FROM public.platform_settings WHERE key = 'area_lock_days';
  v_lock_days := COALESCE(v_lock_days, 0);

  v_effective := public.compute_area_lock_until(v_partner);

  IF v_lock_days > 0
     AND v_current IS NOT NULL
     AND v_current <> p_area
     AND v_effective IS NOT NULL
     AND v_effective > CURRENT_DATE THEN
    RAISE EXCEPTION 'Area is locked until %', v_effective;
  END IF;

  SELECT * INTO v_cov FROM public.get_coverage_at(p_lat::double precision, p_lng::double precision);
  IF NOT COALESCE(v_cov.matched, false) OR v_cov.status <> 'active' THEN
    RAISE EXCEPTION 'This location is not in an active service zone' USING ERRCODE = 'P0001';
  END IF;

  IF v_current IS DISTINCT FROM p_area THEN
    INSERT INTO public.area_change_history (partner_id, from_area, to_area)
    VALUES (v_partner, v_current, p_area);
  END IF;

  UPDATE public.partners SET
    previous_area = CASE WHEN v_current IS DISTINCT FROM p_area THEN v_current ELSE previous_area END,
    home_area = p_area,
    home_lat = p_lat,
    home_lng = p_lng,
    home_zone_id = v_cov.zone_id,
    area_locked_until = CASE WHEN v_lock_days > 0 THEN CURRENT_DATE + v_lock_days ELSE NULL END,
    area_change_count = area_change_count + CASE WHEN v_current IS NOT NULL AND v_current IS DISTINCT FROM p_area THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE id = v_partner;
END $$;

-- Recompute stored area_locked_until for every partner whenever area_lock_days changes.
CREATE OR REPLACE FUNCTION public.tg_recompute_area_locks()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int;
BEGIN
  IF NEW.key <> 'area_lock_days' THEN RETURN NEW; END IF;
  v_days := COALESCE((NEW.value::text)::int, 0);

  IF v_days <= 0 THEN
    UPDATE public.partners SET area_locked_until = NULL WHERE area_locked_until IS NOT NULL;
  ELSE
    UPDATE public.partners p SET area_locked_until = sub.new_until
    FROM (
      SELECT p2.id,
             COALESCE(
               (SELECT MAX(changed_at)::date FROM public.area_change_history h WHERE h.partner_id = p2.id),
               p2.updated_at::date
             ) + v_days AS new_until
      FROM public.partners p2
      WHERE p2.home_area IS NOT NULL
    ) sub
    WHERE p.id = sub.id
      AND p.area_locked_until IS DISTINCT FROM sub.new_until;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS platform_settings_area_lock_recompute ON public.platform_settings;
CREATE TRIGGER platform_settings_area_lock_recompute
AFTER INSERT OR UPDATE ON public.platform_settings
FOR EACH ROW WHEN (NEW.key = 'area_lock_days')
EXECUTE FUNCTION public.tg_recompute_area_locks();

-- Backfill NOW using the current setting so existing rows reflect reality.
DO $$
DECLARE
  v_days int;
BEGIN
  SELECT COALESCE((value::text)::int, 0) INTO v_days
    FROM public.platform_settings WHERE key = 'area_lock_days';
  v_days := COALESCE(v_days, 0);

  IF v_days <= 0 THEN
    UPDATE public.partners SET area_locked_until = NULL WHERE area_locked_until IS NOT NULL;
  ELSE
    UPDATE public.partners p SET area_locked_until = sub.new_until
    FROM (
      SELECT p2.id,
             COALESCE(
               (SELECT MAX(changed_at)::date FROM public.area_change_history h WHERE h.partner_id = p2.id),
               p2.updated_at::date
             ) + v_days AS new_until
      FROM public.partners p2
      WHERE p2.home_area IS NOT NULL
    ) sub
    WHERE p.id = sub.id
      AND p.area_locked_until IS DISTINCT FROM sub.new_until;
  END IF;
END $$;
