
CREATE TABLE IF NOT EXISTS public.coverage_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text,
  color text NOT NULL DEFAULT '#3b82f6',
  priority int NOT NULL DEFAULT 10,
  zone_type text NOT NULL CHECK (zone_type IN ('radius','polygon')),
  center_lat double precision,
  center_lng double precision,
  radius_m int,
  polygon jsonb,
  bbox_min_lat double precision,
  bbox_max_lat double precision,
  bbox_min_lng double precision,
  bbox_max_lng double precision,
  daily_shine_enabled boolean NOT NULL DEFAULT false,
  premium_enabled boolean NOT NULL DEFAULT false,
  washing_enabled boolean NOT NULL DEFAULT false,
  interior_enabled boolean NOT NULL DEFAULT false,
  exterior_enabled boolean NOT NULL DEFAULT false,
  int_ext_enabled boolean NOT NULL DEFAULT false,
  deep_clean_enabled boolean NOT NULL DEFAULT false,
  polish_enabled boolean NOT NULL DEFAULT false,
  cutter_polish_enabled boolean NOT NULL DEFAULT false,
  roof_cleaning_enabled boolean NOT NULL DEFAULT false,
  seat_cleaning_enabled boolean NOT NULL DEFAULT false,
  corporate_fleet_enabled boolean NOT NULL DEFAULT false,
  emergency_enabled boolean NOT NULL DEFAULT false,
  primary_team_id uuid,
  backup_team_id uuid,
  max_daily_capacity int,
  max_active_partners int,
  max_customers int,
  max_services int,
  assignment_radius_m int,
  route_optimization_radius_m int,
  travel_buffer_min int,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.coverage_zones TO authenticated, anon;
GRANT ALL ON public.coverage_zones TO service_role;
ALTER TABLE public.coverage_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read zones" ON public.coverage_zones FOR SELECT USING (true);
CREATE POLICY "Admins manage zones" ON public.coverage_zones
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS coverage_zones_bbox_idx
  ON public.coverage_zones (bbox_min_lat, bbox_max_lat, bbox_min_lng, bbox_max_lng);
CREATE INDEX IF NOT EXISTS coverage_zones_status_priority_idx
  ON public.coverage_zones (status, priority DESC);

CREATE OR REPLACE FUNCTION public.tg_coverage_zones_bbox()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  pt jsonb; lat double precision; lng double precision;
  mnla double precision; mxla double precision; mnln double precision; mxln double precision;
  dlat double precision;
BEGIN
  NEW.updated_at := now();
  IF NEW.zone_type = 'radius' THEN
    IF NEW.center_lat IS NULL OR NEW.center_lng IS NULL OR NEW.radius_m IS NULL THEN
      RAISE EXCEPTION 'radius zone requires center_lat, center_lng, radius_m';
    END IF;
    dlat := NEW.radius_m / 111320.0;
    NEW.bbox_min_lat := NEW.center_lat - dlat;
    NEW.bbox_max_lat := NEW.center_lat + dlat;
    NEW.bbox_min_lng := NEW.center_lng - (dlat / GREATEST(cos(radians(NEW.center_lat)), 0.01));
    NEW.bbox_max_lng := NEW.center_lng + (dlat / GREATEST(cos(radians(NEW.center_lat)), 0.01));
  ELSIF NEW.zone_type = 'polygon' THEN
    IF NEW.polygon IS NULL OR jsonb_array_length(NEW.polygon) < 3 THEN
      RAISE EXCEPTION 'polygon zone requires polygon array of at least 3 points';
    END IF;
    mnla := 90; mxla := -90; mnln := 180; mxln := -180;
    FOR pt IN SELECT * FROM jsonb_array_elements(NEW.polygon) LOOP
      lng := (pt->>0)::double precision;
      lat := (pt->>1)::double precision;
      IF lat < mnla THEN mnla := lat; END IF;
      IF lat > mxla THEN mxla := lat; END IF;
      IF lng < mnln THEN mnln := lng; END IF;
      IF lng > mxln THEN mxln := lng; END IF;
    END LOOP;
    NEW.bbox_min_lat := mnla; NEW.bbox_max_lat := mxla;
    NEW.bbox_min_lng := mnln; NEW.bbox_max_lng := mxln;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_coverage_zones_bbox ON public.coverage_zones;
CREATE TRIGGER trg_coverage_zones_bbox
  BEFORE INSERT OR UPDATE ON public.coverage_zones
  FOR EACH ROW EXECUTE FUNCTION public.tg_coverage_zones_bbox();

CREATE OR REPLACE FUNCTION public.point_in_polygon(p_lat double precision, p_lng double precision, p_poly jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  n int; i int; j int;
  xi double precision; yi double precision; xj double precision; yj double precision;
  inside boolean := false;
BEGIN
  n := jsonb_array_length(p_poly);
  IF n < 3 THEN RETURN false; END IF;
  j := n - 1;
  FOR i IN 0..n-1 LOOP
    xi := (p_poly->i->>0)::double precision;
    yi := (p_poly->i->>1)::double precision;
    xj := (p_poly->j->>0)::double precision;
    yj := (p_poly->j->>1)::double precision;
    IF ((yi > p_lat) <> (yj > p_lat))
       AND (p_lng < (xj - xi) * (p_lat - yi) / NULLIF(yj - yi, 0) + xi) THEN
      inside := NOT inside;
    END IF;
    j := i;
  END LOOP;
  RETURN inside;
END $$;

CREATE OR REPLACE FUNCTION public.haversine_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
  SELECT 2 * 6371000 * asin(sqrt(
    sin(radians((lat2-lat1)/2))^2 +
    cos(radians(lat1)) * cos(radians(lat2)) * sin(radians((lng2-lng1)/2))^2
  ));
$$;

CREATE OR REPLACE FUNCTION public.get_coverage_at(p_lat double precision, p_lng double precision)
RETURNS TABLE (
  matched boolean,
  zone_id uuid,
  zone_name text,
  priority int,
  status text,
  daily_shine boolean, premium boolean, washing boolean, interior boolean,
  exterior boolean, int_ext boolean, deep_clean boolean, polish boolean,
  cutter_polish boolean, roof_cleaning boolean, seat_cleaning boolean,
  corporate_fleet boolean, emergency boolean,
  assignment_radius_m int, route_optimization_radius_m int, travel_buffer_min int,
  max_daily_capacity int, max_active_partners int
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  top_zone public.coverage_zones%ROWTYPE;
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::int, NULL::text,
      false,false,false,false,false,false,false,false,false,false,false,false,false,
      NULL::int,NULL::int,NULL::int,NULL::int,NULL::int;
    RETURN;
  END IF;

  SELECT z.* INTO top_zone FROM public.coverage_zones z
  WHERE z.status = 'active'
    AND p_lat BETWEEN z.bbox_min_lat AND z.bbox_max_lat
    AND p_lng BETWEEN z.bbox_min_lng AND z.bbox_max_lng
    AND (
      (z.zone_type = 'radius' AND public.haversine_m(p_lat,p_lng,z.center_lat,z.center_lng) <= z.radius_m)
      OR (z.zone_type = 'polygon' AND public.point_in_polygon(p_lat,p_lng,z.polygon))
    )
  ORDER BY z.priority DESC, z.created_at ASC
  LIMIT 1;

  IF top_zone.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::int, NULL::text,
      false,false,false,false,false,false,false,false,false,false,false,false,false,
      NULL::int,NULL::int,NULL::int,NULL::int,NULL::int;
    RETURN;
  END IF;

  RETURN QUERY
  WITH ov AS (
    SELECT z.* FROM public.coverage_zones z
    WHERE z.status = 'active'
      AND p_lat BETWEEN z.bbox_min_lat AND z.bbox_max_lat
      AND p_lng BETWEEN z.bbox_min_lng AND z.bbox_max_lng
      AND (
        (z.zone_type = 'radius' AND public.haversine_m(p_lat,p_lng,z.center_lat,z.center_lng) <= z.radius_m)
        OR (z.zone_type = 'polygon' AND public.point_in_polygon(p_lat,p_lng,z.polygon))
      )
  )
  SELECT
    true,
    top_zone.id, top_zone.name, top_zone.priority, top_zone.status,
    bool_or(ov.daily_shine_enabled), bool_or(ov.premium_enabled),
    bool_or(ov.washing_enabled), bool_or(ov.interior_enabled),
    bool_or(ov.exterior_enabled), bool_or(ov.int_ext_enabled),
    bool_or(ov.deep_clean_enabled), bool_or(ov.polish_enabled),
    bool_or(ov.cutter_polish_enabled), bool_or(ov.roof_cleaning_enabled),
    bool_or(ov.seat_cleaning_enabled), bool_or(ov.corporate_fleet_enabled),
    bool_or(ov.emergency_enabled),
    top_zone.assignment_radius_m, top_zone.route_optimization_radius_m, top_zone.travel_buffer_min,
    top_zone.max_daily_capacity, top_zone.max_active_partners
  FROM ov;
END $$;

GRANT EXECUTE ON FUNCTION public.get_coverage_at(double precision,double precision) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_zone_upsert(payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF (payload->>'id') IS NOT NULL AND (payload->>'id') <> '' THEN
    rid := (payload->>'id')::uuid;
    UPDATE public.coverage_zones SET
      name = COALESCE(payload->>'name', name),
      city = COALESCE(payload->>'city', city),
      color = COALESCE(payload->>'color', color),
      priority = COALESCE((payload->>'priority')::int, priority),
      zone_type = COALESCE(payload->>'zone_type', zone_type),
      center_lat = COALESCE((payload->>'center_lat')::double precision, center_lat),
      center_lng = COALESCE((payload->>'center_lng')::double precision, center_lng),
      radius_m = COALESCE((payload->>'radius_m')::int, radius_m),
      polygon = COALESCE(payload->'polygon', polygon),
      daily_shine_enabled = COALESCE((payload->>'daily_shine_enabled')::boolean, daily_shine_enabled),
      premium_enabled = COALESCE((payload->>'premium_enabled')::boolean, premium_enabled),
      washing_enabled = COALESCE((payload->>'washing_enabled')::boolean, washing_enabled),
      interior_enabled = COALESCE((payload->>'interior_enabled')::boolean, interior_enabled),
      exterior_enabled = COALESCE((payload->>'exterior_enabled')::boolean, exterior_enabled),
      int_ext_enabled = COALESCE((payload->>'int_ext_enabled')::boolean, int_ext_enabled),
      deep_clean_enabled = COALESCE((payload->>'deep_clean_enabled')::boolean, deep_clean_enabled),
      polish_enabled = COALESCE((payload->>'polish_enabled')::boolean, polish_enabled),
      cutter_polish_enabled = COALESCE((payload->>'cutter_polish_enabled')::boolean, cutter_polish_enabled),
      roof_cleaning_enabled = COALESCE((payload->>'roof_cleaning_enabled')::boolean, roof_cleaning_enabled),
      seat_cleaning_enabled = COALESCE((payload->>'seat_cleaning_enabled')::boolean, seat_cleaning_enabled),
      corporate_fleet_enabled = COALESCE((payload->>'corporate_fleet_enabled')::boolean, corporate_fleet_enabled),
      emergency_enabled = COALESCE((payload->>'emergency_enabled')::boolean, emergency_enabled),
      max_daily_capacity = COALESCE((payload->>'max_daily_capacity')::int, max_daily_capacity),
      max_active_partners = COALESCE((payload->>'max_active_partners')::int, max_active_partners),
      max_customers = COALESCE((payload->>'max_customers')::int, max_customers),
      max_services = COALESCE((payload->>'max_services')::int, max_services),
      assignment_radius_m = COALESCE((payload->>'assignment_radius_m')::int, assignment_radius_m),
      route_optimization_radius_m = COALESCE((payload->>'route_optimization_radius_m')::int, route_optimization_radius_m),
      travel_buffer_min = COALESCE((payload->>'travel_buffer_min')::int, travel_buffer_min),
      status = COALESCE(payload->>'status', status)
    WHERE id = rid;
  ELSE
    INSERT INTO public.coverage_zones (
      name, city, color, priority, zone_type,
      center_lat, center_lng, radius_m, polygon,
      daily_shine_enabled, premium_enabled, washing_enabled, interior_enabled,
      exterior_enabled, int_ext_enabled, deep_clean_enabled, polish_enabled,
      cutter_polish_enabled, roof_cleaning_enabled, seat_cleaning_enabled,
      corporate_fleet_enabled, emergency_enabled,
      max_daily_capacity, max_active_partners, max_customers, max_services,
      assignment_radius_m, route_optimization_radius_m, travel_buffer_min, status
    ) VALUES (
      payload->>'name', payload->>'city',
      COALESCE(payload->>'color','#3b82f6'),
      COALESCE((payload->>'priority')::int,10),
      payload->>'zone_type',
      (payload->>'center_lat')::double precision,
      (payload->>'center_lng')::double precision,
      (payload->>'radius_m')::int,
      payload->'polygon',
      COALESCE((payload->>'daily_shine_enabled')::boolean,false),
      COALESCE((payload->>'premium_enabled')::boolean,false),
      COALESCE((payload->>'washing_enabled')::boolean,false),
      COALESCE((payload->>'interior_enabled')::boolean,false),
      COALESCE((payload->>'exterior_enabled')::boolean,false),
      COALESCE((payload->>'int_ext_enabled')::boolean,false),
      COALESCE((payload->>'deep_clean_enabled')::boolean,false),
      COALESCE((payload->>'polish_enabled')::boolean,false),
      COALESCE((payload->>'cutter_polish_enabled')::boolean,false),
      COALESCE((payload->>'roof_cleaning_enabled')::boolean,false),
      COALESCE((payload->>'seat_cleaning_enabled')::boolean,false),
      COALESCE((payload->>'corporate_fleet_enabled')::boolean,false),
      COALESCE((payload->>'emergency_enabled')::boolean,false),
      (payload->>'max_daily_capacity')::int,
      (payload->>'max_active_partners')::int,
      (payload->>'max_customers')::int,
      (payload->>'max_services')::int,
      (payload->>'assignment_radius_m')::int,
      (payload->>'route_optimization_radius_m')::int,
      (payload->>'travel_buffer_min')::int,
      COALESCE(payload->>'status','active')
    ) RETURNING id INTO rid;
  END IF;
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.admin_zone_delete(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.coverage_zones WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_zone_duplicate(p_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.coverage_zones (
    name, city, color, priority, zone_type, center_lat, center_lng, radius_m, polygon,
    daily_shine_enabled, premium_enabled, washing_enabled, interior_enabled,
    exterior_enabled, int_ext_enabled, deep_clean_enabled, polish_enabled,
    cutter_polish_enabled, roof_cleaning_enabled, seat_cleaning_enabled,
    corporate_fleet_enabled, emergency_enabled,
    primary_team_id, backup_team_id,
    max_daily_capacity, max_active_partners, max_customers, max_services,
    assignment_radius_m, route_optimization_radius_m, travel_buffer_min, status
  )
  SELECT name || ' (copy)', city, color, priority, zone_type, center_lat, center_lng, radius_m, polygon,
    daily_shine_enabled, premium_enabled, washing_enabled, interior_enabled,
    exterior_enabled, int_ext_enabled, deep_clean_enabled, polish_enabled,
    cutter_polish_enabled, roof_cleaning_enabled, seat_cleaning_enabled,
    corporate_fleet_enabled, emergency_enabled,
    primary_team_id, backup_team_id,
    max_daily_capacity, max_active_partners, max_customers, max_services,
    assignment_radius_m, route_optimization_radius_m, travel_buffer_min, 'paused'
  FROM public.coverage_zones WHERE id = p_id
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_zone_set_status(p_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.coverage_zones SET status = p_status, updated_at = now() WHERE id = p_id;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_zone_upsert(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_zone_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_zone_duplicate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_zone_set_status(uuid,text) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.coverage_zones;
