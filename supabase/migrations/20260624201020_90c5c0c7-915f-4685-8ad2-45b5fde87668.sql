-- Daily Shine end-to-end backend repair
-- Creates missing commercial tables and connects paid bookings to subscription assignment flow.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  vehicle_id uuid,
  plan_slug text NOT NULL DEFAULT 'daily-shine',
  status text NOT NULL DEFAULT 'awaiting_partner_assignment',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  renewal_date date NOT NULL,
  service_start_date date,
  assigned_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subscriptions: customer or admin can read" ON public.subscriptions;
CREATE POLICY "subscriptions: customer or admin can read"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "subscriptions: customer create own" ON public.subscriptions;
CREATE POLICY "subscriptions: customer create own"
  ON public.subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "subscriptions: admin manage" ON public.subscriptions;
CREATE POLICY "subscriptions: admin manage"
  ON public.subscriptions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'razorpay',
  provider_order_id text,
  provider_payment_id text,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'created',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments: customer or admin can read" ON public.payments;
CREATE POLICY "payments: customer or admin can read"
  ON public.payments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "payments: customer create own" ON public.payments;
CREATE POLICY "payments: customer create own"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "payments: admin manage" ON public.payments;
CREATE POLICY "payments: admin manage"
  ON public.payments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES public.payments(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'razorpay',
  event_type text NOT NULL,
  provider_order_id text,
  provider_payment_id text,
  signature text,
  amount numeric,
  status text NOT NULL DEFAULT 'received',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment tx: customer or admin can read" ON public.payment_transactions;
CREATE POLICY "payment tx: customer or admin can read"
  ON public.payment_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "payment tx: admin manage" ON public.payment_transactions;
CREATE POLICY "payment tx: admin manage"
  ON public.payment_transactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.customer_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_notifications TO authenticated;
GRANT ALL ON public.customer_notifications TO service_role;
ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customer notifications: own read" ON public.customer_notifications;
CREATE POLICY "customer notifications: own read"
  ON public.customer_notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "customer notifications: own update" ON public.customer_notifications;
CREATE POLICY "customer notifications: own update"
  ON public.customer_notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "customer notifications: admin create" ON public.customer_notifications;
CREATE POLICY "customer notifications: admin create"
  ON public.customer_notifications FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.unavailability_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  reason text NOT NULL,
  notes text,
  photo_path text,
  lat numeric,
  lng numeric,
  credited_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unavailability_reports TO authenticated;
GRANT ALL ON public.unavailability_reports TO service_role;
ALTER TABLE public.unavailability_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "unavailability: partner customer admin read" ON public.unavailability_reports;
CREATE POLICY "unavailability: partner customer admin read"
  ON public.unavailability_reports FOR SELECT TO authenticated
  USING (partner_id = auth.uid() OR customer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "unavailability: partner create own" ON public.unavailability_reports;
CREATE POLICY "unavailability: partner create own"
  ON public.unavailability_reports FOR INSERT TO authenticated
  WITH CHECK (partner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "unavailability: admin manage" ON public.unavailability_reports;
CREATE POLICY "unavailability: admin manage"
  ON public.unavailability_reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON public.subscriptions(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON public.payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_booking ON public.payment_transactions(booking_id);
CREATE INDEX IF NOT EXISTS idx_customer_notifications_user_created ON public.customer_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unavailability_reports_service ON public.unavailability_reports(service_id);

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.ensure_ops_customer_for_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record;
  p record;
  a record;
  cv record;
  v_name text;
  v_phone text;
BEGIN
  SELECT b.*, sc.slug AS service_slug, sc.name AS service_name
    INTO b
    FROM public.bookings b
    JOIN public.service_catalog sc ON sc.id = b.service_id
    WHERE b.id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  SELECT * INTO p FROM public.customer_profiles WHERE user_id = b.user_id LIMIT 1;
  SELECT * INTO a FROM public.customer_addresses WHERE id = b.address_id LIMIT 1;
  SELECT * INTO cv FROM public.customer_vehicles WHERE id = b.vehicle_id LIMIT 1;

  v_name := COALESCE(NULLIF(trim(p.full_name), ''), 'Urban Wash Customer');
  v_phone := COALESCE(NULLIF(trim(p.phone), ''), '0000000000');

  IF a.id IS NOT NULL THEN
    INSERT INTO public.customers (
      id, full_name, phone, email, address_line, area, city, pincode,
      latitude, longitude, subscription_plan, subscription_start, subscription_end,
      is_active, preferred_time, service_required_before, payment_status, paid_at, updated_at
    ) VALUES (
      b.user_id, v_name, v_phone, p.email, a.address_line, a.area, 'Lucknow', a.pincode,
      a.latitude, a.longitude, 'daily_shine_monthly'::subscription_plan,
      COALESCE(b.scheduled_date, CURRENT_DATE), COALESCE(b.scheduled_date, CURRENT_DATE) + 30,
      true, COALESCE(b.preferred_before_time, 'Before 8 AM'), COALESCE(b.preferred_before_time, 'Before 8 AM'),
      CASE WHEN b.payment_status = 'paid' THEN 'paid' ELSE 'pending' END,
      CASE WHEN b.payment_status = 'paid' THEN now() ELSE NULL END,
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      phone = EXCLUDED.phone,
      email = EXCLUDED.email,
      address_line = EXCLUDED.address_line,
      area = EXCLUDED.area,
      pincode = EXCLUDED.pincode,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      subscription_start = EXCLUDED.subscription_start,
      subscription_end = EXCLUDED.subscription_end,
      is_active = true,
      preferred_time = EXCLUDED.preferred_time,
      service_required_before = EXCLUDED.service_required_before,
      payment_status = EXCLUDED.payment_status,
      paid_at = COALESCE(public.customers.paid_at, EXCLUDED.paid_at),
      updated_at = now();
  END IF;

  IF cv.id IS NOT NULL THEN
    INSERT INTO public.vehicles (
      id, customer_id, make, model, registration_number, color, parking_notes, front_image_path, package_amount
    ) VALUES (
      cv.id, b.user_id, cv.make, cv.model, cv.registration_number, cv.color, cv.parking_notes, cv.image_path, b.total_amount::int
    )
    ON CONFLICT (id) DO UPDATE SET
      customer_id = EXCLUDED.customer_id,
      make = EXCLUDED.make,
      model = EXCLUDED.model,
      registration_number = EXCLUDED.registration_number,
      color = EXCLUDED.color,
      parking_notes = EXCLUDED.parking_notes,
      front_image_path = EXCLUDED.front_image_path,
      package_amount = EXCLUDED.package_amount;
  END IF;

  RETURN jsonb_build_object('customer_id', b.user_id, 'vehicle_id', b.vehicle_id);
END $$;
GRANT EXECUTE ON FUNCTION public.ensure_ops_customer_for_booking(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.activate_paid_booking(
  p_booking_id uuid,
  p_provider_order_id text DEFAULT NULL,
  p_provider_payment_id text DEFAULT NULL,
  p_signature text DEFAULT NULL,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  b record;
  v_subscription uuid;
  v_payment uuid;
  v_queue uuid;
BEGIN
  SELECT b.*, sc.slug AS service_slug, sc.service_type, sc.name AS service_name
    INTO b
    FROM public.bookings b
    JOIN public.service_catalog sc ON sc.id = b.service_id
    WHERE b.id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF v_user IS NOT NULL AND b.user_id <> v_user AND NOT public.has_role(v_user, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.ensure_ops_customer_for_booking(p_booking_id);

  INSERT INTO public.payments (
    booking_id, user_id, provider, provider_order_id, provider_payment_id, amount, currency, status, metadata
  ) VALUES (
    p_booking_id, b.user_id, 'razorpay', p_provider_order_id, p_provider_payment_id, b.total_amount, 'INR', 'captured',
    jsonb_build_object('service_slug', b.service_slug) || COALESCE(p_raw_payload, '{}'::jsonb)
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_payment;

  IF v_payment IS NULL THEN
    SELECT id INTO v_payment FROM public.payments
    WHERE booking_id = p_booking_id
    ORDER BY created_at DESC LIMIT 1;
    UPDATE public.payments
      SET status='captured', provider_order_id=COALESCE(p_provider_order_id, provider_order_id),
          provider_payment_id=COALESCE(p_provider_payment_id, provider_payment_id), updated_at=now()
      WHERE id = v_payment;
  END IF;

  INSERT INTO public.payment_transactions (
    payment_id, booking_id, user_id, provider, event_type, provider_order_id, provider_payment_id, signature, amount, status, raw_payload
  ) VALUES (
    v_payment, p_booking_id, b.user_id, 'razorpay', 'payment.captured', p_provider_order_id, p_provider_payment_id,
    p_signature, b.total_amount, 'success', COALESCE(p_raw_payload, '{}'::jsonb)
  );

  UPDATE public.bookings
    SET payment_status='paid', status=CASE WHEN b.service_type = 'subscription' THEN 'paid' ELSE 'paid' END,
        razorpay_order_id=COALESCE(p_provider_order_id, razorpay_order_id),
        razorpay_payment_id=COALESCE(p_provider_payment_id, razorpay_payment_id),
        updated_at=now()
    WHERE id = p_booking_id;

  IF b.service_type = 'subscription' THEN
    INSERT INTO public.subscriptions (
      booking_id, user_id, customer_id, vehicle_id, plan_slug, status, start_date, renewal_date, service_start_date, amount, currency
    ) VALUES (
      p_booking_id, b.user_id, b.user_id, b.vehicle_id, b.service_slug, 'awaiting_partner_assignment',
      COALESCE(b.scheduled_date, CURRENT_DATE), COALESCE(b.scheduled_date, CURRENT_DATE) + 30,
      COALESCE(b.scheduled_date, CURRENT_DATE), b.total_amount, 'INR'
    )
    ON CONFLICT (booking_id) DO UPDATE SET
      status = CASE WHEN public.subscriptions.status = 'assigned' THEN public.subscriptions.status ELSE 'awaiting_partner_assignment' END,
      start_date = EXCLUDED.start_date,
      renewal_date = EXCLUDED.renewal_date,
      service_start_date = EXCLUDED.service_start_date,
      amount = EXCLUDED.amount,
      updated_at = now()
    RETURNING id INTO v_subscription;

    SELECT public.enqueue_subscription_booking(p_booking_id) INTO v_queue;

    INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
    VALUES (
      b.user_id,
      'subscription_paid',
      'Daily Shine subscription active',
      'Your payment is complete. We are assigning your Urban Wash Partner now.',
      '/c/subscriptions',
      jsonb_build_object('booking_id', p_booking_id, 'subscription_id', v_subscription, 'queue_id', v_queue)
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'booking_id', p_booking_id, 'payment_id', v_payment, 'subscription_id', v_subscription, 'queue_id', v_queue);
END $$;
GRANT EXECUTE ON FUNCTION public.activate_paid_booking(uuid, text, text, text, jsonb) TO authenticated, service_role;

-- Trigger still enqueues any subscription booking once payment_status becomes paid.
CREATE OR REPLACE FUNCTION public.tg_enqueue_subscription_on_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_type text;
BEGIN
  IF NEW.payment_status = 'paid'
     AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
    SELECT service_type INTO v_type FROM public.service_catalog WHERE id = NEW.service_id;
    IF v_type = 'subscription' THEN
      PERFORM public.ensure_ops_customer_for_booking(NEW.id);
      PERFORM public.enqueue_subscription_booking(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Partner acceptance: fix wrong booking column and keep subscription/customer state in sync.
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
  v_partner_name text;
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

  SELECT full_name INTO v_partner_name FROM public.partners WHERE id = v_partner;
  INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
  VALUES (
    v_book.user_id,
    'partner_assigned',
    'Your Urban Wash Partner has been assigned',
    COALESCE(v_partner_name, 'Your partner') || ' will start your Daily Shine service on ' || COALESCE(v_book.scheduled_date, CURRENT_DATE)::text || '.',
    '/c/subscriptions',
    jsonb_build_object('booking_id', q.booking_id, 'partner_id', v_partner, 'assignment_id', v_assignment, 'service_id', v_service_id)
  );

  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY time_slot NULLS LAST, created_at) AS rn
    FROM public.services WHERE assignment_id = v_assignment AND scheduled_date = COALESCE(v_book.scheduled_date, CURRENT_DATE)
  )
  UPDATE public.services s SET sequence_no = ranked.rn FROM ranked WHERE s.id = ranked.id;

  RETURN jsonb_build_object('ok', true, 'accepted', true, 'service_id', v_service_id, 'assignment_id', v_assignment);
END $$;
GRANT EXECUTE ON FUNCTION public.respond_subscription_offer(uuid, boolean) TO authenticated;

-- Sync subscription assignment metadata when lock trigger runs after acceptance.
CREATE OR REPLACE FUNCTION public.trg_offer_accepted_lock()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_days int;
BEGIN
  IF NEW.response = 'accepted' AND OLD.response IS DISTINCT FROM NEW.response THEN
    SELECT COALESCE((value::text)::int, 15) INTO v_days FROM public.platform_settings WHERE key='assignment_lock_days';
    UPDATE public.subscription_assignment_queue
      SET locked_partner_id = NEW.partner_id,
          lock_until = now() + (v_days || ' days')::interval
      WHERE id = NEW.queue_id;
  END IF;
  RETURN NEW;
END $$;

-- Record unavailable reports in the dedicated table as well as services/wallet.
CREATE OR REPLACE FUNCTION public.submit_service_unavailable(p_service_id uuid, p_reason text, p_notes text, p_photo text, p_lat numeric, p_lng numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_credit numeric;
  v_balance numeric;
  v_assignment uuid;
  v_customer uuid;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT COALESCE((value::text)::numeric, 12) INTO v_credit FROM public.platform_settings WHERE key = 'unavailable_compensation';

  UPDATE public.services
  SET status = 'unavailable',
      unavailable_reason = p_reason::unavailable_reason,
      unavailable_notes = NULLIF(p_notes, ''),
      unavailable_photo = p_photo,
      unavailable_lat = NULLIF(p_lat, 0),
      unavailable_lng = NULLIF(p_lng, 0),
      completed_at = now(),
      updated_at = now()
  WHERE id = p_service_id
    AND partner_id = v_partner
    AND status IN ('pending', 'in_progress', 'unavailable')
  RETURNING assignment_id, customer_id INTO v_assignment, v_customer;

  IF v_assignment IS NULL THEN RAISE EXCEPTION 'Service not found or already completed'; END IF;

  SELECT COALESCE((SELECT balance_after FROM public.wallet_ledger WHERE partner_id = v_partner ORDER BY created_at DESC LIMIT 1), 0) + v_credit INTO v_balance;
  INSERT INTO public.wallet_ledger(partner_id, entry_type, amount, balance_after, description, service_id, assignment_id)
  SELECT v_partner, 'earning', v_credit, v_balance, 'Customer unavailable visit', p_service_id, v_assignment
  WHERE NOT EXISTS (SELECT 1 FROM public.wallet_ledger WHERE service_id = p_service_id AND entry_type = 'earning');

  INSERT INTO public.unavailability_reports(service_id, partner_id, customer_id, reason, notes, photo_path, lat, lng, credited_amount)
  VALUES (p_service_id, v_partner, v_customer, p_reason, NULLIF(p_notes, ''), p_photo, NULLIF(p_lat, 0), NULLIF(p_lng, 0), v_credit)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'credited', v_credit);
END $$;
REVOKE EXECUTE ON FUNCTION public.submit_service_unavailable(uuid, text, text, text, numeric, numeric) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_service_unavailable(uuid, text, text, text, numeric, numeric) TO authenticated, service_role;

-- Keep subscriptions in sync if an admin manually changes bookings to paid.
DROP TRIGGER IF EXISTS trg_bookings_enqueue_subscription ON public.bookings;
CREATE TRIGGER trg_bookings_enqueue_subscription
AFTER INSERT OR UPDATE OF payment_status ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_subscription_on_paid();