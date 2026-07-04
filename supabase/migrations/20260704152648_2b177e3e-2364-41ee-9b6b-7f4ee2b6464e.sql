
-- Persistent assignment duration must survive renewal.
-- Track the originally-selected duration so auto-renew extends by the same amount.

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS original_duration_days integer;

UPDATE public.assignments
   SET original_duration_days = duration_days
 WHERE original_duration_days IS NULL;

-- Trigger keeps original_duration_days pinned to the value chosen at accept time.
CREATE OR REPLACE FUNCTION public.set_original_duration_days()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.original_duration_days IS NULL THEN
    NEW.original_duration_days := NEW.duration_days;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assignments_original_duration ON public.assignments;
CREATE TRIGGER trg_assignments_original_duration
BEFORE INSERT ON public.assignments
FOR EACH ROW EXECUTE FUNCTION public.set_original_duration_days();

-- Ensure the admin-tunable duration bounds always exist in platform_settings.
INSERT INTO public.platform_settings(key, value)
VALUES
  ('assignment_min_days', to_jsonb(7)),
  ('assignment_max_days', to_jsonb(90)),
  ('assignment_default_days', to_jsonb(30))
ON CONFLICT (key) DO NOTHING;

-- Auto-renew now extends by the originally-selected duration, not the global default.
CREATE OR REPLACE FUNCTION public.renew_assignments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_default_days int;
  v_added int;
  v_new_end date;
  v_count int := 0;
BEGIN
  SELECT COALESCE((value::text)::int, 30) INTO v_default_days
    FROM public.platform_settings WHERE key = 'assignment_default_days';

  FOR r IN
    SELECT * FROM public.assignments
     WHERE status = 'active'
       AND auto_renew = true
       AND end_date <= (CURRENT_DATE + 1)
  LOOP
    -- Extend by the assignment's originally-selected duration (fallback to
    -- current duration_days, then the platform default).
    v_added := GREATEST(1, COALESCE(r.original_duration_days, r.duration_days, v_default_days));
    v_new_end := r.end_date + v_added;

    UPDATE public.assignments
       SET end_date = v_new_end,
           duration_days = COALESCE(duration_days, 0) + v_added,
           updated_at = now()
     WHERE id = r.id;

    UPDATE public.subscription_assignment_queue
       SET lock_until = v_new_end
     WHERE assigned_partner_id = r.partner_id
       AND status = 'assigned'
       AND locked_partner_id IS NOT NULL;

    v_count := v_count + 1;
  END LOOP;

  PERFORM public.generate_daily_routes(CURRENT_DATE + 1);
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.renew_assignments() TO service_role;
