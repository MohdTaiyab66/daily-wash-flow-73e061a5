CREATE TABLE IF NOT EXISTS public.partner_apk_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  service_id uuid NULL,
  assignment_id uuid NULL,
  event_type text NOT NULL,
  platform text NOT NULL DEFAULT 'unknown',
  app_variant text NOT NULL DEFAULT 'partner',
  is_native boolean NOT NULL DEFAULT false,
  lat numeric NULL,
  lng numeric NULL,
  accuracy numeric NULL,
  status text NOT NULL DEFAULT 'info',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_apk_events_actor_time
  ON public.partner_apk_workflow_events(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_apk_events_service_time
  ON public.partner_apk_workflow_events(service_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_apk_events_type_time
  ON public.partner_apk_workflow_events(event_type, created_at DESC);

GRANT SELECT ON public.partner_apk_workflow_events TO authenticated;
GRANT INSERT ON public.partner_apk_workflow_events TO authenticated;
GRANT ALL ON public.partner_apk_workflow_events TO service_role;

ALTER TABLE public.partner_apk_workflow_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partners read own apk workflow evidence" ON public.partner_apk_workflow_events;
DROP POLICY IF EXISTS "admins read apk workflow evidence" ON public.partner_apk_workflow_events;
DROP POLICY IF EXISTS "partners insert own apk workflow evidence" ON public.partner_apk_workflow_events;

CREATE POLICY "partners read own apk workflow evidence"
ON public.partner_apk_workflow_events
FOR SELECT
TO authenticated
USING (actor_id = auth.uid());

CREATE POLICY "admins read apk workflow evidence"
ON public.partner_apk_workflow_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "partners insert own apk workflow evidence"
ON public.partner_apk_workflow_events
FOR INSERT
TO authenticated
WITH CHECK (actor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.log_partner_apk_workflow_event(
  p_event_type text,
  p_service_id uuid DEFAULT NULL,
  p_assignment_id uuid DEFAULT NULL,
  p_platform text DEFAULT 'unknown',
  p_app_variant text DEFAULT 'partner',
  p_is_native boolean DEFAULT false,
  p_lat numeric DEFAULT NULL,
  p_lng numeric DEFAULT NULL,
  p_accuracy numeric DEFAULT NULL,
  p_status text DEFAULT 'info',
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.partner_apk_workflow_events(
    actor_id, service_id, assignment_id, event_type, platform, app_variant,
    is_native, lat, lng, accuracy, status, payload
  )
  VALUES (
    v_actor, p_service_id, p_assignment_id, left(coalesce(p_event_type, 'unknown'), 120),
    left(coalesce(p_platform, 'unknown'), 40), left(coalesce(p_app_variant, 'partner'), 40),
    coalesce(p_is_native, false), p_lat, p_lng, p_accuracy,
    left(coalesce(p_status, 'info'), 40), coalesce(p_payload, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_partner_apk_workflow_event(text, uuid, uuid, text, text, boolean, numeric, numeric, numeric, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_partner_apk_workflow_event(text, uuid, uuid, text, text, boolean, numeric, numeric, numeric, text, jsonb) TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'partner_apk_workflow_events'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_apk_workflow_events;
  END IF;
END $$;
