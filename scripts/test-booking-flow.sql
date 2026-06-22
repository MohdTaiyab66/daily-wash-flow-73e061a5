-- End-to-end test for the customer booking confirmation flow.
-- Verifies confirm_customer_booking() from seed -> RPC -> booking row ->
-- addon line items -> partner notification -> receipt-ready totals.
--
-- Run with:  psql -v ON_ERROR_STOP=1 -f scripts/test-booking-flow.sql
-- The whole script runs inside a transaction that is ROLLED BACK at the end,
-- so it never leaves test data behind.

\set ON_ERROR_STOP on
\timing off
BEGIN;

DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_partner uuid := gen_random_uuid();
  v_service uuid;
  v_addon_dust uuid;
  v_addon_polish uuid;
  v_vehicle uuid;
  v_address uuid;
  v_booking uuid;
  v_row record;
  v_addon_count int;
  v_notif_count int;
  v_dust_qty int;
  v_extra_vehicle uuid;
  v_jwt text;
BEGIN
  ---------------------------------------------------------------------------
  -- 1. Seed auth user + customer data
  ---------------------------------------------------------------------------
  INSERT INTO auth.users (id, email, raw_user_meta_data, aud, role,
                          encrypted_password, email_confirmed_at,
                          created_at, updated_at, instance_id)
  VALUES (v_user, 'booking-test+' || v_user || '@example.com',
          jsonb_build_object('role','customer','full_name','Booking Test'),
          'authenticated','authenticated','x', now(), now(), now(),
          '00000000-0000-0000-0000-000000000000');

  -- Partner in same area so notify trigger fires
  INSERT INTO public.partners (id, phone, email, full_name, home_area, status,
                               notify_when_customers_added)
  VALUES (v_partner, '9999900001', 'p+' || v_partner || '@example.com',
          'Test Partner', 'TestArea', 'active', true);

  INSERT INTO public.customer_vehicles (user_id, make, model, category,
                                        registration_number, is_default)
  VALUES (v_user, 'Maruti', 'Swift', 'hatchback_compact_sedan',
          'TEST-' || substr(v_user::text,1,6), true)
  RETURNING id INTO v_vehicle;

  INSERT INTO public.customer_addresses (user_id, label, address_line, area,
                                         pincode, is_default)
  VALUES (v_user, 'Home', '1 Test Lane', 'TestArea', '226010', true)
  RETURNING id INTO v_address;

  INSERT INTO public.service_catalog (slug, name, service_type,
                                      price_hatchback, price_sedan_suv, active)
  VALUES ('e2e-test-wash', 'E2E Test Wash', 'one_time', 199, 249, true)
  RETURNING id INTO v_service;

  INSERT INTO public.service_addons (name, price_hatchback, price_sedan_suv,
                                     applies_to_slugs, active)
  VALUES ('E2E Dusting', 25, 25, ARRAY[]::text[], true)
  RETURNING id INTO v_addon_dust;

  INSERT INTO public.service_addons (name, price_hatchback, price_sedan_suv,
                                     applies_to_slugs, active)
  VALUES ('E2E Polish', 49, 79, ARRAY[]::text[], true)
  RETURNING id INTO v_addon_polish;

  -- Authenticate as that user for SECURITY DEFINER RPCs that read auth.uid()
  v_jwt := jsonb_build_object('sub', v_user::text, 'role','authenticated')::text;
  PERFORM set_config('request.jwt.claims', v_jwt, true);
  PERFORM set_config('role', 'authenticated', true);

  ---------------------------------------------------------------------------
  -- 2. Happy path: confirm a booking with two add-ons (qty > 1 each)
  ---------------------------------------------------------------------------
  v_booking := public.confirm_customer_booking(
    p_service_id     => v_service,
    p_vehicle_id     => v_vehicle,
    p_address_id     => v_address,
    p_scheduled_date => CURRENT_DATE + 1,
    p_scheduled_time => '09:00',
    p_notes          => 'e2e happy path',
    p_coupon_code    => NULL,
    p_addons         => jsonb_build_array(
      jsonb_build_object('id', v_addon_dust,   'quantity', 4),
      jsonb_build_object('id', v_addon_polish, 'quantity', 1)
    )
  );

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL: confirm_customer_booking returned NULL';
  END IF;

  SELECT * INTO v_row FROM public.bookings WHERE id = v_booking;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEST FAIL: booking row not inserted';
  END IF;
  IF v_row.user_id <> v_user THEN
    RAISE EXCEPTION 'TEST FAIL: booking user_id mismatch';
  END IF;
  IF v_row.status <> 'pending_payment' OR v_row.payment_status <> 'pending' THEN
    RAISE EXCEPTION 'TEST FAIL: status/payment_status not initialised correctly (%/%)',
      v_row.status, v_row.payment_status;
  END IF;
  IF v_row.base_amount <> 199 THEN
    RAISE EXCEPTION 'TEST FAIL: base_amount expected 199, got %', v_row.base_amount;
  END IF;
  -- 4x25 + 1x49 = 149
  IF v_row.addon_amount <> 149 THEN
    RAISE EXCEPTION 'TEST FAIL: addon_amount expected 149, got %', v_row.addon_amount;
  END IF;
  IF v_row.discount_amount <> 0 THEN
    RAISE EXCEPTION 'TEST FAIL: discount_amount expected 0, got %', v_row.discount_amount;
  END IF;
  IF v_row.total_amount <> 348 THEN
    RAISE EXCEPTION 'TEST FAIL: total_amount expected 348 (receipt), got %', v_row.total_amount;
  END IF;

  -- Add-on line items present with the multi-quantity preserved
  SELECT count(*) INTO v_addon_count FROM public.booking_addons WHERE booking_id = v_booking;
  IF v_addon_count <> 2 THEN
    RAISE EXCEPTION 'TEST FAIL: expected 2 booking_addons rows, got %', v_addon_count;
  END IF;
  SELECT quantity INTO v_dust_qty FROM public.booking_addons
    WHERE booking_id = v_booking AND addon_key = v_addon_dust::text;
  IF v_dust_qty <> 4 THEN
    RAISE EXCEPTION 'TEST FAIL: dusting quantity expected 4, got %', v_dust_qty;
  END IF;

  -- Partner notification trigger fired for the matching area
  SELECT count(*) INTO v_notif_count
    FROM public.partner_notifications
    WHERE partner_id = v_partner
      AND type = 'new_booking'
      AND (metadata->>'booking_id')::uuid = v_booking;
  IF v_notif_count < 1 THEN
    RAISE EXCEPTION 'TEST FAIL: partner notification not created for new booking';
  END IF;

  RAISE NOTICE 'OK  happy-path booking % confirmed, total=%, addons=%, notified',
    v_booking, v_row.total_amount, v_addon_count;

  ---------------------------------------------------------------------------
  -- 3. Coupon rejected when vehicle count is too low
  ---------------------------------------------------------------------------
  BEGIN
    PERFORM public.confirm_customer_booking(
      p_service_id     => v_service,
      p_vehicle_id     => v_vehicle,
      p_address_id     => v_address,
      p_scheduled_date => CURRENT_DATE + 2,
      p_scheduled_time => '10:00',
      p_coupon_code    => 'EXTRA10',
      p_addons         => '[]'::jsonb
    );
    RAISE EXCEPTION 'TEST FAIL: EXTRA10 should have been rejected (only 1 vehicle)';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%vehicles%' THEN RAISE; END IF;
      RAISE NOTICE 'OK  coupon rejected with: %', SQLERRM;
  END;

  ---------------------------------------------------------------------------
  -- 4. Coupon accepted once enough vehicles exist; discount applied
  ---------------------------------------------------------------------------
  INSERT INTO public.customer_vehicles (user_id, make, model, category,
                                        registration_number, is_default)
  VALUES (v_user, 'Hyundai', 'i20', 'hatchback_compact_sedan',
          'TEST2-' || substr(v_user::text,1,6), false)
  RETURNING id INTO v_extra_vehicle;

  v_booking := public.confirm_customer_booking(
    p_service_id     => v_service,
    p_vehicle_id     => v_vehicle,
    p_address_id     => v_address,
    p_scheduled_date => CURRENT_DATE + 3,
    p_scheduled_time => '11:00',
    p_coupon_code    => 'EXTRA10',
    p_addons         => '[]'::jsonb
  );
  SELECT * INTO v_row FROM public.bookings WHERE id = v_booking;
  -- 10% of 199 = 19.9 -> rounded to 20
  IF v_row.discount_amount NOT IN (19, 20) THEN
    RAISE EXCEPTION 'TEST FAIL: EXTRA10 discount expected ~20, got %', v_row.discount_amount;
  END IF;
  IF v_row.total_amount <> v_row.base_amount + v_row.addon_amount - v_row.discount_amount THEN
    RAISE EXCEPTION 'TEST FAIL: receipt math wrong (% != % + % - %)',
      v_row.total_amount, v_row.base_amount, v_row.addon_amount, v_row.discount_amount;
  END IF;
  RAISE NOTICE 'OK  coupon EXTRA10 applied, discount=%, total=%',
    v_row.discount_amount, v_row.total_amount;

  ---------------------------------------------------------------------------
  -- 5. Past dates are rejected
  ---------------------------------------------------------------------------
  BEGIN
    PERFORM public.confirm_customer_booking(
      p_service_id     => v_service,
      p_vehicle_id     => v_vehicle,
      p_address_id     => v_address,
      p_scheduled_date => CURRENT_DATE - 1,
      p_scheduled_time => '09:00',
      p_addons         => '[]'::jsonb
    );
    RAISE EXCEPTION 'TEST FAIL: past date should have been rejected';
  EXCEPTION
    WHEN raise_exception THEN
      RAISE NOTICE 'OK  past date rejected with: %', SQLERRM;
  END;

  ---------------------------------------------------------------------------
  -- 6. Unauthenticated callers cannot create a booking
  ---------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    PERFORM public.confirm_customer_booking(
      p_service_id     => v_service,
      p_vehicle_id     => v_vehicle,
      p_address_id     => v_address,
      p_scheduled_date => CURRENT_DATE + 1,
      p_scheduled_time => '09:00',
      p_addons         => '[]'::jsonb
    );
    RAISE EXCEPTION 'TEST FAIL: missing auth should have been rejected';
  EXCEPTION
    WHEN raise_exception THEN
      RAISE NOTICE 'OK  unauthenticated call rejected with: %', SQLERRM;
  END;

  RAISE NOTICE '==========================================';
  RAISE NOTICE 'ALL BOOKING E2E CHECKS PASSED';
  RAISE NOTICE '==========================================';
END $$;

ROLLBACK;
