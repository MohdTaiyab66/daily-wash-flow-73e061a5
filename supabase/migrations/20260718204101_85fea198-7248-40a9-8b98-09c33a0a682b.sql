
-- ------------ Timing + sequence columns -------------------------------------
ALTER TABLE public.pipeline_events
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS sequence_no integer,
  ADD COLUMN IF NOT EXISTS subscription_id uuid,
  ADD COLUMN IF NOT EXISTS assignment_id uuid,
  ADD COLUMN IF NOT EXISTS partner_id uuid;

-- ------------ Enhanced logger (backward-compatible signature) ---------------
CREATE OR REPLACE FUNCTION public.ds_log_event(
  p_booking_id uuid,
  p_stage      text,
  p_source     text,
  p_actor      text,
  p_row_id     uuid   DEFAULT NULL,
  p_status     text   DEFAULT 'ok',
  p_payload    jsonb  DEFAULT '{}'::jsonb,
  p_error      text   DEFAULT NULL,
  p_duration_ms integer DEFAULT NULL,
  p_subscription_id uuid DEFAULT NULL,
  p_assignment_id   uuid DEFAULT NULL,
  p_partner_id      uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_seq integer;
  v_halt boolean := false;
BEGIN
  -- Cutover gate: if divergence was flagged, refuse further NEW logs for this booking.
  IF p_source = 'new' AND p_booking_id IS NOT NULL THEN
    SELECT divergence_detected INTO v_halt
      FROM public.pipeline_state WHERE booking_id = p_booking_id;
    IF COALESCE(v_halt, false) THEN
      RETURN NULL;  -- silently skip; legacy remains authoritative
    END IF;
  END IF;

  SELECT COALESCE(MAX(sequence_no),0)+1 INTO v_seq
    FROM public.pipeline_events WHERE booking_id = p_booking_id;

  INSERT INTO public.pipeline_events
    (booking_id,stage,source,actor,row_id,status,payload,error_message,
     duration_ms,sequence_no,subscription_id,assignment_id,partner_id)
  VALUES
    (p_booking_id,p_stage,p_source,p_actor,p_row_id,p_status,
     COALESCE(p_payload,'{}'::jsonb),p_error,
     p_duration_ms,v_seq,p_subscription_id,p_assignment_id,p_partner_id)
  RETURNING id INTO v_id;

  IF p_source = 'new' AND p_booking_id IS NOT NULL THEN
    INSERT INTO public.pipeline_state(booking_id,current_stage,reached_stages)
    VALUES (p_booking_id,p_stage,ARRAY[p_stage])
    ON CONFLICT (booking_id) DO UPDATE
      SET current_stage=EXCLUDED.current_stage,
          reached_stages=(SELECT ARRAY(SELECT DISTINCT unnest(public.pipeline_state.reached_stages || EXCLUDED.reached_stages))),
          updated_at=now();
  END IF;
  RETURN v_id;
END;$$;

-- ------------ Divergence detector -------------------------------------------
-- Called every event: if same stage exists from the OTHER source > 60s ago
-- with no counterpart, mark divergence and halt new logging.
CREATE OR REPLACE FUNCTION public.ds_check_divergence(p_booking_id uuid, p_stage text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_legacy_at timestamptz;
  v_new_at    timestamptz;
  v_reason    text;
BEGIN
  SELECT max(occurred_at) FILTER (WHERE source='legacy'),
         max(occurred_at) FILTER (WHERE source='new')
    INTO v_legacy_at, v_new_at
    FROM public.pipeline_events
    WHERE booking_id = p_booking_id AND stage = p_stage;

  IF v_legacy_at IS NOT NULL AND v_new_at IS NULL AND v_legacy_at < now() - interval '60 seconds' THEN
    v_reason := format('stage %s present in legacy but missing in new after 60s', p_stage);
  ELSIF v_new_at IS NOT NULL AND v_legacy_at IS NULL AND v_new_at < now() - interval '60 seconds' THEN
    v_reason := format('stage %s present in new but missing in legacy after 60s', p_stage);
  ELSE
    RETURN false;
  END IF;

  UPDATE public.pipeline_state
     SET divergence_detected = true,
         divergence_reason = COALESCE(divergence_reason, v_reason),
         last_compared_at = now(),
         updated_at = now()
   WHERE booking_id = p_booking_id
     AND divergence_detected = false;
  RETURN true;
END;$$;

-- ------------ Additional legacy mirrors -------------------------------------
CREATE OR REPLACE FUNCTION public.mirror_legacy_subscription() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_booking uuid;
BEGIN
  BEGIN v_booking := NEW.booking_id; EXCEPTION WHEN undefined_column THEN v_booking := NULL; END;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.ds_log_event(v_booking,'subscription_activated','legacy','trg_mirror_subscriptions',
      NEW.id,'ok',to_jsonb(NEW),NULL,NULL,NEW.id,NULL,NULL);
  END IF;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_mirror_subscriptions ON public.subscriptions;
CREATE TRIGGER trg_mirror_subscriptions AFTER INSERT ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.mirror_legacy_subscription();

CREATE OR REPLACE FUNCTION public.mirror_legacy_service() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_booking uuid;
  v_completed boolean := false;
BEGIN
  BEGIN v_booking := NEW.booking_id; EXCEPTION WHEN undefined_column THEN v_booking := NULL; END;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.ds_log_event(v_booking,'service_generated','legacy','trg_mirror_services',
      NEW.id,'ok',to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    BEGIN
      v_completed := (OLD.status IS DISTINCT FROM NEW.status) AND NEW.status = 'completed';
    EXCEPTION WHEN undefined_column THEN v_completed := false; END;
    IF v_completed THEN
      PERFORM public.ds_log_event(v_booking,'service_completed','legacy','trg_mirror_services',
        NEW.id,'ok',to_jsonb(NEW));
    END IF;
  END IF;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_mirror_services ON public.services;
CREATE TRIGGER trg_mirror_services AFTER INSERT OR UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.mirror_legacy_service();

CREATE OR REPLACE FUNCTION public.mirror_legacy_assignment_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_booking uuid;
BEGIN
  BEGIN v_booking := NEW.booking_id; EXCEPTION WHEN undefined_column THEN v_booking := NULL; END;
  IF (OLD IS DISTINCT FROM NEW) THEN
    PERFORM public.ds_log_event(v_booking,'route_updated','legacy','trg_mirror_assignments_update',
      NEW.id,'ok',jsonb_build_object('old_status',OLD.status,'new_status',NEW.status),
      NULL,NULL,NULL,NEW.id,NEW.partner_id);
  END IF;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_mirror_assignments_update ON public.assignments;
CREATE TRIGGER trg_mirror_assignments_update AFTER UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.mirror_legacy_assignment_update();

-- ------------ Expanded comparison view --------------------------------------
DROP VIEW IF EXISTS public.v_pipeline_comparison;
CREATE VIEW public.v_pipeline_comparison AS
WITH stages AS (
  SELECT booking_id, stage,
    max(occurred_at) FILTER (WHERE source='legacy') AS legacy_at,
    max(occurred_at) FILTER (WHERE source='new')    AS new_at,
    max(duration_ms) FILTER (WHERE source='legacy') AS legacy_ms,
    max(duration_ms) FILTER (WHERE source='new')    AS new_ms,
    (array_agg(row_id) FILTER (WHERE source='legacy'))[1] AS legacy_row_id,
    (array_agg(row_id) FILTER (WHERE source='new'))[1]    AS new_row_id,
    (array_agg(actor)  FILTER (WHERE source='legacy'))[1] AS legacy_actor,
    (array_agg(actor)  FILTER (WHERE source='new'))[1]    AS new_actor,
    bool_or(status='error') AS any_error
  FROM public.pipeline_events
  WHERE booking_id IS NOT NULL
  GROUP BY booking_id, stage
)
SELECT s.*,
  EXTRACT(EPOCH FROM (new_at - legacy_at))*1000 AS delta_ms,
  CASE
    WHEN any_error                                        THEN 'DIVERGED'
    WHEN legacy_at IS NOT NULL AND new_at IS NULL         THEN 'LEGACY_ONLY'
    WHEN legacy_at IS NULL     AND new_at IS NOT NULL     THEN 'NEW_ONLY'
    WHEN legacy_at IS NOT NULL AND new_at IS NOT NULL     THEN 'MATCH'
    ELSE 'NONE'
  END AS status
FROM stages s;
GRANT SELECT ON public.v_pipeline_comparison TO authenticated;

-- ------------ Per-booking metrics view --------------------------------------
CREATE OR REPLACE VIEW public.v_pipeline_metrics AS
WITH legacy AS (
  SELECT booking_id,
         min(occurred_at) AS first_at,
         max(occurred_at) AS last_at,
         count(*) AS event_count
  FROM public.pipeline_events WHERE source='legacy' GROUP BY booking_id
),
new_p AS (
  SELECT booking_id,
         min(occurred_at) AS first_at,
         max(occurred_at) AS last_at,
         count(*) AS event_count
  FROM public.pipeline_events WHERE source='new' GROUP BY booking_id
),
slowest AS (
  SELECT DISTINCT ON (booking_id, source)
         booking_id, source, stage AS slowest_stage, duration_ms AS slowest_ms
  FROM public.pipeline_events
  WHERE duration_ms IS NOT NULL
  ORDER BY booking_id, source, duration_ms DESC
),
failure AS (
  SELECT DISTINCT ON (booking_id) booking_id, source AS failure_source,
         stage AS failure_stage, error_message
  FROM public.pipeline_events
  WHERE status='error'
  ORDER BY booking_id, occurred_at DESC
)
SELECT
  b.id AS booking_id,
  b.payment_status,
  b.status AS booking_status,
  b.created_at,
  EXTRACT(EPOCH FROM (l.last_at - l.first_at))*1000 AS legacy_total_ms,
  EXTRACT(EPOCH FROM (n.last_at - n.first_at))*1000 AS new_total_ms,
  l.event_count AS legacy_events,
  n.event_count AS new_events,
  (SELECT slowest_stage FROM slowest s WHERE s.booking_id=b.id AND s.source='legacy') AS legacy_slowest_stage,
  (SELECT slowest_ms    FROM slowest s WHERE s.booking_id=b.id AND s.source='legacy') AS legacy_slowest_ms,
  (SELECT slowest_stage FROM slowest s WHERE s.booking_id=b.id AND s.source='new')    AS new_slowest_stage,
  (SELECT slowest_ms    FROM slowest s WHERE s.booking_id=b.id AND s.source='new')    AS new_slowest_ms,
  f.failure_source,
  f.failure_stage,
  f.error_message,
  ps.divergence_detected,
  ps.divergence_reason
FROM public.bookings b
LEFT JOIN legacy l ON l.booking_id=b.id
LEFT JOIN new_p  n ON n.booking_id=b.id
LEFT JOIN failure f ON f.booking_id=b.id
LEFT JOIN public.pipeline_state ps ON ps.booking_id=b.id;
GRANT SELECT ON public.v_pipeline_metrics TO authenticated;

-- ------------ Validation scorecard (cutover gate) ---------------------------
CREATE OR REPLACE VIEW public.v_pipeline_validation_scorecard AS
WITH cmp AS (
  SELECT booking_id,
         count(*) FILTER (WHERE status='MATCH')       AS matches,
         count(*) FILTER (WHERE status='LEGACY_ONLY') AS legacy_only,
         count(*) FILTER (WHERE status='NEW_ONLY')    AS new_only,
         count(*) FILTER (WHERE status='DIVERGED')    AS diverged,
         count(*)                                     AS total_stages
  FROM public.v_pipeline_comparison
  GROUP BY booking_id
)
SELECT
  count(*)                                                            AS bookings_observed,
  count(*) FILTER (WHERE diverged=0 AND legacy_only=0 AND new_only=0) AS fully_matched,
  count(*) FILTER (WHERE diverged>0)                                  AS diverged,
  count(*) FILTER (WHERE legacy_only>0)                               AS legacy_only,
  count(*) FILTER (WHERE new_only>0)                                  AS new_only,
  ROUND(100.0 * count(*) FILTER (WHERE diverged=0 AND legacy_only=0 AND new_only=0)
              / NULLIF(count(*),0), 2)                                AS match_rate_pct
FROM cmp;
GRANT SELECT ON public.v_pipeline_validation_scorecard TO authenticated;
