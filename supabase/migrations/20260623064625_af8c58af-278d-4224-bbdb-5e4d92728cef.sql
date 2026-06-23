CREATE OR REPLACE FUNCTION public.ensure_staff_login_role(p_role public.app_role, p_full_name text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_phone text;
  v_expected_domain text;
  v_has_existing_admin boolean := false;
  v_has_same_phone_admin boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT lower(email), COALESCE(raw_user_meta_data->>'phone', regexp_replace(split_part(email, '@', 1), '\D', '', 'g'))
  INTO v_email, v_phone
  FROM auth.users
  WHERE id = v_uid;

  IF p_role = 'admin'::public.app_role THEN
    v_expected_domain := '@admin.urbanwash.app';
  ELSIF p_role = 'partner'::public.app_role THEN
    v_expected_domain := '@partner.urbanwash.app';
  ELSE
    RETURN false;
  END IF;

  IF v_email IS NULL OR right(v_email, length(v_expected_domain)) <> v_expected_domain THEN
    RETURN false;
  END IF;

  IF p_role = 'admin'::public.app_role THEN
    SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin'::public.app_role)
    INTO v_has_existing_admin;

    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN auth.users au ON au.id = ur.user_id
      WHERE ur.role = 'admin'::public.app_role
        AND COALESCE(au.raw_user_meta_data->>'phone', regexp_replace(split_part(au.email, '@', 1), '\D', '', 'g')) = v_phone
    ) INTO v_has_same_phone_admin;

    IF NOT v_has_existing_admin OR v_has_same_phone_admin THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (v_uid, 'admin'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
      RETURN true;
    END IF;

    RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role = 'admin'::public.app_role);
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'partner'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.partners (id, full_name, phone, email)
  VALUES (v_uid, NULLIF(trim(COALESCE(p_full_name, '')), ''), v_phone, v_email)
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(NULLIF(trim(COALESCE(EXCLUDED.full_name, '')), ''), public.partners.full_name),
    phone = COALESCE(EXCLUDED.phone, public.partners.phone),
    email = COALESCE(EXCLUDED.email, public.partners.email);

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_staff_login_role(public.app_role, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_staff_login_role(public.app_role, text) TO authenticated;