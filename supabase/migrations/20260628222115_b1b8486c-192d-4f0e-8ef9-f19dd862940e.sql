
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
  SELECT COUNT(*) INTO bkd FROM assignments a
  WHERE a.scheduled_date = p_date AND a.status::text IN ('pending','in_progress','completed')
    AND a.customer_id IN (
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

    SELECT COUNT(*) INTO services_today FROM assignments a
      WHERE a.scheduled_date = CURRENT_DATE
        AND a.customer_id IN (SELECT id FROM customers c WHERE c.latitude IS NOT NULL
          AND (z.bbox_min_lat IS NULL OR c.latitude BETWEEN z.bbox_min_lat AND z.bbox_max_lat)
          AND (z.bbox_min_lng IS NULL OR c.longitude BETWEEN z.bbox_min_lng AND z.bbox_max_lng));
    SELECT COUNT(*) INTO services_completed FROM assignments a
      WHERE a.scheduled_date = CURRENT_DATE AND a.status::text='completed'
        AND a.customer_id IN (SELECT id FROM customers c WHERE c.latitude IS NOT NULL
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

CREATE OR REPLACE FUNCTION public.compute_coverage_alerts()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE z record; cap record; n int := 0; ap int;
BEGIN
  FOR z IN SELECT * FROM coverage_zones WHERE status='active' LOOP
    SELECT * INTO cap FROM get_zone_capacity(z.id, CURRENT_DATE);
    IF cap.daily_capacity > 0 AND cap.used_pct >= 90 THEN
      INSERT INTO coverage_alerts(zone_id, kind, severity, message, payload)
      SELECT z.id, 'capacity_90', 'warning',
             z.name||' is at '||cap.used_pct||'% capacity',
             jsonb_build_object('used_pct', cap.used_pct, 'remaining', cap.remaining)
      WHERE NOT EXISTS (SELECT 1 FROM coverage_alerts a WHERE a.zone_id=z.id AND a.kind='capacity_90' AND a.resolved_at IS NULL);
      n := n + 1;
    END IF;
    SELECT COUNT(*) INTO ap FROM partners p WHERE p.status::text='active' AND p.home_lat IS NOT NULL
      AND (z.bbox_min_lat IS NULL OR p.home_lat BETWEEN z.bbox_min_lat AND z.bbox_max_lat);
    IF ap = 0 THEN
      INSERT INTO coverage_alerts(zone_id, kind, severity, message)
      SELECT z.id, 'no_partners', 'critical', z.name||' has no active partners'
      WHERE NOT EXISTS (SELECT 1 FROM coverage_alerts a WHERE a.zone_id=z.id AND a.kind='no_partners' AND a.resolved_at IS NULL);
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.simulate_zone_change(p_zone uuid, p_patch jsonb)
RETURNS TABLE(
  delta_houses int, delta_customers int, delta_requests int,
  delta_partners int, est_monthly_revenue numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE z public.coverage_zones%ROWTYPE; new_radius numeric;
  cur_partners int; new_partners int; cur_cust int; new_cust int; cur_req int; new_req int;
BEGIN
  IF NOT has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO z FROM coverage_zones WHERE id = p_zone;
  IF z.id IS NULL THEN RETURN; END IF;
  new_radius := COALESCE((p_patch->>'radius_m')::numeric, z.radius_m);
  IF z.zone_type='radius' AND z.center_lat IS NOT NULL THEN
    SELECT COUNT(*) INTO cur_partners FROM partners p WHERE p.status::text='active' AND p.home_lat IS NOT NULL
      AND 6371000 * 2 * asin(sqrt(sin(radians((p.home_lat - z.center_lat)/2))^2
        + cos(radians(z.center_lat))*cos(radians(p.home_lat))
          * sin(radians((p.home_lng - z.center_lng)/2))^2)) <= z.radius_m;
    SELECT COUNT(*) INTO new_partners FROM partners p WHERE p.status::text='active' AND p.home_lat IS NOT NULL
      AND 6371000 * 2 * asin(sqrt(sin(radians((p.home_lat - z.center_lat)/2))^2
        + cos(radians(z.center_lat))*cos(radians(p.home_lat))
          * sin(radians((p.home_lng - z.center_lng)/2))^2)) <= new_radius;
    SELECT COUNT(*) INTO cur_cust FROM customers c WHERE c.is_active AND c.latitude IS NOT NULL
      AND 6371000 * 2 * asin(sqrt(sin(radians((c.latitude - z.center_lat)/2))^2
        + cos(radians(z.center_lat))*cos(radians(c.latitude))
          * sin(radians((c.longitude - z.center_lng)/2))^2)) <= z.radius_m;
    SELECT COUNT(*) INTO new_cust FROM customers c WHERE c.is_active AND c.latitude IS NOT NULL
      AND 6371000 * 2 * asin(sqrt(sin(radians((c.latitude - z.center_lat)/2))^2
        + cos(radians(z.center_lat))*cos(radians(c.latitude))
          * sin(radians((c.longitude - z.center_lng)/2))^2)) <= new_radius;
    SELECT COUNT(*) INTO cur_req FROM expansion_requests e WHERE e.lat IS NOT NULL
      AND 6371000 * 2 * asin(sqrt(sin(radians((e.lat - z.center_lat)/2))^2
        + cos(radians(z.center_lat))*cos(radians(e.lat))
          * sin(radians((e.lng - z.center_lng)/2))^2)) <= z.radius_m;
    SELECT COUNT(*) INTO new_req FROM expansion_requests e WHERE e.lat IS NOT NULL
      AND 6371000 * 2 * asin(sqrt(sin(radians((e.lat - z.center_lat)/2))^2
        + cos(radians(z.center_lat))*cos(radians(e.lat))
          * sin(radians((e.lng - z.center_lng)/2))^2)) <= new_radius;
  ELSE
    cur_partners := 0; new_partners := 0; cur_cust := 0; new_cust := 0; cur_req := 0; new_req := 0;
  END IF;
  delta_houses := (new_cust - cur_cust) * 4;
  delta_customers := new_cust - cur_cust;
  delta_requests := new_req - cur_req;
  delta_partners := new_partners - cur_partners;
  est_monthly_revenue := delta_customers * 899;
  RETURN NEXT;
END $$;
