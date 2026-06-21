
-- Bootstrap function: if no admin exists in user_roles, the first authenticated caller
-- becomes admin. Once an admin exists, this function is a no-op.
CREATE OR REPLACE FUNCTION public.claim_admin_if_empty()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_has_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO v_has_admin;
  IF v_has_admin THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_admin_if_empty() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_admin_if_empty() TO authenticated;
