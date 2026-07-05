-- Fix polygon coverage availability so customer serviceability is based on
-- admin-enabled zones, not current partner capacity.

CREATE OR REPLACE FUNCTION public.polygon_contains_point(
  p_polygon jsonb,
  p_lat double precision,
  p_lng double precision
) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
DECLARE
  n int;
  i int := 0;
  j int;
  inside boolean := false;
  xi double precision; yi double precision;
  xj double precision; yj double precision;
  px double precision := p_lng;
  py double precision := p_lat;
  v_cross double precision;
  eps double precision := 1e-9;
BEGIN
  IF p_polygon IS NULL OR jsonb_typeof(p_polygon) <> 'array' THEN
    RETURN false;
  END IF;

  n := jsonb_array_length(p_polygon);
  IF n < 3 THEN
    RETURN false;
  END IF;

  j := n - 1;
  WHILE i < n LOOP
    xi := (p_polygon->i->>0)::double precision;  -- lng / x
    yi := (p_polygon->i->>1)::double precision;  -- lat / y
    xj := (p_polygon->j->>0)::double precision;
    yj := (p_polygon->j->>1)::double precision;

    -- Boundary-inclusive rule: vertices and points on edges are serviceable.
    v_cross := (px - xi) * (yj - yi) - (py - yi) * (xj - xi);
    IF abs(v_cross) <= eps
       AND px BETWEEN LEAST(xi, xj) - eps AND GREATEST(xi, xj) + eps
       AND py BETWEEN LEAST(yi, yj) - eps AND GREATEST(yi, yj) + eps THEN
      RETURN true;
    END IF;

    -- Standard ray-cast for strict interior points.
    IF ((yi > py) <> (yj > py))
       AND (px < (xj - xi) * (py - yi) / NULLIF((yj - yi), 0) + xi) THEN
      inside := NOT inside;
    END IF;

    j := i;
    i := i + 1;
  END LOOP;

  RETURN inside;
END $$;

CREATE OR REPLACE FUNCTION public.get_coverage_at(p_lat double precision, p_lng double precision)
RETURNS TABLE(
  matched boolean,
  status text,
  zone_id uuid,
  zone_name text,
  daily_shine boolean,
  premium boolean,
  washing boolean,
  interior boolean,
  exterior boolean,
  int_ext boolean,
  deep_clean boolean,
  polish boolean,
  cutter_polish boolean,
  roof_cleaning boolean,
  seat_cleaning boolean,
  corporate_fleet boolean,
  emergency boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  z record;
  m record;
BEGIN
  SELECT * INTO z
  FROM public.coverage_zones cz
  WHERE cz.status IN ('active','paused')
    AND (cz.bbox_min_lat IS NULL OR p_lat BETWEEN cz.bbox_min_lat AND cz.bbox_max_lat)
    AND (cz.bbox_min_lng IS NULL OR p_lng BETWEEN cz.bbox_min_lng AND cz.bbox_max_lng)
    AND (
      (
        cz.zone_type = 'polygon'
        AND cz.polygon IS NOT NULL
        AND public.polygon_contains_point(cz.polygon, p_lat, p_lng)
      )
      OR (
        cz.zone_type = 'radius'
        AND cz.center_lat IS NOT NULL
        AND cz.center_lng IS NOT NULL
        AND cz.radius_m IS NOT NULL
        AND 6371000 * 2 * asin(sqrt(
          sin(radians((p_lat - cz.center_lat) / 2)) ^ 2
          + cos(radians(cz.center_lat)) * cos(radians(p_lat))
            * sin(radians((p_lng - cz.center_lng) / 2)) ^ 2
        )) <= cz.radius_m
      )
    )
  ORDER BY cz.priority DESC,
           cz.updated_at DESC NULLS LAST,
           cz.created_at DESC NULLS LAST,
           cz.id DESC
  LIMIT 1;

  IF z.id IS NULL THEN
    matched := false;
    status := null;
    zone_id := null;
    zone_name := null;
    daily_shine := false;
    premium := false;
    washing := false;
    interior := false;
    exterior := false;
    int_ext := false;
    deep_clean := false;
    polish := false;
    cutter_polish := false;
    roof_cleaning := false;
    seat_cleaning := false;
    corporate_fleet := false;
    emergency := false;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO m FROM public.zone_calendar_mask(z.id, CURRENT_DATE);

  matched := true;
  status := z.status;
  zone_id := z.id;
  zone_name := z.name;

  -- Area availability means the admin has enabled the service in an active
  -- zone. Partner capacity is handled separately by assignment/operations;
  -- zero current capacity must not make the customer app say the area is not
  -- serviceable after an admin draws a valid Daily Shine polygon.
  daily_shine := z.daily_shine_enabled AND z.status = 'active' AND COALESCE(m.daily_shine_on, true);
  premium := z.premium_enabled AND z.status = 'active' AND COALESCE(m.premium_on, true);
  washing := z.washing_enabled AND premium;
  interior := z.interior_enabled AND premium;
  exterior := z.exterior_enabled AND premium;
  int_ext := z.int_ext_enabled AND premium;
  deep_clean := z.deep_clean_enabled AND premium;
  polish := z.polish_enabled AND premium;
  cutter_polish := z.cutter_polish_enabled AND premium;
  roof_cleaning := z.roof_cleaning_enabled AND premium;
  seat_cleaning := z.seat_cleaning_enabled AND premium;
  corporate_fleet := z.corporate_fleet_enabled AND premium;
  emergency := z.emergency_enabled AND premium;

  RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.assert_serviceable(
  p_lat double precision,
  p_lng double precision,
  p_slug text
) RETURNS uuid
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  c record;
  ok boolean;
  v_slug text := lower(coalesce(p_slug, ''));
BEGIN
  SELECT * INTO c FROM public.get_coverage_at(p_lat, p_lng);

  IF NOT COALESCE(c.matched, false) THEN
    RAISE EXCEPTION 'Not serviceable at this location' USING ERRCODE = 'P0001';
  END IF;

  IF v_slug LIKE 'daily-shine%' OR v_slug = 'daily_shine' THEN
    ok := c.daily_shine;
  ELSIF v_slug IN ('premium', 'one-time-wash-premium') THEN
    ok := c.premium;
  ELSIF v_slug IN ('washing', 'one-time-wash', 'one-time-wash-basic', 'one-time-wash-no-polish') THEN
    ok := c.washing;
  ELSIF v_slug IN ('interior', 'interior-deep-clean') THEN
    ok := c.interior OR c.deep_clean;
  ELSIF v_slug IN ('exterior') THEN
    ok := c.exterior;
  ELSIF v_slug IN ('int-ext', 'int-ext-wash') THEN
    ok := c.int_ext;
  ELSIF v_slug IN ('deep-clean', 'deep-clean-interior') THEN
    ok := c.deep_clean;
  ELSIF v_slug IN ('polish', 'body-polish', 'buffing-polish') THEN
    ok := c.polish;
  ELSIF v_slug = 'cutter-polish' THEN
    ok := c.cutter_polish;
  ELSIF v_slug = 'roof-cleaning' THEN
    ok := c.roof_cleaning;
  ELSIF v_slug = 'seat-cleaning' THEN
    ok := c.seat_cleaning;
  ELSIF v_slug = 'corporate-fleet' THEN
    ok := c.corporate_fleet;
  ELSIF v_slug = 'emergency' THEN
    ok := c.emergency;
  ELSE
    ok := c.premium;
  END IF;

  IF NOT COALESCE(ok, false) THEN
    RAISE EXCEPTION '% is not enabled in %', p_slug, coalesce(c.zone_name, 'this area') USING ERRCODE = 'P0001';
  END IF;

  RETURN c.zone_id;
END $$;

GRANT EXECUTE ON FUNCTION public.polygon_contains_point(jsonb, double precision, double precision) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_coverage_at(double precision, double precision) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_serviceable(double precision, double precision, text) TO anon, authenticated, service_role;