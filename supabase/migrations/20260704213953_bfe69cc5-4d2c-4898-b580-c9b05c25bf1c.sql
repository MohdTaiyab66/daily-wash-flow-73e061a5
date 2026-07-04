CREATE OR REPLACE FUNCTION public.polygon_contains_point(
  p_polygon jsonb,
  p_lat double precision,
  p_lng double precision
) RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE PARALLEL SAFE
SET search_path TO 'public'
AS $function$
DECLARE
  n int;
  i int := 0;
  j int;
  inside boolean := false;
  xi double precision; yi double precision;
  xj double precision; yj double precision;
  dx double precision; dy double precision;
  len2 double precision;
  t  double precision;
  px double precision; py double precision;
  eps constant double precision := 1e-9;
BEGIN
  -- Boundary rule: points on an edge or vertex are treated as INSIDE.
  -- The classic ray cast is ambiguous on the boundary; the explicit edge
  -- check below makes behaviour deterministic. Epsilon ~1e-9 deg (~0.1 mm).
  IF p_polygon IS NULL OR jsonb_typeof(p_polygon) <> 'array' THEN RETURN false; END IF;
  n := jsonb_array_length(p_polygon);
  IF n < 3 THEN RETURN false; END IF;
  j := n - 1;
  WHILE i < n LOOP
    xi := (p_polygon->i->>0)::double precision;
    yi := (p_polygon->i->>1)::double precision;
    xj := (p_polygon->j->>0)::double precision;
    yj := (p_polygon->j->>1)::double precision;

    dx := xj - xi;
    dy := yj - yi;
    len2 := dx * dx + dy * dy;
    IF len2 < eps * eps THEN
      IF abs(p_lng - xi) < eps AND abs(p_lat - yi) < eps THEN RETURN true; END IF;
    ELSE
      t := ((p_lng - xi) * dx + (p_lat - yi) * dy) / len2;
      IF t >= -eps AND t <= 1 + eps THEN
        px := xi + t * dx;
        py := yi + t * dy;
        IF abs(p_lng - px) < eps AND abs(p_lat - py) < eps THEN RETURN true; END IF;
      END IF;
    END IF;

    IF ((yi > p_lat) <> (yj > p_lat))
       AND (p_lng < (xj - xi) * (p_lat - yi) / NULLIF((yj - yi), 0) + xi) THEN
      inside := NOT inside;
    END IF;
    j := i;
    i := i + 1;
  END LOOP;
  RETURN inside;
END $function$;

DO $$
DECLARE
  poly_a jsonb := '[[80.98,26.84],[81.00,26.84],[81.00,26.86],[80.98,26.86]]'::jsonb;
  poly_b jsonb := '[[80.93,26.84],[80.96,26.84],[80.96,26.86],[80.93,26.86]]'::jsonb;
  poly_c jsonb := '[[80.985,26.845],[80.995,26.845],[80.995,26.855],[80.985,26.855]]'::jsonb;
  poly_d jsonb := '[[80.90,26.79],[80.93,26.79],[80.93,26.81],[80.90,26.81]]'::jsonb;
BEGIN
  DELETE FROM public.coverage_zones WHERE name LIKE 'Sample:%';

  INSERT INTO public.coverage_zones
    (name, city, color, priority, zone_type, status, polygon,
     daily_shine_enabled, premium_enabled, washing_enabled, interior_enabled,
     exterior_enabled, int_ext_enabled, deep_clean_enabled, polish_enabled,
     cutter_polish_enabled, roof_cleaning_enabled, seat_cleaning_enabled,
     corporate_fleet_enabled, emergency_enabled)
  VALUES
    ('Sample: Gomti Square', 'Lucknow', '#22c55e', 10, 'polygon', 'active', poly_a,
      true,true,true,true,true,true,true,true,true,true,true,true,true),
    ('Sample: Hazratganj Square', 'Lucknow', '#3b82f6', 10, 'polygon', 'active', poly_b,
      true,true,true,true,true,true,true,true,true,true,true,true,true),
    ('Sample: Gomti Premium Overlay', 'Lucknow', '#a855f7', 20, 'polygon', 'active', poly_c,
      false,true,false,false,false,false,false,false,false,false,false,false,false),
    ('Sample: Alambagh Coming Soon', 'Lucknow', '#f97316', 10, 'polygon', 'coming_soon', poly_d,
      false,false,false,false,false,false,false,false,false,false,false,false,false);

  INSERT INTO public.coverage_zones
    (name, city, color, priority, zone_type, status,
     center_lat, center_lng, radius_m,
     daily_shine_enabled, premium_enabled, washing_enabled, interior_enabled,
     exterior_enabled, int_ext_enabled, deep_clean_enabled, polish_enabled,
     cutter_polish_enabled, roof_cleaning_enabled, seat_cleaning_enabled,
     corporate_fleet_enabled, emergency_enabled)
  VALUES
    ('Sample: Chinhat Radius 3km', 'Lucknow', '#0ea5e9', 5, 'radius', 'active',
      26.867, 81.030, 3000,
      true,true,true,true,true,true,true,true,true,true,true,true,true);
END $$;