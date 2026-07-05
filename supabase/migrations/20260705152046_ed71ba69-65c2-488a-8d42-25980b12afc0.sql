
-- =========================================================
-- 1. category columns on existing notification tables
-- =========================================================
ALTER TABLE public.partner_notifications
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'system';
ALTER TABLE public.customer_notifications
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'system';

-- Backfill sensible categories from existing `type` values
UPDATE public.partner_notifications SET category =
  CASE
    WHEN type = 'daily_shine_offer' THEN 'daily_shine'
    WHEN type IN ('new_assignments','assignment_released','assignment_cancelled','partner_assigned') THEN 'assignments'
    WHEN type IN ('offer_expired','dar_event','dar') THEN 'dar'
    WHEN type IN ('payout_released','wallet_credit','wallet_debit') THEN 'wallet'
    ELSE 'system'
  END
WHERE category = 'system';

UPDATE public.customer_notifications SET category =
  CASE
    WHEN type = 'partner_assigned' THEN 'assignments'
    WHEN type LIKE 'booking%' THEN 'bookings'
    WHEN type LIKE 'payment%' THEN 'payments'
    ELSE 'system'
  END
WHERE category = 'system';

-- =========================================================
-- 2. admin_notifications
-- =========================================================
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'bookings',
  title text NOT NULL,
  body text,
  link text,
  subject_type text,
  subject_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  pushed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view all admin notifications" ON public.admin_notifications;
CREATE POLICY "Admins view all admin notifications"
  ON public.admin_notifications FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins mark admin notifications" ON public.admin_notifications;
CREATE POLICY "Admins mark admin notifications"
  ON public.admin_notifications FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS admin_notifications_created_idx
  ON public.admin_notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_notifications_category_idx
  ON public.admin_notifications (category, created_at DESC);

-- =========================================================
-- 3. Realtime
-- =========================================================
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.partner_notifications;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_notifications;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- =========================================================
-- 4. Trigger: notify admin on every new booking
-- =========================================================
CREATE OR REPLACE FUNCTION public.tg_bookings_admin_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_name text;
  v_slug text;
  v_svc_name text;
  v_area text;
  v_veh text;
  v_category text;
  v_link text;
BEGIN
  SELECT service_type, slug, name INTO v_type, v_slug, v_svc_name
    FROM public.service_catalog WHERE id = NEW.service_id;

  SELECT COALESCE(cp.full_name, c.full_name, 'Customer')
    INTO v_name
  FROM public.customer_profiles cp
  FULL OUTER JOIN public.customers c ON c.id = cp.user_id
  WHERE cp.user_id = NEW.user_id OR c.id = NEW.user_id
  LIMIT 1;

  SELECT area INTO v_area FROM public.customer_addresses WHERE id = NEW.address_id;
  SELECT COALESCE(make || ' ' || model, 'Vehicle') INTO v_veh
    FROM public.customer_vehicles WHERE id = NEW.vehicle_id;

  IF v_type = 'subscription' THEN
    v_category := 'daily_shine';
    v_link := '/admin/marketplace';
  ELSIF v_slug LIKE '%deep%' THEN
    v_category := 'premium';
    v_link := '/admin/service/' || NEW.id::text;
  ELSE
    v_category := 'premium';
    v_link := '/admin/service/' || NEW.id::text;
  END IF;

  INSERT INTO public.admin_notifications(category, title, body, link, subject_type, subject_id, metadata)
  VALUES (
    v_category,
    'New ' || COALESCE(v_svc_name, 'booking'),
    COALESCE(v_name,'Customer') || ' • ' || COALESCE(v_area,'Area') || ' • ' || COALESCE(v_veh,'Vehicle') || ' • ₹' || COALESCE(NEW.total_amount, 0),
    v_link,
    'booking',
    NEW.id,
    jsonb_build_object(
      'booking_id', NEW.id,
      'service_slug', v_slug,
      'service_type', v_type,
      'user_id', NEW.user_id,
      'amount', NEW.total_amount,
      'area', v_area,
      'vehicle', v_veh,
      'customer_name', v_name
    )
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bookings_admin_notify ON public.bookings;
CREATE TRIGGER trg_bookings_admin_notify
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_bookings_admin_notify();

-- =========================================================
-- 5. Patch offer_next_for_queue notification link + category
-- =========================================================
CREATE OR REPLACE FUNCTION public.offer_next_for_queue(p_queue_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q public.subscription_assignment_queue%ROWTYPE;
  v_pick record;
  v_timeout int;
  v_steps jsonb;
  v_offer uuid;
  v_enabled boolean;
  v_rate numeric := 17;
BEGIN
  SELECT COALESCE((value::text)::boolean, true) INTO v_enabled FROM public.platform_settings WHERE key='auto_assign_enabled';
  IF NOT v_enabled THEN RETURN NULL; END IF;

  SELECT * INTO q FROM public.subscription_assignment_queue WHERE id = p_queue_id;
  IF NOT FOUND OR q.status IN ('assigned','failed') THEN RETURN NULL; END IF;

  IF q.locked_partner_id IS NOT NULL AND q.lock_until IS NOT NULL AND q.lock_until >= CURRENT_DATE THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE((value::text)::int, 90) INTO v_timeout FROM public.platform_settings WHERE key='auto_assign_timeout_sec';
  SELECT value INTO v_steps FROM public.platform_settings WHERE key='auto_assign_radius_steps';

  SELECT * INTO v_pick FROM public.pick_scored_partner_for_queue(p_queue_id, 'priority', NULL) LIMIT 1;

  IF v_pick.partner_id IS NULL THEN
    DECLARE step numeric;
    BEGIN
      FOR step IN SELECT (jsonb_array_elements_text(coalesce(v_steps,'[2,5,10,15]'::jsonb)))::numeric LOOP
        IF step <= q.radius_km THEN CONTINUE; END IF;
        SELECT * INTO v_pick FROM public.pick_scored_partner_for_queue(p_queue_id, 'city', step) LIMIT 1;
        IF v_pick.partner_id IS NOT NULL THEN
          UPDATE public.subscription_assignment_queue SET radius_km = step WHERE id = p_queue_id;
          EXIT;
        END IF;
      END LOOP;
    END;
  END IF;

  IF v_pick.partner_id IS NULL THEN
    UPDATE public.subscription_assignment_queue
      SET status = 'failed', current_offer_partner_id = NULL, offer_expires_at = NULL
      WHERE id = p_queue_id;
    RETURN NULL;
  END IF;

  INSERT INTO public.subscription_offers(
    queue_id, partner_id, scope, expires_at,
    distance_m, projected_extra_earnings,
    route_delta_seconds, distance_from_route_m,
    extra_per_day_paise, extra_per_month_paise,
    score, score_breakdown
  )
  VALUES (
    p_queue_id, v_pick.partner_id,
    CASE WHEN q.radius_km = 0 THEN 'priority' ELSE 'city' END,
    now() + (v_timeout || ' seconds')::interval,
    (v_pick.dist_km * 1000)::int, v_rate * 30,
    v_pick.route_delta_sec, v_pick.distance_from_route_m,
    (v_rate * 100)::int, (v_rate * 30 * 100)::int,
    v_pick.score, v_pick.score_breakdown
  )
  RETURNING id INTO v_offer;

  UPDATE public.subscription_assignment_queue
    SET status = 'offered',
        current_offer_partner_id = v_pick.partner_id,
        offer_expires_at = now() + (v_timeout || ' seconds')::interval,
        tried_partner_ids = array_append(tried_partner_ids, v_pick.partner_id)
    WHERE id = p_queue_id;

  INSERT INTO public.partner_notifications(partner_id, type, category, title, body, link, metadata)
  VALUES (v_pick.partner_id, 'daily_shine_offer', 'daily_shine',
          'New Daily Shine Customer',
          'Area ' || COALESCE(q.area,'(nearby)') || ' · +' || round((v_pick.route_delta_sec/60.0)::numeric,0) || ' min · +₹' || (v_rate*30)::int || '/mo',
          '/app/leads/' || v_offer::text,
          jsonb_build_object('queue_id', p_queue_id, 'offer_id', v_offer, 'booking_id', q.booking_id, 'type','offer'));

  RETURN v_offer;
END $$;

-- =========================================================
-- 6. get_offer_details_by_id (Lead Details page)
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_offer_details_by_id(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_partner uuid;
BEGIN
  SELECT partner_id INTO v_partner FROM public.subscription_offers WHERE id = p_offer_id;
  IF v_partner IS NULL THEN RETURN NULL; END IF;
  IF NOT (auth.uid() = v_partner OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT to_jsonb(o) || jsonb_build_object(
    'subscription_assignment_queue', to_jsonb(q) || jsonb_build_object(
      'bookings', to_jsonb(b) || jsonb_build_object(
        'customer_vehicles', to_jsonb(cv),
        'customer_addresses', to_jsonb(ca)
      )
    ),
    '_customer_name', COALESCE(cp.full_name, c.full_name)
  )
  INTO v_result
  FROM public.subscription_offers o
  JOIN public.subscription_assignment_queue q ON q.id = o.queue_id
  LEFT JOIN public.bookings b ON b.id = q.booking_id
  LEFT JOIN public.customer_vehicles cv ON cv.id = b.vehicle_id
  LEFT JOIN public.customer_addresses ca ON ca.id = b.address_id
  LEFT JOIN public.customer_profiles cp ON cp.user_id = q.customer_id
  LEFT JOIN public.customers c ON c.id = q.customer_id
  WHERE o.id = p_offer_id;

  RETURN v_result;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_offer_details_by_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_offer_details_by_id(uuid) TO authenticated, service_role;

-- =========================================================
-- 7. Notify partner + admin on successful accept
-- =========================================================
CREATE OR REPLACE FUNCTION public.respond_subscription_offer(p_offer_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_offer public.subscription_offers%ROWTYPE;
  q public.subscription_assignment_queue%ROWTYPE;
  v_assignment uuid;
  v_service_id uuid;
  v_seq int;
  v_book record;
  v_partner_name text;
  v_customer_name text;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_offer FROM public.subscription_offers WHERE id = p_offer_id;
  IF NOT FOUND OR v_offer.partner_id <> v_partner THEN RAISE EXCEPTION 'Offer not found'; END IF;
  IF v_offer.response <> 'pending' THEN RAISE EXCEPTION 'Offer already %', v_offer.response; END IF;

  SELECT * INTO q FROM public.subscription_assignment_queue WHERE id = v_offer.queue_id FOR UPDATE;
  IF q.status = 'assigned' THEN RAISE EXCEPTION 'Already assigned'; END IF;

  IF NOT p_accept THEN
    UPDATE public.subscription_offers SET response='declined', responded_at=now() WHERE id = p_offer_id;
    UPDATE public.subscription_assignment_queue
      SET status='awaiting', current_offer_partner_id=NULL, offer_expires_at=NULL
      WHERE id=q.id;
    INSERT INTO public.partner_notifications(partner_id, type, category, title, body, link, metadata)
    VALUES (v_partner, 'offer_declined', 'dar', 'Lead declined',
            'You declined the Daily Shine lead in ' || COALESCE(q.area,'your area'),
            '/app/notifications', jsonb_build_object('offer_id', p_offer_id, 'queue_id', q.id));
    PERFORM public.offer_next_for_queue(q.id);
    RETURN jsonb_build_object('ok', true, 'accepted', false);
  END IF;

  SELECT b.id AS booking_id, b.vehicle_id, b.scheduled_date, b.preferred_before_time, b.user_id, b.total_amount
    INTO v_book FROM public.bookings b WHERE b.id = q.booking_id;
  PERFORM public.ensure_ops_customer_for_booking(q.booking_id);

  SELECT id INTO v_assignment FROM public.assignments
   WHERE partner_id = v_partner AND status='active' AND end_date >= CURRENT_DATE
   ORDER BY start_date DESC LIMIT 1;

  IF v_assignment IS NULL THEN
    INSERT INTO public.assignments
      (partner_id, area, target_cars, status, rate_per_car, scheduled_date,
       duration_days, start_date, end_date, working_days, expected_start_time, estimated_earnings, estimated_hours, estimated_distance_km, search_radius_km, total_earnings)
    VALUES (v_partner, COALESCE(q.area,'Auto'), 1, 'active', 17, CURRENT_DATE, 30, CURRENT_DATE, CURRENT_DATE + 29, 26, '07:00', 17, 0.5, 0, 0, 17*26)
    RETURNING id INTO v_assignment;
  ELSE
    UPDATE public.assignments
      SET target_cars = target_cars + 1,
          total_earnings = COALESCE(total_earnings, 0) + (17 * 26),
          estimated_earnings = COALESCE(estimated_earnings, 0) + 17
      WHERE id = v_assignment;
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
    SET ops_service_id = v_service_id, status='active', partner_id=v_partner, claimed_at=now(), updated_at=now()
    WHERE id = q.booking_id;

  UPDATE public.subscription_offers SET response='accepted', responded_at=now() WHERE id = p_offer_id;
  UPDATE public.subscription_offers SET response='superseded' WHERE queue_id = q.id AND response='pending' AND id <> p_offer_id;

  UPDATE public.subscription_assignment_queue
    SET status='assigned', assigned_partner_id=v_partner, current_offer_partner_id=NULL, offer_expires_at=NULL
    WHERE id = q.id;

  UPDATE public.subscriptions
    SET status='assigned', assigned_partner_id=v_partner, assigned_at=now(), service_start_date=COALESCE(v_book.scheduled_date, CURRENT_DATE), updated_at=now()
    WHERE booking_id = q.booking_id;

  PERFORM public.generate_services_for_queue(q.id);

  SELECT full_name INTO v_partner_name FROM public.partners WHERE id = v_partner;
  SELECT COALESCE(cp.full_name, c.full_name)
    INTO v_customer_name
    FROM public.customer_profiles cp
    FULL OUTER JOIN public.customers c ON c.id = cp.user_id
    WHERE cp.user_id = v_book.user_id OR c.id = v_book.user_id
    LIMIT 1;

  -- Customer notification
  INSERT INTO public.customer_notifications(user_id, type, category, title, body, link, metadata)
  VALUES (
    v_book.user_id, 'partner_assigned', 'assignments',
    'Your Urban Wash Partner has been assigned',
    COALESCE(v_partner_name, 'Your partner') || ' will start your Daily Shine service on ' || COALESCE(v_book.scheduled_date, CURRENT_DATE)::text || '.',
    '/c/subscriptions',
    jsonb_build_object('booking_id', q.booking_id, 'partner_id', v_partner, 'assignment_id', v_assignment, 'service_id', v_service_id)
  );

  -- Partner notification (added to route)
  INSERT INTO public.partner_notifications(partner_id, type, category, title, body, link, metadata)
  VALUES (
    v_partner, 'new_assignments', 'assignments',
    'New customer added to your route',
    COALESCE(v_customer_name,'Customer') || ' • ' || COALESCE(q.area,'Area'),
    '/app/my-assignment',
    jsonb_build_object('booking_id', q.booking_id, 'assignment_id', v_assignment, 'service_id', v_service_id)
  );

  -- Admin notification
  INSERT INTO public.admin_notifications(category, title, body, link, subject_type, subject_id, metadata)
  VALUES (
    'assignments',
    'Daily Shine assignment accepted',
    COALESCE(v_partner_name,'Partner') || ' accepted ' || COALESCE(v_customer_name,'a customer') || ' in ' || COALESCE(q.area,'the area'),
    '/admin/live',
    'assignment', v_assignment,
    jsonb_build_object('booking_id', q.booking_id, 'partner_id', v_partner, 'customer_id', v_book.user_id)
  );

  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY time_slot NULLS LAST, created_at) AS rn
    FROM public.services WHERE assignment_id = v_assignment AND scheduled_date = COALESCE(v_book.scheduled_date, CURRENT_DATE)
  )
  UPDATE public.services s SET sequence_no = ranked.rn FROM ranked WHERE s.id = ranked.id;

  RETURN jsonb_build_object('ok', true, 'accepted', true, 'service_id', v_service_id, 'assignment_id', v_assignment);
END $$;

-- =========================================================
-- 8. get_admin_user_ids helper (idempotent)
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_admin_user_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin'::app_role;
$$;
GRANT EXECUTE ON FUNCTION public.get_admin_user_ids() TO authenticated, service_role;
