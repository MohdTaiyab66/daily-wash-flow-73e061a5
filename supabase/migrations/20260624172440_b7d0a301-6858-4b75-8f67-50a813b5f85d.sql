
-- ============= Settings =============
INSERT INTO public.platform_settings(key, value) VALUES
  ('auto_assign_enabled', 'true'::jsonb),
  ('auto_assign_timeout_sec', '90'::jsonb),
  ('auto_assign_radius_steps', '[2,5,10,15]'::jsonb),
  ('auto_assign_max_per_partner', '30'::jsonb),
  ('auto_assign_min_per_partner', '0'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============= Partner columns =============
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS max_daily_cars int NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS accepting_new boolean NOT NULL DEFAULT true;

-- ============= Queue =============
CREATE TABLE IF NOT EXISTS public.subscription_assignment_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  area text,
  lat numeric,
  lng numeric,
  service_required_before text,
  vehicle_category text,
  status text NOT NULL DEFAULT 'awaiting',
  assigned_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  current_offer_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  offer_expires_at timestamptz,
  radius_km int NOT NULL DEFAULT 0,
  tried_partner_ids uuid[] NOT NULL DEFAULT '{}',
  attempts_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_assignment_queue TO authenticated;
GRANT ALL ON public.subscription_assignment_queue TO service_role;
ALTER TABLE public.subscription_assignment_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "queue: customer or partner or admin can read"
  ON public.subscription_assignment_queue FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR current_offer_partner_id = auth.uid()
    OR assigned_partner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "queue: admin manage"
  ON public.subscription_assignment_queue FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_queue_updated_at ON public.subscription_assignment_queue;
CREATE TRIGGER trg_queue_updated_at BEFORE UPDATE ON public.subscription_assignment_queue
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============= Offers =============
CREATE TABLE IF NOT EXISTS public.subscription_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.subscription_assignment_queue(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'priority', -- priority | area | city
  offered_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  response text NOT NULL DEFAULT 'pending', -- pending | accepted | declined | timeout | superseded
  responded_at timestamptz,
  distance_m int,
  projected_extra_earnings numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offers_partner_pending
  ON public.subscription_offers(partner_id) WHERE response = 'pending';
CREATE INDEX IF NOT EXISTS idx_offers_queue ON public.subscription_offers(queue_id);

GRANT SELECT, INSERT, UPDATE ON public.subscription_offers TO authenticated;
GRANT ALL ON public.subscription_offers TO service_role;
ALTER TABLE public.subscription_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "offers: partner or admin read"
  ON public.subscription_offers FOR SELECT TO authenticated
  USING (partner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "offers: admin manage"
  ON public.subscription_offers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============= Helper: pick best partner =============
CREATE OR REPLACE FUNCTION public.pick_next_partner_for_queue(p_queue_id uuid, p_scope text DEFAULT 'priority', p_radius_km numeric DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  q public.subscription_assignment_queue%ROWTYPE;
  v_max_cap int;
  v_partner uuid;
BEGIN
  SELECT * INTO q FROM public.subscription_assignment_queue WHERE id = p_queue_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE((value::text)::int, 30) INTO v_max_cap
    FROM public.platform_settings WHERE key='auto_assign_max_per_partner';

  WITH eligible AS (
    SELECT p.id,
           p.rating,
           p.max_daily_cars,
           COALESCE((
             SELECT count(*) FROM public.services s
             WHERE s.partner_id = p.id AND s.scheduled_date = CURRENT_DATE
           ), 0) AS today_load,
           COALESCE(public.haversine_km(p.home_lat, p.home_lng, q.lat, q.lng), 999) AS dist_km
    FROM public.partners p
    WHERE p.status = 'active'::partner_status
      AND COALESCE(p.accepting_new, true) = true
      AND NOT (p.id = ANY(q.tried_partner_ids))
      AND (
        p_scope = 'priority' AND lower(trim(coalesce(p.home_area,''))) = lower(trim(coalesce(q.area,'')))
        OR p_scope IN ('area','city')
      )
      AND (p_radius_km IS NULL OR COALESCE(public.haversine_km(p.home_lat, p.home_lng, q.lat, q.lng), 999) <= p_radius_km)
  )
  SELECT id INTO v_partner FROM eligible
  WHERE today_load < LEAST(max_daily_cars, v_max_cap)
  ORDER BY dist_km ASC, rating DESC NULLS LAST, today_load ASC
  LIMIT 1;

  RETURN v_partner;
END $$;

-- ============= Offer next partner =============
CREATE OR REPLACE FUNCTION public.offer_next_for_queue(p_queue_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  q public.subscription_assignment_queue%ROWTYPE;
  v_partner uuid;
  v_timeout int;
  v_steps jsonb;
  v_offer uuid;
  v_dist numeric;
  v_enabled boolean;
BEGIN
  SELECT COALESCE((value::text)::boolean, true) INTO v_enabled FROM public.platform_settings WHERE key='auto_assign_enabled';
  IF NOT v_enabled THEN RETURN NULL; END IF;

  SELECT * INTO q FROM public.subscription_assignment_queue WHERE id = p_queue_id;
  IF NOT FOUND OR q.status IN ('assigned','failed') THEN RETURN NULL; END IF;

  SELECT COALESCE((value::text)::int, 90) INTO v_timeout FROM public.platform_settings WHERE key='auto_assign_timeout_sec';
  SELECT value INTO v_steps FROM public.platform_settings WHERE key='auto_assign_radius_steps';

  -- Try priority (home_area match) first
  v_partner := public.pick_next_partner_for_queue(p_queue_id, 'priority', NULL);

  IF v_partner IS NULL THEN
    -- Try city broadcast with increasing radius steps
    DECLARE step numeric;
    BEGIN
      FOR step IN SELECT (jsonb_array_elements_text(coalesce(v_steps,'[2,5,10,15]'::jsonb)))::numeric LOOP
        IF step <= q.radius_km THEN CONTINUE; END IF;
        v_partner := public.pick_next_partner_for_queue(p_queue_id, 'city', step);
        IF v_partner IS NOT NULL THEN
          UPDATE public.subscription_assignment_queue SET radius_km = step WHERE id = p_queue_id;
          EXIT;
        END IF;
      END LOOP;
    END;
  END IF;

  IF v_partner IS NULL THEN
    UPDATE public.subscription_assignment_queue
      SET status = 'failed', current_offer_partner_id = NULL, offer_expires_at = NULL
      WHERE id = p_queue_id;
    RETURN NULL;
  END IF;

  v_dist := COALESCE(public.haversine_km(
    (SELECT home_lat FROM public.partners WHERE id = v_partner),
    (SELECT home_lng FROM public.partners WHERE id = v_partner),
    q.lat, q.lng), 0);

  INSERT INTO public.subscription_offers(queue_id, partner_id, scope, expires_at, distance_m, projected_extra_earnings)
  VALUES (p_queue_id, v_partner, CASE WHEN q.radius_km = 0 THEN 'priority' ELSE 'city' END,
          now() + (v_timeout || ' seconds')::interval,
          (v_dist * 1000)::int, 17 * 30)
  RETURNING id INTO v_offer;

  UPDATE public.subscription_assignment_queue
    SET status = 'offered',
        current_offer_partner_id = v_partner,
        offer_expires_at = now() + (v_timeout || ' seconds')::interval,
        tried_partner_ids = array_append(tried_partner_ids, v_partner)
    WHERE id = p_queue_id;

  INSERT INTO public.partner_notifications(partner_id, type, title, body, link, metadata)
  VALUES (v_partner, 'daily_shine_offer',
          'New Daily Shine Customer Available',
          'Area ' || COALESCE(q.area,'(nearby)') || ' · ~' || round(v_dist,1) || ' km away · Tap to accept within ' || v_timeout || 's',
          '/app/assignments',
          jsonb_build_object('queue_id', p_queue_id, 'offer_id', v_offer, 'booking_id', q.booking_id));

  RETURN v_offer;
END $$;

GRANT EXECUTE ON FUNCTION public.offer_next_for_queue(uuid) TO authenticated;

-- ============= Enqueue =============
CREATE OR REPLACE FUNCTION public.enqueue_subscription_booking(p_booking_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_queue uuid;
  v_book record;
BEGIN
  SELECT b.id, b.user_id, b.vehicle_id, b.address_id, b.preferred_before_time,
         sc.service_type, sc.slug,
         ca.area, ca.latitude AS lat, ca.longitude AS lng,
         cv.category AS vehicle_category
    INTO v_book
    FROM public.bookings b
    JOIN public.service_catalog sc ON sc.id = b.service_id
    LEFT JOIN public.customer_addresses ca ON ca.id = b.address_id
    LEFT JOIN public.customer_vehicles cv ON cv.id = b.vehicle_id
    WHERE b.id = p_booking_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_book.service_type <> 'subscription' THEN RETURN NULL; END IF;

  INSERT INTO public.subscription_assignment_queue
    (booking_id, customer_id, area, lat, lng, service_required_before, vehicle_category, status)
  VALUES (v_book.id, v_book.user_id, v_book.area, v_book.lat, v_book.lng,
          v_book.preferred_before_time, v_book.vehicle_category, 'awaiting')
  ON CONFLICT (booking_id) DO NOTHING
  RETURNING id INTO v_queue;

  IF v_queue IS NULL THEN
    SELECT id INTO v_queue FROM public.subscription_assignment_queue WHERE booking_id = p_booking_id;
  END IF;

  PERFORM public.offer_next_for_queue(v_queue);
  RETURN v_queue;
END $$;

GRANT EXECUTE ON FUNCTION public.enqueue_subscription_booking(uuid) TO authenticated;

-- Trigger: when payment becomes 'paid' on a subscription booking, enqueue
CREATE OR REPLACE FUNCTION public.tg_enqueue_subscription_on_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_type text;
BEGIN
  IF NEW.payment_status = 'paid'
     AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
    SELECT service_type INTO v_type FROM public.service_catalog WHERE id = NEW.service_id;
    IF v_type = 'subscription' THEN
      PERFORM public.enqueue_subscription_booking(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bookings_enqueue_subscription ON public.bookings;
CREATE TRIGGER trg_bookings_enqueue_subscription
AFTER INSERT OR UPDATE OF payment_status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_subscription_on_paid();

-- ============= Respond to offer =============
CREATE OR REPLACE FUNCTION public.respond_subscription_offer(p_offer_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_offer public.subscription_offers%ROWTYPE;
  q public.subscription_assignment_queue%ROWTYPE;
  v_assignment uuid;
  v_service_id uuid;
  v_seq int;
  v_book record;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_offer FROM public.subscription_offers WHERE id = p_offer_id;
  IF NOT FOUND OR v_offer.partner_id <> v_partner THEN RAISE EXCEPTION 'Offer not found'; END IF;
  IF v_offer.response <> 'pending' THEN RAISE EXCEPTION 'Offer already %', v_offer.response; END IF;

  SELECT * INTO q FROM public.subscription_assignment_queue WHERE id = v_offer.queue_id FOR UPDATE;
  IF q.status = 'assigned' THEN RAISE EXCEPTION 'Already assigned'; END IF;

  IF NOT p_accept THEN
    UPDATE public.subscription_offers SET response='declined', responded_at=now() WHERE id = p_offer_id;
    -- next partner
    PERFORM public.offer_next_for_queue(q.id);
    RETURN jsonb_build_object('ok', true, 'accepted', false);
  END IF;

  -- Accept
  SELECT b.id AS booking_id, b.vehicle_id, b.scheduled_date, b.preferred_before_time, b.user_id
    INTO v_book FROM public.bookings b WHERE b.id = q.booking_id;

  -- ensure an active assignment for partner today
  SELECT id INTO v_assignment FROM public.assignments
   WHERE partner_id = v_partner AND status='active' AND end_date >= CURRENT_DATE
   ORDER BY start_date DESC LIMIT 1;

  IF v_assignment IS NULL THEN
    INSERT INTO public.assignments
      (partner_id, area, target_cars, status, rate_per_car, scheduled_date,
       duration_days, start_date, end_date, working_days, expected_start_time, estimated_earnings, estimated_hours, estimated_distance_km, search_radius_km, total_earnings)
    VALUES (v_partner, COALESCE(q.area,'Auto'), 1, 'active', 17, CURRENT_DATE, 30, CURRENT_DATE, CURRENT_DATE + 29, 26, '07:00', 17, 0.5, 0, 0, 17*26)
    RETURNING id INTO v_assignment;
  END IF;

  SELECT COALESCE(max(sequence_no),0)+1 INTO v_seq
    FROM public.services WHERE assignment_id = v_assignment AND scheduled_date = COALESCE(v_book.scheduled_date, CURRENT_DATE);

  INSERT INTO public.services
    (partner_id, customer_id, vehicle_id, assignment_id, scheduled_date, time_slot, sequence_no, rate_per_car, status)
  VALUES (v_partner, v_book.user_id, v_book.vehicle_id, v_assignment,
          COALESCE(v_book.scheduled_date, CURRENT_DATE),
          COALESCE(v_book.preferred_before_time, '07:00'),
          v_seq, 17, 'pending')
  RETURNING id INTO v_service_id;

  UPDATE public.bookings
    SET ops_service_id = v_service_id, status='active', claimed_partner_id=v_partner, claimed_at=now(), updated_at=now()
    WHERE id = q.booking_id;

  UPDATE public.subscription_offers SET response='accepted', responded_at=now() WHERE id = p_offer_id;
  -- supersede any other pending offers for this queue
  UPDATE public.subscription_offers SET response='superseded' WHERE queue_id = q.id AND response='pending' AND id <> p_offer_id;

  UPDATE public.subscription_assignment_queue
    SET status='assigned', assigned_partner_id=v_partner, current_offer_partner_id=NULL, offer_expires_at=NULL
    WHERE id = q.id;

  -- Re-sequence today by time_slot for this partner
  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY time_slot NULLS LAST, created_at) AS rn
    FROM public.services WHERE assignment_id = v_assignment AND scheduled_date = COALESCE(v_book.scheduled_date, CURRENT_DATE)
  )
  UPDATE public.services s SET sequence_no = ranked.rn FROM ranked WHERE s.id = ranked.id;

  RETURN jsonb_build_object('ok', true, 'accepted', true, 'service_id', v_service_id, 'assignment_id', v_assignment);
END $$;

GRANT EXECUTE ON FUNCTION public.respond_subscription_offer(uuid, boolean) TO authenticated;

-- ============= Sweep expired offers =============
CREATE OR REPLACE FUNCTION public.sweep_subscription_offers()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT * FROM public.subscription_offers
           WHERE response='pending' AND expires_at < now()
  LOOP
    UPDATE public.subscription_offers SET response='timeout', responded_at=now() WHERE id = r.id;
    PERFORM public.offer_next_for_queue(r.queue_id);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

GRANT EXECUTE ON FUNCTION public.sweep_subscription_offers() TO authenticated, anon;

-- ============= Realtime =============
ALTER PUBLICATION supabase_realtime ADD TABLE public.subscription_assignment_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subscription_offers;
