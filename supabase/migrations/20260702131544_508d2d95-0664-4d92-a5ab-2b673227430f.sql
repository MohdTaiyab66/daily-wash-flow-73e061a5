
-- 1. Partner cancel: release via DAR instead of deleting services --------------
CREATE OR REPLACE FUNCTION public.cancel_assignment(p_assignment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_partner uuid := auth.uid();
  v_event_id uuid;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public._setting_bool('allow_partner_cancel', true) THEN
    RAISE EXCEPTION 'Partner cancellation is disabled by admin';
  END IF;

  -- Verify the assignment belongs to this partner and is active
  PERFORM 1 FROM public.assignments
   WHERE id = p_assignment_id AND partner_id = v_partner AND status = 'active';
  IF NOT FOUND THEN RETURN; END IF;

  -- Hand today's pending services to the DAR recovery engine (releases + creates offers)
  v_event_id := public.dar_trigger_recovery(v_partner, 'cancelled');

  -- Future pending services (beyond today) are still cancelled — DAR handles today only
  DELETE FROM public.services
   WHERE assignment_id = p_assignment_id
     AND partner_id = v_partner
     AND scheduled_date > CURRENT_DATE
     AND status = 'pending';

  UPDATE public.assignments
     SET status = 'cancelled', completed_at = now()
   WHERE id = p_assignment_id AND partner_id = v_partner AND status = 'active';

  UPDATE public.partners SET cars_selected = 0, updated_at = now() WHERE id = v_partner;
END $function$;

-- 2. Start-time timeout: if partner hasn't begun any service by cutoff, release -
CREATE OR REPLACE FUNCTION public.dar_check_start_timeouts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled boolean := public._setting_bool('dar.enabled', true);
  v_cutoff  text;
  v_cutoff_time time;
  v_now_time time := (now() AT TIME ZONE 'Asia/Kolkata')::time;
  v_partner record;
  v_triggered int := 0;
BEGIN
  IF NOT v_enabled THEN RETURN 0; END IF;

  SELECT (value #>> '{}') INTO v_cutoff
    FROM public.platform_settings WHERE key = 'partner_start_deadline';
  v_cutoff_time := COALESCE(v_cutoff, '10:00')::time;

  IF v_now_time < v_cutoff_time THEN RETURN 0; END IF;

  FOR v_partner IN
    SELECT DISTINCT s.partner_id
      FROM public.services s
     WHERE s.scheduled_date = CURRENT_DATE
       AND s.status = 'pending'
       AND s.partner_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.services s2
          WHERE s2.partner_id = s.partner_id
            AND s2.scheduled_date = CURRENT_DATE
            AND s2.status IN ('in_progress','completed')
       )
  LOOP
    PERFORM public.dar_trigger_recovery(v_partner.partner_id, 'no_show');
    v_triggered := v_triggered + 1;
  END LOOP;

  RETURN v_triggered;
END $function$;

REVOKE ALL ON FUNCTION public.dar_check_start_timeouts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dar_check_start_timeouts() TO service_role;

-- 3. Customer notification when service gets a new partner (DAR reassignment) ---
CREATE OR REPLACE FUNCTION public.tg_notify_customer_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_partner_name text;
  v_customer_user uuid;
BEGIN
  -- Only fire when a released service (recovery_event_id set, partner was NULL) gets a new partner
  IF NEW.partner_id IS NULL OR OLD.partner_id IS NOT DISTINCT FROM NEW.partner_id THEN
    RETURN NEW;
  END IF;
  IF OLD.partner_id IS NOT NULL OR NEW.recovery_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_new_partner_name FROM public.partners WHERE id = NEW.partner_id;

  -- customers.id == auth user id in this schema (see ensure_ops_customer_for_booking)
  v_customer_user := NEW.customer_id;

  INSERT INTO public.customer_notifications (user_id, type, title, body, link, metadata)
  VALUES (
    v_customer_user,
    'service_reassigned',
    'Your service has been reassigned',
    'Your new Urban Wash partner is ' || COALESCE(v_new_partner_name, 'on the way') || '.',
    '/c/bookings',
    jsonb_build_object('service_id', NEW.id, 'new_partner_id', NEW.partner_id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- never block the reassignment on a notification failure
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_notify_customer_reassignment ON public.services;
CREATE TRIGGER trg_notify_customer_reassignment
AFTER UPDATE OF partner_id ON public.services
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_customer_reassignment();

-- 4. Admin alert whenever DAR opens a recovery event ---------------------------
CREATE OR REPLACE FUNCTION public.tg_admin_alert_dar_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_partner_name text;
BEGIN
  SELECT full_name INTO v_partner_name FROM public.partners WHERE id = NEW.partner_id;
  INSERT INTO public.admin_alerts (kind, severity, title, body, meta)
  VALUES (
    'dar_event',
    'warning',
    'Partner unavailable — ' || COALESCE(v_partner_name, 'Unknown'),
    NEW.affected_count || ' customers released (' || NEW.reason || '). Auto-recovery in progress.',
    jsonb_build_object(
      'event_id', NEW.id,
      'partner_id', NEW.partner_id,
      'reason', NEW.reason,
      'released', NEW.affected_count
    )
  );
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_admin_alert_dar_event ON public.dar_events;
CREATE TRIGGER trg_admin_alert_dar_event
AFTER INSERT ON public.dar_events
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_alert_dar_event();

-- 5. Default settings for the new controls -------------------------------------
INSERT INTO public.platform_settings (key, value, description) VALUES
  ('partner_start_deadline', to_jsonb('10:00'::text), 'Local time (Asia/Kolkata) by which a partner must have started at least one service before auto-DAR releases the rest.')
ON CONFLICT (key) DO NOTHING;
