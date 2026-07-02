-- P0 Production GPS + service-flow hardening

-- Exact GPS helper must reject nulls, invalid ranges, and configured service-area centroids.
CREATE OR REPLACE FUNCTION public.is_exact_gps(_lat numeric, _lng numeric)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _lat IS NOT NULL
     AND _lng IS NOT NULL
     AND _lat BETWEEN -90 AND 90
     AND _lng BETWEEN -180 AND 180
     AND NOT public.is_centroid_coord(_lat, _lng);
$$;
GRANT EXECUTE ON FUNCTION public.is_exact_gps(numeric, numeric) TO authenticated, service_role;

-- Bookings always snapshot exact GPS from the selected customer address.
CREATE OR REPLACE FUNCTION public.sync_booking_gps_from_address()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a record;
BEGIN
  SELECT * INTO a FROM public.customer_addresses WHERE id = NEW.address_id;
  IF NOT FOUND OR NOT public.is_exact_gps(a.latitude, a.longitude) THEN
    RAISE EXCEPTION 'Exact customer GPS is required before booking. Please save current location again.' USING ERRCODE='check_violation';
  END IF;
  NEW.latitude := a.latitude;
  NEW.longitude := a.longitude;
  NEW.gps_source := 'exact_address';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_booking_gps_from_address ON public.bookings;
CREATE TRIGGER trg_sync_booking_gps_from_address
  BEFORE INSERT OR UPDATE OF address_id ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_booking_gps_from_address();

-- Operational customer creation must refuse centroid/missing GPS and must preserve booking GPS.
CREATE OR REPLACE FUNCTION public.ensure_ops_customer_for_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
  p record;
  a record;
  cv record;
  v_name text;
  v_phone text;
  v_lat numeric;
  v_lng numeric;
BEGIN
  SELECT bk.*, sc.slug AS service_slug, sc.name AS service_name
    INTO v_booking
    FROM public.bookings bk
    JOIN public.service_catalog sc ON sc.id = bk.service_id
    WHERE bk.id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  SELECT * INTO p FROM public.customer_profiles WHERE user_id = v_booking.user_id LIMIT 1;
  SELECT * INTO a FROM public.customer_addresses WHERE id = v_booking.address_id LIMIT 1;
  SELECT * INTO cv FROM public.customer_vehicles WHERE id = v_booking.vehicle_id LIMIT 1;

  v_lat := COALESCE(v_booking.latitude, a.latitude);
  v_lng := COALESCE(v_booking.longitude, a.longitude);
  IF NOT public.is_exact_gps(v_lat, v_lng) THEN
    RAISE EXCEPTION 'Exact customer GPS is required before activation. Please save current location again.' USING ERRCODE='check_violation';
  END IF;

  v_name := COALESCE(NULLIF(trim(p.full_name), ''), 'Urban Wash Customer');
  v_phone := COALESCE(NULLIF(trim(p.phone), ''), '0000000000');

  IF a.id IS NOT NULL THEN
    INSERT INTO public.customers (
      id, full_name, phone, email, address_line, area, city, pincode,
      latitude, longitude, gps_source, subscription_plan, subscription_start, subscription_end,
      is_active, preferred_time, service_required_before, payment_status, paid_at, updated_at
    ) VALUES (
      v_booking.user_id, v_name, v_phone, p.email, a.address_line, a.area, 'Lucknow', a.pincode,
      v_lat, v_lng, 'exact', 'daily_shine_monthly'::subscription_plan,
      COALESCE(v_booking.scheduled_date, CURRENT_DATE), COALESCE(v_booking.scheduled_date, CURRENT_DATE) + 30,
      true, COALESCE(v_booking.preferred_before_time, 'Before 8 AM'), COALESCE(v_booking.preferred_before_time, 'Before 8 AM'),
      CASE WHEN v_booking.payment_status = 'paid' THEN 'paid' ELSE 'pending' END,
      CASE WHEN v_booking.payment_status = 'paid' THEN now() ELSE NULL END,
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
      gps_source = 'exact',
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
      cv.id, v_booking.user_id, cv.make, cv.model, cv.registration_number, cv.color, cv.parking_notes, cv.image_path, v_booking.total_amount::int
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

  UPDATE public.bookings
     SET latitude = v_lat,
         longitude = v_lng,
         gps_source = 'exact_address',
         updated_at = now()
   WHERE id = p_booking_id;

  RETURN jsonb_build_object('customer_id', v_booking.user_id, 'vehicle_id', v_booking.vehicle_id, 'latitude', v_lat, 'longitude', v_lng);
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_ops_customer_for_booking(uuid) TO authenticated, service_role;

-- Service destination is immutable exact customer destination unless a newer exact customer update is applied.
CREATE OR REPLACE FUNCTION public.tg_set_service_destination()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
BEGIN
  SELECT latitude, longitude INTO c FROM public.customers WHERE id = NEW.customer_id;

  IF NEW.destination_lat IS NULL OR NEW.destination_lng IS NULL THEN
    IF NOT public.is_exact_gps(c.latitude, c.longitude) THEN
      RAISE EXCEPTION 'Exact customer GPS is required before assignment.' USING ERRCODE='check_violation';
    END IF;
    NEW.destination_lat := c.latitude;
    NEW.destination_lng := c.longitude;
    NEW.destination_source := 'customer';
  ELSIF NOT public.is_exact_gps(NEW.destination_lat, NEW.destination_lng) THEN
    RAISE EXCEPTION 'Service destination must be exact customer GPS.' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_set_service_destination ON public.services;
CREATE TRIGGER trg_set_service_destination
  BEFORE INSERT OR UPDATE OF customer_id, destination_lat, destination_lng ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_service_destination();

CREATE OR REPLACE FUNCTION public.tg_sync_customer_location_to_future_work()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_exact_gps(NEW.latitude, NEW.longitude) THEN
    RAISE EXCEPTION 'Exact customer GPS is required before syncing route work.' USING ERRCODE='check_violation';
  END IF;

  UPDATE public.services
     SET destination_lat = NEW.latitude,
         destination_lng = NEW.longitude,
         destination_source = 'customer',
         updated_at = now()
   WHERE customer_id = NEW.id
     AND scheduled_date >= CURRENT_DATE
     AND status IN ('pending','in_progress');

  UPDATE public.subscription_assignment_queue
     SET lat = NEW.latitude,
         lng = NEW.longitude,
         area = NEW.area,
         updated_at = now()
   WHERE customer_id = NEW.id
     AND status IN ('awaiting','offered','assigned','pending');

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_customer_location_to_future_work ON public.customers;
CREATE TRIGGER trg_sync_customer_location_to_future_work
  AFTER UPDATE OF latitude, longitude, area, address_line ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_customer_location_to_future_work();

-- Propagate address corrections through bookings/customers/services/assignment queue.
CREATE OR REPLACE FUNCTION public.tg_sync_address_location_to_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_exact_gps(NEW.latitude, NEW.longitude) THEN
    RAISE EXCEPTION 'Exact customer GPS is required.' USING ERRCODE='check_violation';
  END IF;

  UPDATE public.bookings
     SET latitude = NEW.latitude,
         longitude = NEW.longitude,
         gps_source = 'exact_address',
         updated_at = now()
   WHERE address_id = NEW.id;

  UPDATE public.customers
     SET latitude = NEW.latitude,
         longitude = NEW.longitude,
         gps_source = 'exact',
         address_line = NEW.address_line,
         area = NEW.area,
         pincode = NEW.pincode,
         updated_at = now()
   WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_address_location_to_pipeline ON public.customer_addresses;
CREATE TRIGGER trg_sync_address_location_to_pipeline
  AFTER UPDATE OF latitude, longitude, address_line, area, pincode ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_address_location_to_pipeline();

-- Reliable partner complete: exact service destination for GPS radius + customer/admin notifications + wallet side effects.
CREATE OR REPLACE FUNCTION public.partner_complete_service(
  p_service_id uuid,
  p_lat numeric DEFAULT NULL::numeric,
  p_lng numeric DEFAULT NULL::numeric,
  p_notes text DEFAULT NULL::text,
  p_force_override boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_svc services%ROWTYPE;
  v_radius_m numeric;
  v_rate numeric;
  v_cust_lat numeric;
  v_cust_lng numeric;
  v_dist_km numeric;
  v_dist_m numeric;
  v_flag text;
  v_has_before boolean;
  v_missing_after text[] := ARRAY[]::text[];
  v_a record;
  v_now timestamptz := now();
  v_booking_id uuid;
  v_partner_name text;
  v_photo_paths jsonb;
  v_customer_user uuid;
  v_customer_phone text;
  v_complaint_window_h int;
  v_was_already_credited boolean;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_svc FROM public.services WHERE id = p_service_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service not found' USING ERRCODE='P0404'; END IF;
  IF v_svc.partner_id IS DISTINCT FROM v_partner AND NOT p_force_override THEN
    RAISE EXCEPTION 'Not your service' USING ERRCODE='P04AU';
  END IF;

  IF v_svc.status = 'completed' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'service_id', v_svc.id);
  END IF;
  IF v_svc.status NOT IN ('pending','in_progress') THEN
    RAISE EXCEPTION 'Service cannot be completed from status %', v_svc.status USING ERRCODE='P04ST';
  END IF;

  IF NOT p_force_override THEN
    SELECT EXISTS(SELECT 1 FROM public.service_photos WHERE service_id = p_service_id AND stage='before') INTO v_has_before;
    FOR v_a IN SELECT unnest(ARRAY['front','rear','left','right']) AS angle LOOP
      IF NOT EXISTS(SELECT 1 FROM public.service_photos WHERE service_id = p_service_id AND stage='after' AND angle::text = v_a.angle) THEN
        v_missing_after := array_append(v_missing_after, v_a.angle);
      END IF;
    END LOOP;
    IF NOT v_has_before OR array_length(v_missing_after,1) IS NOT NULL THEN
      RAISE EXCEPTION 'Missing required photos'
        USING ERRCODE='P04PH',
              DETAIL = jsonb_build_object('missing_before', NOT v_has_before, 'missing_after', v_missing_after)::text;
    END IF;
  END IF;

  SELECT COALESCE((value::text)::numeric, 200) INTO v_radius_m
    FROM public.platform_settings WHERE key='complete_gps_radius_m';

  v_cust_lat := COALESCE(v_svc.destination_lat, (SELECT latitude FROM public.customers WHERE id = v_svc.customer_id));
  v_cust_lng := COALESCE(v_svc.destination_lng, (SELECT longitude FROM public.customers WHERE id = v_svc.customer_id));
  SELECT phone INTO v_customer_phone FROM public.customers WHERE id = v_svc.customer_id;

  IF NOT public.is_exact_gps(v_cust_lat, v_cust_lng) THEN
    RAISE EXCEPTION 'Exact customer GPS is missing for this service.' USING ERRCODE='P04CG';
  END IF;

  IF p_lat IS NULL OR p_lng IS NULL THEN
    v_flag := 'missing_gps';
    v_dist_m := NULL;
  ELSE
    v_dist_km := public.haversine_km(p_lat, p_lng, v_cust_lat, v_cust_lng);
    v_dist_m := round(v_dist_km * 1000, 1);
    v_flag := CASE WHEN v_dist_m <= v_radius_m THEN 'ok' ELSE 'out_of_range' END;
  END IF;

  IF v_flag = 'out_of_range' AND NOT p_force_override THEN
    UPDATE public.services
       SET gps_flag = v_flag,
           gps_distance_m = v_dist_m,
           fraud_review = true,
           complete_lat = p_lat,
           complete_lng = p_lng,
           updated_at = v_now
     WHERE id = p_service_id;
    RAISE EXCEPTION 'You are too far from the customer address (% m, allowed %)', v_dist_m, v_radius_m
      USING ERRCODE='P04GP', DETAIL = jsonb_build_object('distance_m', v_dist_m, 'radius_m', v_radius_m)::text;
  END IF;

  SELECT COALESCE((value::text)::numeric, 17) INTO v_rate
    FROM public.platform_settings WHERE key='daily_shine_rate_per_car';
  v_rate := COALESCE(NULLIF(v_svc.rate_per_car,0), v_rate, 17);

  SELECT EXISTS(SELECT 1 FROM public.wallet_ledger WHERE service_id = p_service_id AND entry_type='earning') INTO v_was_already_credited;

  UPDATE public.services SET
    status = 'completed',
    started_at = COALESCE(started_at, v_now),
    completed_at = v_now,
    complete_lat = p_lat,
    complete_lng = p_lng,
    gps_flag = v_flag,
    gps_distance_m = v_dist_m,
    fraud_review = (v_flag <> 'ok'),
    destination_lat = v_cust_lat,
    destination_lng = v_cust_lng,
    destination_source = COALESCE(destination_source, 'customer'),
    updated_at = v_now
  WHERE id = p_service_id;

  IF NOT v_was_already_credited THEN
    INSERT INTO public.earnings(partner_id, earned_on, cars_completed, base_amount)
    VALUES (v_partner, CURRENT_DATE, 1, v_rate)
    ON CONFLICT (partner_id, earned_on) DO UPDATE SET
      cars_completed = public.earnings.cars_completed + 1,
      base_amount = public.earnings.base_amount + EXCLUDED.base_amount;
  END IF;

  SELECT id, user_id INTO v_booking_id, v_customer_user
    FROM public.bookings WHERE ops_service_id = p_service_id LIMIT 1;
  IF v_customer_user IS NULL THEN v_customer_user := v_svc.customer_id; END IF;
  IF v_customer_user IS NULL AND v_customer_phone IS NOT NULL THEN
    SELECT user_id INTO v_customer_user FROM public.customer_profiles WHERE phone = v_customer_phone LIMIT 1;
  END IF;

  SELECT full_name INTO v_partner_name FROM public.partners WHERE id = v_partner;
  SELECT COALESCE((value::text)::int, 2) INTO v_complaint_window_h
    FROM public.platform_settings WHERE key='complaint_window_hours';
  SELECT jsonb_agg(jsonb_build_object('stage',stage,'angle',angle,'path',storage_path)) INTO v_photo_paths
    FROM public.service_photos WHERE service_id = p_service_id;

  IF v_customer_user IS NOT NULL THEN
    INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
    VALUES (
      v_customer_user,
      'service_completed',
      'Your service is complete',
      'Your vehicle has been serviced. Tap to see today''s photos and details.',
      CASE WHEN v_booking_id IS NOT NULL THEN '/c/bookings/' || v_booking_id::text ELSE '/c/bookings' END,
      jsonb_build_object(
        'service_id', p_service_id,
        'booking_id', v_booking_id,
        'partner_name', v_partner_name,
        'completed_at', v_now,
        'photos', COALESCE(v_photo_paths, '[]'::jsonb),
        'complaint_until', v_now + (v_complaint_window_h || ' hours')::interval,
        'complaint_window_open', true
      )
    );
  END IF;

  INSERT INTO public.partner_notifications(partner_id, type, title, body, metadata)
  SELECT v_partner, 'earnings_posted', '₹' || v_rate || ' earned', 'Service completed. Earnings credited to your wallet.', jsonb_build_object('service_id', p_service_id, 'amount', v_rate)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.partner_notifications
     WHERE partner_id = v_partner AND type='earnings_posted' AND (metadata->>'service_id') = p_service_id::text
  );

  INSERT INTO public.admin_alerts(kind, severity, title, message, metadata)
  VALUES ('service_completed', 'info', 'Service completed', COALESCE(v_partner_name, 'Partner') || ' completed a service.', jsonb_build_object('service_id', p_service_id, 'partner_id', v_partner, 'customer_id', v_svc.customer_id, 'amount', v_rate, 'gps_flag', v_flag));

  RETURN jsonb_build_object('ok', true, 'already', false, 'service_id', p_service_id, 'booking_id', v_booking_id, 'amount', v_rate, 'gps_flag', v_flag, 'distance_m', v_dist_m, 'customer_notified', v_customer_user IS NOT NULL, 'admin_notified', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.partner_complete_service(uuid, numeric, numeric, text, boolean) TO authenticated, service_role;

-- Issue/unavailable reports create admin/customer notifications and update the route atomically.
CREATE OR REPLACE FUNCTION public.submit_service_unavailable(p_service_id uuid, p_reason text, p_notes text, p_photo text, p_lat numeric, p_lng numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_credit numeric;
  v_balance numeric;
  v_assignment uuid;
  v_customer uuid;
  v_partner_name text;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_photo IS NULL OR length(trim(p_photo)) = 0 THEN RAISE EXCEPTION 'Photo required'; END IF;
  SELECT COALESCE((value::text)::numeric, 12) INTO v_credit FROM public.platform_settings WHERE key = 'unavailable_compensation';
  SELECT full_name INTO v_partner_name FROM public.partners WHERE id = v_partner;

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

  INSERT INTO public.customer_notifications(user_id, type, title, body, link, metadata)
  VALUES (v_customer, 'service_unavailable', 'Service could not be completed today', 'Your partner reported: ' || replace(p_reason, '_', ' ') || '.', '/c/bookings', jsonb_build_object('service_id', p_service_id, 'partner_name', v_partner_name, 'reason', p_reason, 'photo', p_photo));

  INSERT INTO public.admin_alerts(kind, severity, title, message, metadata)
  VALUES ('service_unavailable', 'warning', 'Service marked unavailable', COALESCE(v_partner_name, 'Partner') || ' reported ' || replace(p_reason, '_', ' ') || '.', jsonb_build_object('service_id', p_service_id, 'partner_id', v_partner, 'customer_id', v_customer, 'reason', p_reason, 'photo', p_photo));

  RETURN jsonb_build_object('ok', true, 'credited', v_credit, 'customer_notified', true, 'admin_notified', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_service_unavailable(uuid, text, text, text, numeric, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_parking_issue(p_service_id uuid, p_reason text, p_notes text, p_photo text, p_lat numeric, p_lng numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_customer uuid;
  v_partner_name text;
BEGIN
  IF v_partner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_photo IS NULL OR length(trim(p_photo)) = 0 THEN RAISE EXCEPTION 'Photo required'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'Reason required'; END IF;

  SELECT customer_id INTO v_customer FROM public.services WHERE id = p_service_id AND partner_id = v_partner;
  IF v_customer IS NULL THEN RAISE EXCEPTION 'Service not found'; END IF;
  SELECT full_name INTO v_partner_name FROM public.partners WHERE id = v_partner;

  INSERT INTO public.parking_reports(service_id, partner_id, reason, notes, photo_path)
  VALUES (p_service_id, v_partner, p_reason, NULLIF(p_notes,''), p_photo);

  INSERT INTO public.admin_alerts(kind, severity, title, message, metadata)
  VALUES ('parking_issue', 'warning', 'Parking/access issue reported', COALESCE(v_partner_name, 'Partner') || ' reported a parking/access issue.', jsonb_build_object('service_id', p_service_id, 'partner_id', v_partner, 'customer_id', v_customer, 'reason', p_reason, 'photo', p_photo, 'lat', NULLIF(p_lat,0), 'lng', NULLIF(p_lng,0)));

  RETURN jsonb_build_object('ok', true, 'credited', 0, 'admin_notified', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_parking_issue(uuid, text, text, text, numeric, numeric) TO authenticated, service_role;

-- Backfill and re-sync current operational rows from exact sources only.
UPDATE public.bookings b
   SET latitude = ca.latitude,
       longitude = ca.longitude,
       gps_source = 'exact_address',
       updated_at = now()
  FROM public.customer_addresses ca
 WHERE ca.id = b.address_id
   AND public.is_exact_gps(ca.latitude, ca.longitude);

UPDATE public.customers c
   SET latitude = ca.latitude,
       longitude = ca.longitude,
       address_line = ca.address_line,
       area = ca.area,
       pincode = ca.pincode,
       gps_source = 'exact',
       updated_at = now()
  FROM public.bookings b
  JOIN public.customer_addresses ca ON ca.id = b.address_id
 WHERE c.id = b.user_id
   AND public.is_exact_gps(ca.latitude, ca.longitude);

UPDATE public.services s
   SET destination_lat = x.lat,
       destination_lng = x.lng,
       destination_source = x.src,
       updated_at = now()
  FROM (
    SELECT s2.id sid,
           COALESCE(b.latitude, c.latitude) lat,
           COALESCE(b.longitude, c.longitude) lng,
           CASE WHEN b.latitude IS NOT NULL THEN 'booking' ELSE 'customer' END src
      FROM public.services s2
      JOIN public.customers c ON c.id = s2.customer_id
      LEFT JOIN public.bookings b ON b.ops_service_id = s2.id
  ) x
 WHERE s.id = x.sid
   AND public.is_exact_gps(x.lat, x.lng);

UPDATE public.subscription_assignment_queue q
   SET lat = COALESCE(b.latitude, ca.latitude, c.latitude),
       lng = COALESCE(b.longitude, ca.longitude, c.longitude),
       area = COALESCE(ca.area, c.area, q.area),
       updated_at = now()
  FROM public.bookings b
  LEFT JOIN public.customer_addresses ca ON ca.id = b.address_id
  LEFT JOIN public.customers c ON c.id = b.user_id
 WHERE b.id = q.booking_id
   AND public.is_exact_gps(COALESCE(b.latitude, ca.latitude, c.latitude), COALESCE(b.longitude, ca.longitude, c.longitude));

DROP FUNCTION IF EXISTS public.gps_audit_report();
DROP VIEW IF EXISTS public.admin_gps_health;
CREATE VIEW public.admin_gps_health AS
WITH active_customers AS (
  SELECT * FROM public.customers WHERE COALESCE(is_active,true)=true
), partner_state AS (
  SELECT count(*) FILTER (WHERE last_seen>now()-interval '5 minutes') online,
         count(*) FILTER (WHERE last_seen IS NULL OR last_seen<=now()-interval '5 minutes') offline,
         count(*) FILTER (WHERE last_seen<=now()-interval '5 minutes' AND last_seen>now()-interval '60 minutes') stale
    FROM public.partners WHERE status='active'::public.partner_status
), duplicate_gps AS (
  SELECT count(*) duplicate_rows
    FROM active_customers c
   WHERE c.latitude IS NOT NULL AND c.longitude IS NOT NULL
     AND (SELECT count(*) FROM active_customers x WHERE x.latitude = c.latitude AND x.longitude = c.longitude) > 1
)
SELECT (SELECT count(*) FROM active_customers) active_customers,
       (SELECT count(*) FROM active_customers WHERE public.is_exact_gps(latitude,longitude)) gps_exact,
       (SELECT count(*) FROM active_customers WHERE public.is_centroid_coord(latitude,longitude)) gps_centroid,
       (SELECT count(*) FROM active_customers WHERE latitude IS NULL OR longitude IS NULL) gps_missing,
       (SELECT count(*) FROM active_customers WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND NOT public.is_exact_gps(latitude,longitude) AND NOT public.is_centroid_coord(latitude,longitude)) gps_invalid,
       (SELECT duplicate_rows FROM duplicate_gps) duplicate_gps,
       (SELECT online FROM partner_state) partners_online,
       (SELECT offline FROM partner_state) partners_offline,
       (SELECT stale FROM partner_state) partners_stale_heartbeat,
       (SELECT count(*) FROM public.subscription_assignment_queue WHERE status IN ('awaiting','offered','assigned','pending')) customers_waiting_reassignment,
       (SELECT count(*) FROM active_customers WHERE updated_at::date=CURRENT_DATE AND NOT public.is_exact_gps(latitude,longitude)) gps_issues_today,
       0::int fixed_automatically,
       0::int manual_corrections,
       (SELECT count(*) FROM active_customers WHERE NOT public.is_exact_gps(latitude,longitude)) pending,
       now() as_of;
GRANT SELECT ON public.admin_gps_health TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.gps_audit_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT * INTO r FROM public.admin_gps_health;
  RETURN jsonb_build_object(
    'customers_checked', r.active_customers,
    'exact_gps', r.gps_exact,
    'wrong_gps_fixed', r.fixed_automatically + r.manual_corrections,
    'centroid_gps', r.gps_centroid,
    'missing_gps', r.gps_missing,
    'duplicate_gps', r.duplicate_gps,
    'invalid_gps', r.gps_invalid,
    'navigation_test', CASE WHEN r.pending=0 THEN 'PASS' ELSE 'FAIL' END,
    'google_maps_exact_destination', CASE WHEN r.pending=0 THEN 'PASS' ELSE 'FAIL' END,
    'as_of', r.as_of
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.gps_audit_report() TO authenticated, service_role;
