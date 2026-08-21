-- Disable auto-assignment for subscription bookings to allow manual Admin control
UPDATE public.platform_settings 
SET value = 'false'::jsonb 
WHERE key = 'auto_assign_enabled';

-- Update enqueue_subscription_booking to NOT call offer_next_for_queue automatically
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

  -- REMOVED: PERFORM public.offer_next_for_queue(v_queue);
  RETURN v_queue;
END $$;
