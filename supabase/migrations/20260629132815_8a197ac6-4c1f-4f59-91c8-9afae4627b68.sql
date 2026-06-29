
CREATE OR REPLACE FUNCTION public.submit_partner_expansion_request(
  p_area_name text,
  p_latitude double precision,
  p_longitude double precision,
  p_vehicle text DEFAULT NULL,
  p_experience_years integer DEFAULT NULL,
  p_preferred_cars_per_day integer DEFAULT NULL,
  p_expected_joining_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_name text;
  v_phone text;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_area_name IS NULL OR length(trim(p_area_name)) = 0 THEN
    RAISE EXCEPTION 'Area name is required';
  END IF;

  SELECT full_name, phone INTO v_name, v_phone
  FROM public.partners WHERE id = v_user;

  INSERT INTO public.partner_expansion_requests(
    partner_user_id, full_name, phone, area_name, latitude, longitude,
    vehicle, experience_years, preferred_cars_per_day, expected_joining_date, notes, status
  ) VALUES (
    v_user, COALESCE(v_name,''), COALESCE(v_phone,''), trim(p_area_name),
    p_latitude, p_longitude, p_vehicle, p_experience_years,
    p_preferred_cars_per_day, p_expected_joining_date, p_notes, 'pending'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_partner_expansion_request(text,double precision,double precision,text,integer,integer,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_partner_expansion_request(text,double precision,double precision,text,integer,integer,date,text) TO authenticated;
