-- Security Linter Fixes (2026-08-12)

-- 1. Revoke EXECUTE from public on SECURITY DEFINER functions
-- This addresses Warn 12, 13, 14 etc.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
-- We also grant to authenticated if we want users to be able to use it in their own RLS policies (which they do)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Ensure staff_login_otps has NO grants to public
REVOKE ALL ON public.staff_login_otps FROM public, anon, authenticated;
GRANT ALL ON public.staff_login_otps TO service_role;

-- 2. Fix search_path for common functions if they are missing it
-- Note: our has_role already has it.

-- 3. Ensure user_roles has a policy for the 'authenticated' role to avoid INFO 1 (RLS Enabled No Policy)
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
