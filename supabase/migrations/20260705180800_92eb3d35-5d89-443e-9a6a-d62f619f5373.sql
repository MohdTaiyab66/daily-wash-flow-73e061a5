
CREATE TABLE IF NOT EXISTS public.marketplace_settings (
  id                        boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  base_incentive            numeric NOT NULL DEFAULT 17,
  round_increments          numeric[] NOT NULL DEFAULT ARRAY[1,2,2]::numeric[],
  max_incentive             numeric NOT NULL DEFAULT 22,
  round_duration_sec        integer NOT NULL DEFAULT 90,
  max_rounds                integer NOT NULL DEFAULT 4,
  broadcast_enabled         boolean NOT NULL DEFAULT true,
  expand_radius_enabled     boolean NOT NULL DEFAULT true,
  radius_per_round_m        integer[] NOT NULL DEFAULT ARRAY[0,2000,5000,8000]::integer[],
  neighbour_polygon_expansion boolean NOT NULL DEFAULT true,
  auto_assign_final_round   boolean NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.marketplace_settings TO authenticated;
GRANT ALL ON public.marketplace_settings TO service_role;
ALTER TABLE public.marketplace_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mp_settings read" ON public.marketplace_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "mp_settings admin write" ON public.marketplace_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.marketplace_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.marketplace_broadcasts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id     uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  booking_id          uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  customer_id         uuid NOT NULL,
  vehicle_id          uuid,
  service_area_id     uuid REFERENCES public.coverage_zones(id) ON DELETE SET NULL,
  customer_lat        numeric,
  customer_lng        numeric,
  status              text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','assigned','expired','admin_alert','cancelled')),
  current_round       integer NOT NULL DEFAULT 1,
  current_incentive   numeric NOT NULL DEFAULT 17,
  current_radius_m    integer NOT NULL DEFAULT 0,
  round_started_at    timestamptz NOT NULL DEFAULT now(),
  round_expires_at    timestamptz NOT NULL DEFAULT (now() + interval '90 seconds'),
  winning_partner_id  uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  assignment_id       uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_broadcast_open_sub
  ON public.marketplace_broadcasts(subscription_id)
  WHERE status IN ('open','assigned');
CREATE INDEX IF NOT EXISTS idx_mp_broadcast_open_expires
  ON public.marketplace_broadcasts(round_expires_at) WHERE status='open';
GRANT SELECT ON public.marketplace_broadcasts TO authenticated;
GRANT ALL ON public.marketplace_broadcasts TO service_role;
ALTER TABLE public.marketplace_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mp_bcast admin all" ON public.marketplace_broadcasts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "mp_bcast customer read own" ON public.marketplace_broadcasts FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.marketplace_offers (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id             uuid NOT NULL REFERENCES public.marketplace_broadcasts(id) ON DELETE CASCADE,
  partner_id               uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  round                    integer NOT NULL DEFAULT 1,
  incentive                numeric NOT NULL,
  distance_from_route_m    integer,
  route_impact_m           integer,
  sent_at                  timestamptz NOT NULL DEFAULT now(),
  viewed_at                timestamptz,
  response                 text NOT NULL DEFAULT 'pending'
                           CHECK (response IN ('pending','accepted','declined','superseded','expired')),
  responded_at             timestamptz,
  UNIQUE (broadcast_id, partner_id, round)
);
CREATE INDEX IF NOT EXISTS idx_mp_offers_partner_pending
  ON public.marketplace_offers(partner_id) WHERE response='pending';
CREATE INDEX IF NOT EXISTS idx_mp_offers_broadcast_round
  ON public.marketplace_offers(broadcast_id, round);
GRANT SELECT, UPDATE ON public.marketplace_offers TO authenticated;
GRANT ALL ON public.marketplace_offers TO service_role;
ALTER TABLE public.marketplace_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mp_offers admin all" ON public.marketplace_offers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "mp_offers partner read own" ON public.marketplace_offers FOR SELECT TO authenticated
  USING (partner_id = auth.uid());

CREATE POLICY "mp_bcast partner read via offer" ON public.marketplace_broadcasts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.marketplace_offers o
                 WHERE o.broadcast_id = marketplace_broadcasts.id AND o.partner_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.marketplace_round_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id   uuid NOT NULL REFERENCES public.marketplace_broadcasts(id) ON DELETE CASCADE,
  round          integer NOT NULL,
  incentive      numeric NOT NULL,
  radius_m       integer NOT NULL,
  offers_sent    integer NOT NULL DEFAULT 0,
  reason         text,
  started_at     timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz
);
GRANT SELECT ON public.marketplace_round_history TO authenticated;
GRANT ALL ON public.marketplace_round_history TO service_role;
ALTER TABLE public.marketplace_round_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mp_hist admin read" ON public.marketplace_round_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS trg_mp_settings_updated ON public.marketplace_settings;
CREATE TRIGGER trg_mp_settings_updated BEFORE UPDATE ON public.marketplace_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_mp_broadcast_updated ON public.marketplace_broadcasts;
CREATE TRIGGER trg_mp_broadcast_updated BEFORE UPDATE ON public.marketplace_broadcasts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.mp_haversine_m(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE WHEN lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN NULL
    ELSE 6371000 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1)/2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lng2 - lng1)/2), 2)
    )) END
$$;

CREATE OR REPLACE FUNCTION public.mp_eligible_partners(
  p_broadcast_id uuid,
  p_radius_m integer,
  p_include_neighbours boolean DEFAULT false
) RETURNS TABLE (
  partner_id uuid,
  distance_m numeric,
  today_cars integer,
  remaining_capacity integer
) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_lat numeric; v_lng numeric; v_zone uuid;
BEGIN
  SELECT customer_lat, customer_lng, service_area_id
    INTO v_lat, v_lng, v_zone
  FROM public.marketplace_broadcasts WHERE id = p_broadcast_id;

  RETURN QUERY
  WITH base AS (
    SELECT p.id AS partner_id,
           public.mp_haversine_m(v_lat, v_lng, p.current_lat, p.current_lng) AS distance_m,
           COALESCE(a.fulfilled_cars,0) AS today_cars,
           GREATEST(0, COALESCE(a.target_cars,0) - COALESCE(a.fulfilled_cars,0)) AS remaining_capacity
    FROM public.partners p
    LEFT JOIN LATERAL (
      SELECT * FROM public.assignments aa
      WHERE aa.partner_id = p.id AND aa.status='active'
        AND CURRENT_DATE BETWEEN aa.start_date AND aa.end_date
      ORDER BY aa.start_date DESC LIMIT 1
    ) a ON true
    WHERE p.status = 'active'
      AND p.availability = 'online'
      AND COALESCE(p.accepting_new, true) = true
      AND a.id IS NOT NULL
  )
  SELECT b.partner_id, b.distance_m, b.today_cars, b.remaining_capacity
  FROM base b
  LEFT JOIN public.coverage_zones z ON z.id = v_zone
  WHERE b.remaining_capacity > 0
    AND (
      p_radius_m <= 0
      OR b.distance_m IS NULL
      OR b.distance_m <= p_radius_m
      OR (p_include_neighbours AND z.neighbour_expand)
    )
  ORDER BY b.distance_m NULLS LAST, b.today_cars ASC, b.remaining_capacity DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.mp_eligible_partners(uuid,integer,boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mp_open_broadcast(p_subscription_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  s         record;
  cfg       public.marketplace_settings%ROWTYPE;
  v_bcast   uuid;
  v_lat     numeric; v_lng numeric; v_zone uuid;
  v_addr    record;
  v_inserted integer;
BEGIN
  SELECT * INTO cfg FROM public.marketplace_settings WHERE id = true;
  IF NOT cfg.broadcast_enabled THEN RETURN NULL; END IF;

  SELECT * INTO s FROM public.subscriptions WHERE id = p_subscription_id;
  IF NOT FOUND OR s.plan_slug <> 'daily-shine' THEN RETURN NULL; END IF;

  SELECT ca.latitude AS lat, ca.longitude AS lng
    INTO v_addr
  FROM public.bookings b
  LEFT JOIN public.customer_addresses ca ON ca.id = b.address_id
  WHERE b.id = s.booking_id;
  v_lat := v_addr.lat; v_lng := v_addr.lng;
  IF v_lat IS NULL THEN
    SELECT latitude, longitude INTO v_lat, v_lng FROM public.customers WHERE id = s.customer_id;
  END IF;

  SELECT id INTO v_zone FROM public.coverage_zones
    WHERE status='active' AND daily_shine_enabled
      AND v_lat BETWEEN COALESCE(bbox_min_lat,-90) AND COALESCE(bbox_max_lat,90)
      AND v_lng BETWEEN COALESCE(bbox_min_lng,-180) AND COALESCE(bbox_max_lng,180)
    ORDER BY priority ASC LIMIT 1;

  INSERT INTO public.marketplace_broadcasts (
    subscription_id, booking_id, customer_id, vehicle_id, service_area_id,
    customer_lat, customer_lng,
    current_round, current_incentive, current_radius_m,
    round_started_at, round_expires_at
  ) VALUES (
    s.id, s.booking_id, s.customer_id, s.vehicle_id, v_zone,
    v_lat, v_lng,
    1, cfg.base_incentive, COALESCE(cfg.radius_per_round_m[1], 0),
    now(), now() + make_interval(secs => cfg.round_duration_sec)
  )
  ON CONFLICT (subscription_id) WHERE status IN ('open','assigned') DO NOTHING
  RETURNING id INTO v_bcast;

  IF v_bcast IS NULL THEN RETURN NULL; END IF;

  WITH picks AS (
    SELECT partner_id, distance_m
    FROM public.mp_eligible_partners(v_bcast, COALESCE(cfg.radius_per_round_m[1],0), false)
  ), ins AS (
    INSERT INTO public.marketplace_offers (broadcast_id, partner_id, round, incentive, distance_from_route_m)
    SELECT v_bcast, partner_id, 1, cfg.base_incentive, COALESCE(distance_m,0)::int FROM picks
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  INSERT INTO public.marketplace_round_history (broadcast_id, round, incentive, radius_m, offers_sent, reason)
  VALUES (v_bcast, 1, cfg.base_incentive, COALESCE(cfg.radius_per_round_m[1],0), COALESCE(v_inserted,0), 'initial');

  RETURN v_bcast;
END $$;
GRANT EXECUTE ON FUNCTION public.mp_open_broadcast(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mp_accept_offer(p_broadcast_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_offer   record;
  v_bcast   record;
  v_assign  uuid;
  v_updated int;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT o.* INTO v_offer FROM public.marketplace_offers o
    JOIN public.marketplace_broadcasts b ON b.id = o.broadcast_id
   WHERE o.broadcast_id = p_broadcast_id
     AND o.partner_id = v_partner
     AND o.response='pending'
     AND o.round = b.current_round;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason','no_pending_offer');
  END IF;

  UPDATE public.marketplace_broadcasts
     SET status='assigned', winning_partner_id = v_partner, updated_at = now()
   WHERE id = p_broadcast_id AND status='open'
  RETURNING * INTO v_bcast;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    UPDATE public.marketplace_offers SET response='superseded', responded_at=now()
      WHERE id = v_offer.id AND response='pending';
    RETURN jsonb_build_object('ok', false, 'reason','already_taken');
  END IF;

  SELECT id INTO v_assign FROM public.assignments
   WHERE partner_id = v_partner AND status='active'
     AND CURRENT_DATE BETWEEN start_date AND end_date
   ORDER BY start_date DESC LIMIT 1;

  UPDATE public.marketplace_broadcasts SET assignment_id = v_assign WHERE id = p_broadcast_id;

  UPDATE public.subscriptions
     SET assigned_partner_id = v_partner,
         assigned_at = now(),
         status = 'assigned',
         updated_at = now()
   WHERE id = v_bcast.subscription_id;

  UPDATE public.marketplace_offers SET response='accepted', responded_at=now()
    WHERE id = v_offer.id;
  UPDATE public.marketplace_offers SET response='superseded', responded_at=now()
    WHERE broadcast_id = p_broadcast_id AND response='pending' AND id <> v_offer.id;

  UPDATE public.marketplace_round_history SET ended_at = now()
    WHERE broadcast_id = p_broadcast_id AND ended_at IS NULL;

  RETURN jsonb_build_object(
    'ok', true, 'broadcast_id', p_broadcast_id,
    'assignment_id', v_assign, 'subscription_id', v_bcast.subscription_id,
    'incentive', v_offer.incentive, 'round', v_offer.round
  );
END $$;
GRANT EXECUTE ON FUNCTION public.mp_accept_offer(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mp_decline_offer(p_broadcast_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_updated int;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  UPDATE public.marketplace_offers
     SET response='declined', responded_at=now()
   WHERE broadcast_id = p_broadcast_id
     AND partner_id = v_partner
     AND response = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_updated > 0);
END $$;
GRANT EXECUTE ON FUNCTION public.mp_decline_offer(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mp_advance_round(p_broadcast_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  cfg       public.marketplace_settings%ROWTYPE;
  b         public.marketplace_broadcasts%ROWTYPE;
  next_round int;
  next_incentive numeric;
  next_radius int;
  include_neighbours boolean := false;
  v_inserted int;
  v_top uuid;
BEGIN
  SELECT * INTO cfg FROM public.marketplace_settings WHERE id=true;
  SELECT * INTO b FROM public.marketplace_broadcasts WHERE id = p_broadcast_id FOR UPDATE;
  IF NOT FOUND OR b.status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'reason','not_open');
  END IF;

  UPDATE public.marketplace_offers SET response='expired', responded_at=now()
    WHERE broadcast_id = p_broadcast_id AND round = b.current_round AND response='pending';
  UPDATE public.marketplace_round_history SET ended_at = now()
    WHERE broadcast_id = p_broadcast_id AND round = b.current_round AND ended_at IS NULL;

  next_round := b.current_round + 1;

  IF next_round > cfg.max_rounds THEN
    IF cfg.auto_assign_final_round THEN
      SELECT partner_id INTO v_top
      FROM public.mp_eligible_partners(p_broadcast_id,
                                       COALESCE(cfg.radius_per_round_m[array_length(cfg.radius_per_round_m,1)], 0),
                                       cfg.neighbour_polygon_expansion)
      LIMIT 1;
      IF v_top IS NOT NULL THEN
        INSERT INTO public.marketplace_offers (broadcast_id, partner_id, round, incentive)
        VALUES (p_broadcast_id, v_top, next_round, cfg.max_incentive)
        ON CONFLICT DO NOTHING;
        UPDATE public.marketplace_broadcasts
          SET current_round = next_round,
              current_incentive = cfg.max_incentive,
              current_radius_m = COALESCE(cfg.radius_per_round_m[array_length(cfg.radius_per_round_m,1)],0),
              round_started_at = now(),
              round_expires_at = now() + make_interval(secs => cfg.round_duration_sec)
          WHERE id = p_broadcast_id;
        RETURN jsonb_build_object('ok', true, 'auto_assigned_to', v_top);
      END IF;
    END IF;
    UPDATE public.marketplace_broadcasts SET status='admin_alert', updated_at=now() WHERE id = p_broadcast_id;
    INSERT INTO public.admin_alerts (alert_type, severity, message, meta)
    VALUES ('marketplace_unassigned','high',
            'Daily Shine broadcast reached final round without acceptance',
            jsonb_build_object('broadcast_id', p_broadcast_id, 'subscription_id', b.subscription_id));
    RETURN jsonb_build_object('ok', true, 'status','admin_alert');
  END IF;

  next_incentive := LEAST(
    cfg.max_incentive,
    cfg.base_incentive + COALESCE((
      SELECT sum(v) FROM unnest(cfg.round_increments[1:(next_round-1)]) v
    ), 0)
  );
  next_radius := COALESCE(cfg.radius_per_round_m[next_round], cfg.radius_per_round_m[array_length(cfg.radius_per_round_m,1)], 0);
  include_neighbours := cfg.neighbour_polygon_expansion AND next_round = cfg.max_rounds;

  UPDATE public.marketplace_broadcasts
    SET current_round = next_round,
        current_incentive = next_incentive,
        current_radius_m = next_radius,
        round_started_at = now(),
        round_expires_at = now() + make_interval(secs => cfg.round_duration_sec),
        updated_at = now()
    WHERE id = p_broadcast_id;

  WITH picks AS (
    SELECT partner_id, distance_m
    FROM public.mp_eligible_partners(p_broadcast_id, next_radius, include_neighbours)
  ), ins AS (
    INSERT INTO public.marketplace_offers (broadcast_id, partner_id, round, incentive, distance_from_route_m)
    SELECT p_broadcast_id, partner_id, next_round, next_incentive, COALESCE(distance_m,0)::int FROM picks
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  INSERT INTO public.marketplace_round_history (broadcast_id, round, incentive, radius_m, offers_sent, reason)
  VALUES (p_broadcast_id, next_round, next_incentive, next_radius, COALESCE(v_inserted,0),
          CASE WHEN v_inserted=0 THEN 'no_eligible_partners' ELSE 'timeout' END);

  RETURN jsonb_build_object('ok', true, 'round', next_round, 'incentive', next_incentive,
                            'radius_m', next_radius, 'offers_sent', COALESCE(v_inserted,0));
END $$;
GRANT EXECUTE ON FUNCTION public.mp_advance_round(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mp_tick()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.marketplace_broadcasts
           WHERE status='open' AND round_expires_at <= now()
           ORDER BY round_expires_at ASC LIMIT 100
  LOOP
    PERFORM public.mp_advance_round(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.mp_tick() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_mp_open_on_subscription_active()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.plan_slug = 'daily-shine'
     AND NEW.status IN ('active','awaiting_partner_assignment')
     AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.assigned_partner_id IS NULL
  THEN
    PERFORM public.mp_open_broadcast(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mp_open_on_sub_active ON public.subscriptions;
CREATE TRIGGER trg_mp_open_on_sub_active
  AFTER INSERT OR UPDATE OF status ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_mp_open_on_subscription_active();

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_broadcasts;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_offers;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.marketplace_broadcasts REPLICA IDENTITY FULL;
ALTER TABLE public.marketplace_offers REPLICA IDENTITY FULL;
