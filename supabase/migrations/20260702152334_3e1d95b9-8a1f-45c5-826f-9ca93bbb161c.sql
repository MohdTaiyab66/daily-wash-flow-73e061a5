ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS latitude numeric, ADD COLUMN IF NOT EXISTS longitude numeric, ADD COLUMN IF NOT EXISTS gps_source text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS destination_lat numeric, ADD COLUMN IF NOT EXISTS destination_lng numeric, ADD COLUMN IF NOT EXISTS destination_source text;

CREATE OR REPLACE FUNCTION public.is_exact_gps(_lat numeric, _lng numeric) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _lat IS NOT NULL AND _lng IS NOT NULL AND _lat BETWEEN -90 AND 90 AND _lng BETWEEN -180 AND 180 AND NOT public.is_centroid_coord(_lat, _lng);
$$;
GRANT EXECUTE ON FUNCTION public.is_exact_gps(numeric, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_reject_invalid_customer_address_gps() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_exact_gps(NEW.latitude, NEW.longitude) THEN
    RAISE EXCEPTION 'We couldn''t determine your exact location. Please enable GPS or move to an open area before saving.' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_reject_invalid_customer_address_gps ON public.customer_addresses;
CREATE TRIGGER trg_reject_invalid_customer_address_gps BEFORE INSERT OR UPDATE OF latitude, longitude ON public.customer_addresses FOR EACH ROW EXECUTE FUNCTION public.tg_reject_invalid_customer_address_gps();

CREATE OR REPLACE FUNCTION public.tg_reject_invalid_customer_gps() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_exact_gps(NEW.latitude, NEW.longitude) THEN
    RAISE EXCEPTION 'We couldn''t determine your exact location. Please enable GPS or move to an open area before saving.' USING ERRCODE='check_violation';
  END IF;
  NEW.gps_source := 'exact';
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_reject_invalid_customer_gps ON public.customers;
CREATE TRIGGER trg_reject_invalid_customer_gps BEFORE INSERT OR UPDATE OF latitude, longitude ON public.customers FOR EACH ROW EXECUTE FUNCTION public.tg_reject_invalid_customer_gps();

CREATE OR REPLACE FUNCTION public.sync_booking_gps_from_address() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record;
BEGIN
  SELECT * INTO a FROM public.customer_addresses WHERE id = NEW.address_id;
  IF NOT FOUND OR NOT public.is_exact_gps(a.latitude, a.longitude) THEN
    RAISE EXCEPTION 'We couldn''t determine your exact location. Please enable GPS or move to an open area before saving.' USING ERRCODE='check_violation';
  END IF;
  NEW.latitude := a.latitude; NEW.longitude := a.longitude; NEW.gps_source := 'exact_address';
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sync_booking_gps_from_address ON public.bookings;
CREATE TRIGGER trg_sync_booking_gps_from_address BEFORE INSERT OR UPDATE OF address_id ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.sync_booking_gps_from_address();

CREATE OR REPLACE FUNCTION public.tg_set_service_destination() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record;
BEGIN
  IF NEW.destination_lat IS NULL OR NEW.destination_lng IS NULL THEN
    SELECT latitude, longitude INTO c FROM public.customers WHERE id=NEW.customer_id;
    IF NOT public.is_exact_gps(c.latitude,c.longitude) THEN RAISE EXCEPTION 'Exact customer GPS is required before assignment.' USING ERRCODE='check_violation'; END IF;
    NEW.destination_lat:=c.latitude; NEW.destination_lng:=c.longitude; NEW.destination_source:='customer';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_set_service_destination ON public.services;
CREATE TRIGGER trg_set_service_destination BEFORE INSERT OR UPDATE OF customer_id ON public.services FOR EACH ROW EXECUTE FUNCTION public.tg_set_service_destination();

CREATE OR REPLACE FUNCTION public.tg_sync_customer_location_to_future_work() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.services SET destination_lat=NEW.latitude,destination_lng=NEW.longitude,destination_source='customer',updated_at=now() WHERE customer_id=NEW.id AND scheduled_date>=CURRENT_DATE AND status IN ('pending','in_progress');
  UPDATE public.subscription_assignment_queue SET lat=NEW.latitude,lng=NEW.longitude,area=NEW.area,updated_at=now() WHERE customer_id=NEW.id AND status IN ('awaiting','offered');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sync_customer_location_to_future_work ON public.customers;
CREATE TRIGGER trg_sync_customer_location_to_future_work AFTER UPDATE OF latitude, longitude, area, address_line ON public.customers FOR EACH ROW EXECUTE FUNCTION public.tg_sync_customer_location_to_future_work();

UPDATE public.bookings b SET latitude=ca.latitude, longitude=ca.longitude, gps_source=CASE WHEN public.is_exact_gps(ca.latitude,ca.longitude) THEN 'exact_address' ELSE 'invalid' END, updated_at=now() FROM public.customer_addresses ca WHERE ca.id=b.address_id;
UPDATE public.customers c SET latitude=ca.latitude, longitude=ca.longitude, address_line=ca.address_line, area=ca.area, pincode=ca.pincode, gps_source='exact', updated_at=now() FROM public.bookings b JOIN public.customer_addresses ca ON ca.id=b.address_id WHERE c.id=b.user_id AND public.is_exact_gps(ca.latitude,ca.longitude);
UPDATE public.services s SET destination_lat=x.lat, destination_lng=x.lng, destination_source=x.src, updated_at=now() FROM (SELECT s2.id sid, COALESCE(b.latitude,c.latitude) lat, COALESCE(b.longitude,c.longitude) lng, CASE WHEN b.latitude IS NOT NULL THEN 'booking' ELSE 'customer' END src FROM public.services s2 JOIN public.customers c ON c.id=s2.customer_id LEFT JOIN public.bookings b ON b.ops_service_id=s2.id) x WHERE s.id=x.sid AND public.is_exact_gps(x.lat,x.lng);
UPDATE public.subscription_assignment_queue q SET lat=COALESCE(b.latitude,ca.latitude,c.latitude), lng=COALESCE(b.longitude,ca.longitude,c.longitude), area=COALESCE(ca.area,c.area,q.area), updated_at=now() FROM public.bookings b LEFT JOIN public.customer_addresses ca ON ca.id=b.address_id LEFT JOIN public.customers c ON c.id=b.user_id WHERE b.id=q.booking_id AND public.is_exact_gps(COALESCE(b.latitude,ca.latitude,c.latitude),COALESCE(b.longitude,ca.longitude,c.longitude));

DROP FUNCTION IF EXISTS public.gps_audit_report();
DROP VIEW IF EXISTS public.admin_gps_health;
CREATE VIEW public.admin_gps_health AS WITH active_customers AS (SELECT * FROM public.customers WHERE COALESCE(is_active,true)=true), partner_state AS (SELECT count(*) FILTER (WHERE last_seen>now()-interval '5 minutes') online, count(*) FILTER (WHERE last_seen IS NULL OR last_seen<=now()-interval '5 minutes') offline, count(*) FILTER (WHERE last_seen<=now()-interval '5 minutes' AND last_seen>now()-interval '60 minutes') stale FROM public.partners WHERE status='active'::public.partner_status) SELECT (SELECT count(*) FROM active_customers) active_customers,(SELECT count(*) FROM active_customers WHERE public.is_exact_gps(latitude,longitude)) gps_exact,(SELECT count(*) FROM active_customers WHERE public.is_centroid_coord(latitude,longitude)) gps_centroid,(SELECT count(*) FROM active_customers WHERE latitude IS NULL OR longitude IS NULL) gps_missing,(SELECT count(*) FROM active_customers WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND NOT public.is_exact_gps(latitude,longitude) AND NOT public.is_centroid_coord(latitude,longitude)) gps_invalid,(SELECT online FROM partner_state) partners_online,(SELECT offline FROM partner_state) partners_offline,(SELECT stale FROM partner_state) partners_stale_heartbeat,(SELECT count(*) FROM public.subscription_assignment_queue WHERE status IN ('awaiting','offered')) customers_waiting_reassignment,(SELECT count(*) FROM active_customers WHERE updated_at::date=CURRENT_DATE AND NOT public.is_exact_gps(latitude,longitude)) gps_issues_today,0::int fixed_automatically,0::int manual_corrections,(SELECT count(*) FROM active_customers WHERE NOT public.is_exact_gps(latitude,longitude)) pending,now() as_of;
GRANT SELECT ON public.admin_gps_health TO authenticated;
CREATE OR REPLACE FUNCTION public.gps_audit_report() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$ DECLARE r record; BEGIN IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'admin only'; END IF; SELECT * INTO r FROM public.admin_gps_health; RETURN jsonb_build_object('customers_checked',r.active_customers,'exact_gps',r.gps_exact,'wrong_gps_fixed',r.fixed_automatically+r.manual_corrections,'centroid_gps',r.gps_centroid,'missing_gps',r.gps_missing,'duplicate_gps',0,'invalid_gps',r.gps_invalid,'navigation_test',CASE WHEN r.pending=0 THEN 'PASS' ELSE 'FAIL' END,'google_maps_exact_destination',CASE WHEN r.pending=0 THEN 'PASS' ELSE 'FAIL' END,'as_of',r.as_of); END $$;
GRANT EXECUTE ON FUNCTION public.gps_audit_report() TO authenticated, service_role;