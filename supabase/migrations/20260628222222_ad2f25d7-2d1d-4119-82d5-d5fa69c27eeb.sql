
CREATE OR REPLACE FUNCTION public.get_zone_capacity(p_zone uuid, p_date date DEFAULT CURRENT_DATE)
RETURNS TABLE(daily_capacity int, booked int, remaining int, used_pct numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE z public.coverage_zones%ROWTYPE; partner_count int := 0; cap int := 0; bkd int := 0;
BEGIN
  SELECT * INTO z FROM coverage_zones WHERE id = p_zone;
  IF z.id IS NULL THEN RETURN; END IF;
  SELECT COUNT(*) INTO partner_count FROM partners p
  WHERE p.status::text = 'active' AND p.home_lat IS NOT NULL AND p.home_lng IS NOT NULL
    AND (z.bbox_min_lat IS NULL OR p.home_lat BETWEEN z.bbox_min_lat AND z.bbox_max_lat)
    AND (z.bbox_min_lng IS NULL OR p.home_lng BETWEEN z.bbox_min_lng AND z.bbox_max_lng);
  cap := COALESCE(z.max_daily_capacity, partner_count * z.max_cars_per_partner);
  SELECT COUNT(*) INTO bkd FROM services s
  WHERE s.scheduled_date = p_date AND s.status::text NOT IN ('cancelled')
    AND s.customer_id IN (
      SELECT c.id FROM customers c
      WHERE c.latitude IS NOT NULL AND c.longitude IS NOT NULL
        AND (z.bbox_min_lat IS NULL OR c.latitude BETWEEN z.bbox_min_lat AND z.bbox_max_lat)
        AND (z.bbox_min_lng IS NULL OR c.longitude BETWEEN z.bbox_min_lng AND z.bbox_max_lng)
    );
  daily_capacity := cap; booked := bkd; remaining := GREATEST(cap - bkd, 0);
  used_pct := CASE WHEN cap > 0 THEN ROUND((bkd::numeric / cap) * 100, 1) ELSE 0 END;
  RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.get_zone_dashboard()
RETURNS TABLE(
  zone_id uuid, zone_name text, status text,
  daily_shine_enabled boolean, premium_enabled boolean,
  active_customers int, ds_customers int, premium_customers int,
  active_partners int, available_partners int,
  marketplace_queue int, leads_pending int,
  services_today int, services_completed int,
  revenue_today numeric, revenue_month numeric,
  renewals_today int, complaints_open int, avg_rating numeric,
  daily_capacity int, booked int, remaining int, capacity_used_pct numeric,
  calendar_ds_on boolean, calendar_premium_on boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE z record; cap record; mask record;
BEGIN
  FOR z IN SELECT * FROM coverage_zones ORDER BY priority DESC, name LOOP
    SELECT * INTO cap FROM get_zone_capacity(z.id, CURRENT_DATE);
    SELECT * INTO mask FROM zone_calendar_mask(z.id, CURRENT_DATE);
    zone_id := z.id; zone_name := z.name; status := z.status;
    daily_shine_enabled := z.daily_shine_enabled; premium_enabled := z.premium_enabled;

    SELECT COUNT(*) INTO active_customers FROM customers c
      WHERE c.is_active = true AND c.latitude IS NOT NULL
        AND (z.bbox_min_lat IS NULL OR c.latitude BETWEEN z.bbox_min_lat AND z.bbox_max_lat)
        AND (z.bbox_min_lng IS NULL OR c.longitude BETWEEN z.bbox_min_lng AND z.bbox_max_lng);

    SELECT COUNT(*) INTO ds_customers FROM subscriptions s
      LEFT JOIN customer_profiles cp ON cp.user_id = s.user_id
      WHERE s.status='active'
        AND (cp.lat IS NULL OR z.bbox_min_lat IS NULL
             OR (cp.lat BETWEEN z.bbox_min_lat AND z.bbox_max_lat
                 AND cp.lng BETWEEN z.bbox_min_lng AND z.bbox_max_lng));
    premium_customers := GREATEST(active_customers - ds_customers, 0);

    SELECT COUNT(*) INTO active_partners FROM partners p
      WHERE p.status::text='active' AND p.home_lat IS NOT NULL
        AND (z.bbox_min_lat IS NULL OR p.home_lat BETWEEN z.bbox_min_lat AND z.bbox_max_lat)
        AND (z.bbox_min_lng IS NULL OR p.home_lng BETWEEN z.bbox_min_lng AND z.bbox_max_lng);
    SELECT COUNT(*) INTO available_partners FROM partners p
      WHERE p.status::text='active' AND COALESCE(p.accepting_new,true) AND p.home_lat IS NOT NULL
        AND (z.bbox_min_lat IS NULL OR p.home_lat BETWEEN z.bbox_min_lat AND z.bbox_max_lat)
        AND (z.bbox_min_lng IS NULL OR p.home_lng BETWEEN z.bbox_min_lng AND z.bbox_max_lng);

    SELECT COUNT(*) INTO marketplace_queue FROM subscription_assignment_queue q
      WHERE q.status IN ('pending','offered') AND q.lat IS NOT NULL
        AND (z.bbox_min_lat IS NULL OR q.lat BETWEEN z.bbox_min_lat AND z.bbox_max_lat)
        AND (z.bbox_min_lng IS NULL OR q.lng BETWEEN z.bbox_min_lng AND z.bbox_max_lng);

    SELECT COUNT(*) INTO leads_pending FROM service_leads l
      WHERE l.status IN ('pending','assigned');

    SELECT COUNT(*) INTO services_today FROM services sv
      WHERE sv.scheduled_date = CURRENT_DATE
        AND sv.customer_id IN (SELECT id FROM customers c WHERE c.latitude IS NOT NULL
          AND (z.bbox_min_lat IS NULL OR c.latitude BETWEEN z.bbox_min_lat AND z.bbox_max_lat)
          AND (z.bbox_min_lng IS NULL OR c.longitude BETWEEN z.bbox_min_lng AND z.bbox_max_lng));
    SELECT COUNT(*) INTO services_completed FROM services sv
      WHERE sv.scheduled_date = CURRENT_DATE AND sv.status::text='completed'
        AND sv.customer_id IN (SELECT id FROM customers c WHERE c.latitude IS NOT NULL
          AND (z.bbox_min_lat IS NULL OR c.latitude BETWEEN z.bbox_min_lat AND z.bbox_max_lat)
          AND (z.bbox_min_lng IS NULL OR c.longitude BETWEEN z.bbox_min_lng AND z.bbox_max_lng));

    SELECT COALESCE(SUM(p.amount),0) INTO revenue_today FROM payments p
      WHERE p.status='captured' AND p.created_at::date = CURRENT_DATE;
    SELECT COALESCE(SUM(p.amount),0) INTO revenue_month FROM payments p
      WHERE p.status='captured' AND p.created_at >= date_trunc('month', CURRENT_DATE);

    SELECT COUNT(*) INTO renewals_today FROM customers c
      WHERE c.subscription_end = CURRENT_DATE AND c.latitude IS NOT NULL
        AND (z.bbox_min_lat IS NULL OR c.latitude BETWEEN z.bbox_min_lat AND z.bbox_max_lat);

    SELECT COUNT(*) INTO complaints_open FROM complaints co
      WHERE co.status::text IN ('open','pending','investigating');

    SELECT COALESCE(AVG(p.rating),0) INTO avg_rating FROM partners p
      WHERE p.status::text='active' AND p.home_lat IS NOT NULL
        AND (z.bbox_min_lat IS NULL OR p.home_lat BETWEEN z.bbox_min_lat AND z.bbox_max_lat);

    daily_capacity := cap.daily_capacity; booked := cap.booked;
    remaining := cap.remaining; capacity_used_pct := cap.used_pct;
    calendar_ds_on := mask.daily_shine_on; calendar_premium_on := mask.premium_on;
    RETURN NEXT;
  END LOOP;
END $$;
