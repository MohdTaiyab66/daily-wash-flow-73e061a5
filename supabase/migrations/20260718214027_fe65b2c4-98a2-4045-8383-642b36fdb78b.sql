
-- ── D: notification transitions on accept ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_archive_offer_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.response IS DISTINCT FROM OLD.response
     AND NEW.response IN ('declined','expired','cancelled','accepted','superseded') THEN
    UPDATE public.partner_notifications
       SET read_at = COALESCE(read_at, now()),
           link = CASE
                    WHEN NEW.response = 'accepted' THEN '/app/my-assignment'
                    ELSE '/app'
                  END
     WHERE partner_id = NEW.partner_id
       AND type = 'daily_shine_offer'
       AND (metadata->>'offer_id') = NEW.id::text;
  END IF;
  RETURN NEW;
END $$;

-- ── B Phase 1: deprecation log for legacy marketplace accept path ──────────
CREATE TABLE IF NOT EXISTS public.deprecated_call_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fn_name text NOT NULL,
  caller_user_id uuid,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  called_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.deprecated_call_log TO authenticated;
GRANT ALL ON public.deprecated_call_log TO service_role;
ALTER TABLE public.deprecated_call_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read deprecated call log" ON public.deprecated_call_log;
CREATE POLICY "admins read deprecated call log"
  ON public.deprecated_call_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_deprecated_call_log_fn_time
  ON public.deprecated_call_log (fn_name, called_at DESC);

-- Wrap mp_accept_offer to log calls before delegating. Rename original.
DO $$
DECLARE
  has_orig boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='mp_accept_offer_legacy_impl'
  ) INTO has_orig;

  IF NOT has_orig THEN
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='mp_accept_offer') THEN
      ALTER FUNCTION public.mp_accept_offer(uuid) RENAME TO mp_accept_offer_legacy_impl;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.mp_accept_offer(p_broadcast_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  BEGIN
    INSERT INTO public.deprecated_call_log(fn_name, caller_user_id, args)
    VALUES ('mp_accept_offer', auth.uid(), jsonb_build_object('broadcast_id', p_broadcast_id));
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_notify('deprecated_call_log_error', SQLERRM);
  END;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname='mp_accept_offer_legacy_impl') THEN
    EXECUTE 'SELECT public.mp_accept_offer_legacy_impl($1)' INTO v_result USING p_broadcast_id;
    RETURN v_result;
  END IF;
  RETURN jsonb_build_object('ok', false, 'reason', 'legacy_path_disabled');
END $$;

-- Wrap mp_consume_action_token the same way.
DO $$
DECLARE
  has_orig boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='mp_consume_action_token_legacy_impl'
  ) INTO has_orig;

  IF NOT has_orig THEN
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='mp_consume_action_token') THEN
      ALTER FUNCTION public.mp_consume_action_token(text, text) RENAME TO mp_consume_action_token_legacy_impl;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.mp_consume_action_token(p_token text, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  BEGIN
    INSERT INTO public.deprecated_call_log(fn_name, caller_user_id, args)
    VALUES ('mp_consume_action_token', auth.uid(),
            jsonb_build_object('action', p_action, 'token_prefix', left(p_token, 8)));
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_notify('deprecated_call_log_error', SQLERRM);
  END;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname='mp_consume_action_token_legacy_impl') THEN
    EXECUTE 'SELECT public.mp_consume_action_token_legacy_impl($1,$2)' INTO v_result USING p_token, p_action;
    RETURN v_result;
  END IF;
  RETURN jsonb_build_object('ok', false, 'reason', 'legacy_path_disabled');
END $$;
