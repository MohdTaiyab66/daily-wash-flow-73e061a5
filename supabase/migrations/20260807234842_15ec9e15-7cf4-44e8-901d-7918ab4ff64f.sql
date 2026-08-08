-- 1. Per-partner retry metadata for a queue (decline cooldown, last offered)
CREATE TABLE IF NOT EXISTS public.subscription_offer_partner_state (
  queue_id uuid NOT NULL REFERENCES public.subscription_assignment_queue(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL,
  declined_at timestamptz,
  next_retry_at timestamptz,
  last_offered_at timestamptz,
  offers_sent int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (queue_id, partner_id)
);

GRANT SELECT ON public.subscription_offer_partner_state TO authenticated;
GRANT ALL ON public.subscription_offer_partner_state TO service_role;

ALTER TABLE public.subscription_offer_partner_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner reads own offer state" ON public.subscription_offer_partner_state;
CREATE POLICY "partner reads own offer state"
  ON public.subscription_offer_partner_state FOR SELECT TO authenticated
  USING (partner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_sops_retry ON public.subscription_offer_partner_state (queue_id, next_retry_at);

-- 2. Decline -> 15 minute per-partner cooldown, immediate retry for others
CREATE OR REPLACE FUNCTION public.tg_offer_decline_cooldown()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.response = 'declined' AND COALESCE(OLD.response,'') <> 'declined' THEN
    INSERT INTO public.subscription_offer_partner_state (queue_id, partner_id, declined_at, next_retry_at)
    VALUES (NEW.queue_id, NEW.partner_id, now(), now() + interval '15 minutes')
    ON CONFLICT (queue_id, partner_id) DO UPDATE
      SET declined_at = now(),
          next_retry_at = now() + interval '15 minutes',
          updated_at = now();

    -- Other eligible partners must get it on the very next tick.
    UPDATE public.subscription_assignment_queue
       SET next_retry_at = now(), updated_at = now()
     WHERE id = NEW.queue_id
       AND status NOT IN ('assigned','cancelled');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_offer_decline_cooldown ON public.subscription_offers;
CREATE TRIGGER trg_offer_decline_cooldown
AFTER UPDATE OF response ON public.subscription_offers
FOR EACH ROW EXECUTE FUNCTION public.tg_offer_decline_cooldown();

-- 3. Eligibility: ignore = no penalty, decline = 15 min cooldown
CREATE OR REPLACE FUNCTION public.pick_scored_partner_for_queue(p_queue_id uuid, p_scope text DEFAULT 'priority'::text, p_radius_km numeric DEFAULT NULL::numeric)
 RETURNS TABLE(partner_id uuid, dist_km numeric, route_delta_sec integer, distance_from_route_m integer, score numeric, score_breakdown jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q public.subscription_assignment_queue%ROWTYPE;
  v_max_cap int;
  v_radius numeric;
  v_deadline_min int;
  v_now_min int;
  v_urgency numeric;
  v_heartbeat_min int;
BEGIN
  SELECT * INTO q FROM public.subscription_assignment_queue WHERE id = p_queue_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE((value::text)::int, 30) INTO v_max_cap
    FROM public.platform_settings WHERE key='auto_assign_max_per_partner';
  SELECT COALESCE((value::text)::int, 3) INTO v_heartbeat_min
    FROM public.platform_settings WHERE key='partner_heartbeat_minutes';
  v_radius := COALESCE(p_radius_km, 15);

  v_deadline_min := COALESCE(
    NULLIF(regexp_replace(COALESCE(q.service_required_before,''), '^.*?(\d{1,2}).*$', '\1'), '')::int * 60,
    8 * 60
  );
  v_now_min := EXTRACT(hour FROM now() AT TIME ZONE 'Asia/Kolkata')::int * 60
             + EXTRACT(minute FROM now() AT TIME ZONE 'Asia/Kolkata')::int;
  v_urgency := CASE
    WHEN v_deadline_min - v_now_min <= 120 THEN 1.0
    WHEN v_deadline_min - v_now_min <= 360 THEN 0.6
    ELSE 0.3
  END;

  RETURN QUERY
  WITH eligible AS (
    SELECT p.id AS pid,
           COALESCE(p.rating, 4.5) AS rating,
           p.max_daily_cars,
           COALESCE((
             SELECT count(*) FROM public.services s
             WHERE s.partner_id = p.id AND s.scheduled_date = CURRENT_DATE
           ), 0) AS today_load,
           CASE
             WHEN q.lat IS NULL OR q.lng IS NULL OR p.home_lat IS NULL OR p.home_lng IS NULL THEN 0::numeric
             ELSE COALESCE(public.haversine_km(p.home_lat, p.home_lng, q.lat, q.lng), 0)
           END AS d_km,
           CASE WHEN lower(trim(coalesce(p.home_area,''))) = lower(trim(coalesce(q.area,''))) THEN 1 ELSE 0 END AS same_area,
           COALESCE(st.next_retry_at, to_timestamp(0)) AS cooldown_until
    FROM public.partners p
    LEFT JOIN public.subscription_offer_partner_state st
      ON st.queue_id = q.id AND st.partner_id = p.id
    WHERE p.status = 'active'::public.partner_status
      AND COALESCE(p.accepting_new, true) = true
      AND p.availability = 'online'::public.availability_status
      AND p.last_seen IS NOT NULL
      AND p.last_seen > now() - (v_heartbeat_min || ' minutes')::interval
      -- Declined: hidden for that partner only, until next_retry_at passes.
      -- Ignored: no penalty, immediately eligible again on the next retry.
      AND (st.next_retry_at IS NULL OR st.next_retry_at <= now())
      -- Never double-offer while the partner still holds a live offer.
      AND NOT EXISTS (
        SELECT 1 FROM public.subscription_offers o2
        WHERE o2.partner_id = p.id
          AND o2.response = 'pending'
          AND o2.expires_at > now()
      )
      AND (
        (p_scope = 'priority' AND lower(trim(coalesce(p.home_area,''))) = lower(trim(coalesce(q.area,''))))
        OR p_scope IN ('area','city')
      )
      AND (
        p_radius_km IS NULL
        OR q.lat IS NULL OR q.lng IS NULL OR p.home_lat IS NULL OR p.home_lng IS NULL
        OR COALESCE(public.haversine_km(p.home_lat, p.home_lng, q.lat, q.lng), 999) <= p_radius_km
      )
  ),
  scored AS (
    SELECT
      pid, d_km,
      CASE WHEN d_km = 0 THEN 8 * 60 ELSE (d_km * 2 * 60)::int END AS r_delta_sec,
      CASE WHEN d_km = 0 THEN 150 ELSE (d_km * 1000)::int END AS d_from_route_m,
      today_load, max_daily_cars, rating, same_area,
      GREATEST(0, LEAST(1, 1 - (d_km * 2) / 20.0)) AS s_route,
      GREATEST(0, LEAST(1, CASE WHEN d_km = 0 THEN 0.9 ELSE 1 - d_km / GREATEST(v_radius, 0.1) END)) AS s_prox,
      GREATEST(0, LEAST(1, rating / 5.0)) AS s_rel,
      GREATEST(0, LEAST(1, 1 - today_load::numeric / GREATEST(max_daily_cars, 1))) AS s_cap,
      v_urgency AS s_urg
    FROM eligible
    WHERE today_load < LEAST(max_daily_cars, v_max_cap)
  )
  SELECT
    pid, d_km, r_delta_sec, d_from_route_m,
    (0.45*s_route + 0.20*s_prox + 0.15*s_rel + 0.10*s_cap + 0.10*s_urg)::numeric,
    jsonb_build_object(
      'route', round(s_route::numeric, 3),
      'proximity', round(s_prox::numeric, 3),
      'reliability', round(s_rel::numeric, 3),
      'capacity', round(s_cap::numeric, 3),
      'urgency', round(s_urg::numeric, 3),
      'same_area', same_area,
      'route_delta_min', round((r_delta_sec/60.0)::numeric, 1),
      'today_load', today_load,
      'max_daily_cars', max_daily_cars,
      'rating', rating
    )
  FROM scored
  ORDER BY same_area DESC, 5 DESC, d_km ASC
  LIMIT 1;
END $function$;

-- 4. Retry forever on a 1-minute cadence; never give up while the lead is live
CREATE OR REPLACE FUNCTION public.offer_next_for_queue(p_queue_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q public.subscription_assignment_queue%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_pick record;
  v_timeout int;
  v_steps jsonb;
  v_offer uuid;
  v_existing_pending uuid;
  v_existing_terminal uuid;
  v_enabled boolean;
  v_rate numeric := 17;
  v_body text;
  v_link text;
BEGIN
  SELECT COALESCE((value::text)::boolean, true) INTO v_enabled
    FROM public.platform_settings WHERE key='auto_assign_enabled';
  IF NOT COALESCE(v_enabled, true) THEN RETURN NULL; END IF;

  SELECT * INTO q FROM public.subscription_assignment_queue
   WHERE id = p_queue_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF q.status IN ('assigned','cancelled','failed_no_partner') THEN RETURN NULL; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = q.booking_id FOR SHARE;
  IF NOT FOUND OR v_booking.payment_status <> 'paid' OR v_booking.status IN ('cancelled','failed') THEN
    UPDATE public.subscription_assignment_queue
       SET status = CASE WHEN v_booking.id IS NULL OR v_booking.status IN ('cancelled','failed') THEN 'cancelled' ELSE status END,
           current_offer_partner_id = NULL, offer_expires_at = NULL, next_retry_at = NULL, updated_at = now()
     WHERE id = q.id;
    RETURN NULL;
  END IF;

  -- Idempotent: a live pending offer means this retry cycle already fired.
  SELECT id INTO v_existing_pending FROM public.subscription_offers
   WHERE queue_id = q.id AND response = 'pending' AND expires_at > now()
   ORDER BY created_at DESC, id DESC LIMIT 1;
  IF v_existing_pending IS NOT NULL THEN RETURN v_existing_pending; END IF;

  SELECT id INTO v_existing_terminal FROM public.subscription_offers
   WHERE queue_id = q.id AND response = 'accepted'
   ORDER BY responded_at DESC NULLS LAST, created_at DESC LIMIT 1;
  IF v_existing_terminal IS NOT NULL THEN
    UPDATE public.subscription_assignment_queue
       SET status='assigned', current_offer_partner_id=NULL, offer_expires_at=NULL, next_retry_at=NULL, updated_at=now()
     WHERE id = q.id;
    RETURN NULL;
  END IF;

  UPDATE public.subscription_assignment_queue
     SET status='processing', current_offer_partner_id=NULL, offer_expires_at=NULL, next_retry_at=NULL, updated_at=now()
   WHERE id = q.id;

  SELECT COALESCE((value::text)::int, 60) INTO v_timeout FROM public.platform_settings WHERE key='auto_assign_timeout_sec';
  SELECT value INTO v_steps FROM public.platform_settings WHERE key='auto_assign_radius_steps';

  SELECT * INTO v_pick FROM public.pick_scored_partner_for_queue(q.id, 'priority', NULL) LIMIT 1;

  IF v_pick.partner_id IS NULL THEN
    DECLARE step numeric;
    BEGIN
      FOR step IN SELECT (jsonb_array_elements_text(coalesce(v_steps,'[2,5,10,15]'::jsonb)))::numeric LOOP
        IF step <= q.radius_km THEN CONTINUE; END IF;
        SELECT * INTO v_pick FROM public.pick_scored_partner_for_queue(q.id, 'city', step) LIMIT 1;
        IF v_pick.partner_id IS NOT NULL THEN
          UPDATE public.subscription_assignment_queue SET radius_km = step, updated_at = now() WHERE id = q.id;
          EXIT;
        END IF;
      END LOOP;
    END;
  END IF;

  -- No eligible partner right now: park for 1 minute and try again. Never fail.
  IF v_pick.partner_id IS NULL THEN
    UPDATE public.subscription_assignment_queue
       SET status='waiting_for_partner', current_offer_partner_id=NULL, offer_expires_at=NULL,
           next_retry_at = now() + interval '1 minute',
           attempts_log = COALESCE(attempts_log,'[]'::jsonb) || jsonb_build_object('event','waiting_no_partner','at',now()),
           updated_at = now()
     WHERE id = q.id;
    RETURN NULL;
  END IF;

  BEGIN
    INSERT INTO public.subscription_offers(
      queue_id, partner_id, scope, expires_at,
      distance_m, projected_extra_earnings,
      route_delta_seconds, distance_from_route_m,
      extra_per_day_paise, extra_per_month_paise,
      score, score_breakdown)
    VALUES (
      q.id, v_pick.partner_id,
      CASE WHEN q.radius_km = 0 THEN 'priority' ELSE 'city' END,
      now() + (v_timeout || ' seconds')::interval,
      (v_pick.dist_km * 1000)::int, v_rate * 30,
      v_pick.route_delta_sec, v_pick.distance_from_route_m,
      (v_rate * 100)::int, (v_rate * 30 * 100)::int,
      v_pick.score,
      COALESCE(v_pick.score_breakdown, '{}'::jsonb) || jsonb_build_object('created_by','offer_next_for_queue','queue_id',q.id,'booking_id',q.booking_id))
    RETURNING id INTO v_offer;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_offer FROM public.subscription_offers
     WHERE queue_id = q.id AND response='pending'
     ORDER BY created_at DESC, id DESC LIMIT 1;
    RETURN v_offer;
  END;

  INSERT INTO public.subscription_offer_partner_state (queue_id, partner_id, last_offered_at, offers_sent)
  VALUES (q.id, v_pick.partner_id, now(), 1)
  ON CONFLICT (queue_id, partner_id) DO UPDATE
    SET last_offered_at = now(),
        offers_sent = public.subscription_offer_partner_state.offers_sent + 1,
        updated_at = now();

  UPDATE public.subscription_assignment_queue
     SET status='offered',
         current_offer_partner_id=v_pick.partner_id,
         offer_expires_at = now() + (v_timeout || ' seconds')::interval,
         next_retry_at=NULL,
         tried_partner_ids = CASE
           WHEN v_pick.partner_id = ANY(COALESCE(tried_partner_ids, ARRAY[]::uuid[])) THEN tried_partner_ids
           ELSE array_append(COALESCE(tried_partner_ids, ARRAY[]::uuid[]), v_pick.partner_id)
         END,
         attempts_log = COALESCE(attempts_log,'[]'::jsonb) || jsonb_build_object('event','offer_created','at',now(),'offer_id',v_offer,'partner_id',v_pick.partner_id),
         updated_at = now()
   WHERE id = q.id;

  v_body := 'Area ' || COALESCE(q.area,'(nearby)') || ' · +' || round((v_pick.route_delta_sec/60.0)::numeric,0) || ' min · +₹' || (v_rate*30)::int || '/mo';
  v_link := '/app/leads/' || v_offer::text;

  UPDATE public.partner_notifications
     SET title = 'New Daily Shine Customer',
         body = v_body,
         link = v_link,
         metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
           'queue_id', q.id, 'offer_id', v_offer, 'booking_id', q.booking_id,
           'type','offer','created_by','offer_next_for_queue'),
         read_at = NULL,
         pushed_at = NULL,
         created_at = now()
   WHERE partner_id = v_pick.partner_id
     AND type = 'daily_shine_offer'
     AND (metadata->>'booking_id') = q.booking_id::text;

  IF NOT FOUND THEN
    INSERT INTO public.partner_notifications(partner_id, type, category, title, body, link, metadata)
    VALUES (v_pick.partner_id, 'daily_shine_offer', 'daily_shine',
            'New Daily Shine Customer', v_body, v_link,
            jsonb_build_object('queue_id', q.id, 'offer_id', v_offer, 'booking_id', q.booking_id,
                               'type','offer','created_by','offer_next_for_queue'))
    ON CONFLICT ((metadata->>'offer_id'))
    WHERE type = 'daily_shine_offer' AND metadata ? 'offer_id'
    DO NOTHING;
  END IF;

  RETURN v_offer;
END;
$function$;

-- 5. Sweep: expire timed-out offers, retry parked queues, recover stuck ones
CREATE OR REPLACE FUNCTION public.sweep_subscription_offers()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT o.id, o.queue_id
    FROM public.subscription_offers o
    JOIN public.subscription_assignment_queue q ON q.id = o.queue_id
    JOIN public.bookings b ON b.id = q.booking_id
    WHERE o.response = 'pending'
      AND o.expires_at <= now()
      AND q.status NOT IN ('assigned','cancelled','failed_no_partner')
      AND b.payment_status = 'paid'
      AND b.status NOT IN ('cancelled','failed')
    ORDER BY o.expires_at ASC
    LIMIT 100
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    -- Ignoring an offer carries no penalty: no cooldown row is written here.
    UPDATE public.subscription_offers
       SET response = 'timeout', responded_at = COALESCE(responded_at, now())
     WHERE id = r.id
       AND response = 'pending';

    UPDATE public.offer_delivery_events
       SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('expired_by','sweep_subscription_offers')
     WHERE offer_id = r.id
       AND stage = 'created';

    PERFORM public.offer_next_for_queue(r.queue_id);
    n := n + 1;
  END LOOP;

  FOR r IN
    SELECT q.id
    FROM public.subscription_assignment_queue q
    JOIN public.bookings b ON b.id = q.booking_id
    WHERE (
        (q.status = 'waiting_for_partner' AND (q.next_retry_at IS NULL OR q.next_retry_at <= now()))
        -- Crash/lock recovery: a queue must never stay parked mid-flight.
        OR (q.status IN ('processing','offered') AND q.updated_at < now() - interval '3 minutes')
      )
      AND b.payment_status = 'paid'
      AND b.status NOT IN ('cancelled','failed')
      AND NOT EXISTS (
        SELECT 1 FROM public.subscription_offers o
        WHERE o.queue_id = q.id
          AND (o.response = 'accepted'
               OR (o.response = 'pending' AND o.expires_at > now()))
      )
    ORDER BY q.created_at ASC
    LIMIT 50
    FOR UPDATE OF q SKIP LOCKED
  LOOP
    PERFORM public.offer_next_for_queue(r.id);
    n := n + 1;
  END LOOP;

  RETURN n;
END;
$function$;