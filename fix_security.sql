-- Security Fixes based on Data Source Audit and Forensic Review

-- 1. Ensure user_roles has proper structure and RLS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'partner', 'customer', 'user');
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role public.app_role NOT NULL,
    UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2. Security Definer Function for role checks (Prevents recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

-- 3. Payment Verification Security: ensure verify_razorpay_payment (or similar) is locked down
-- The existing activate_paid_booking RPC should already be SECURITY DEFINER if it touches sensitive tables.

-- 4. RLS for sensitive logs
ALTER TABLE IF EXISTS public.payment_attempts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.payment_attempts TO authenticated;
GRANT ALL ON public.payment_attempts TO service_role;

DROP POLICY IF EXISTS "Users can view their own payment attempts" ON public.payment_attempts;
CREATE POLICY "Users can view their own payment attempts"
ON public.payment_attempts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all payment attempts" ON public.payment_attempts;
CREATE POLICY "Admins can view all payment attempts"
ON public.payment_attempts
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 5. RLS for staff_login_otps (Very sensitive)
ALTER TABLE IF EXISTS public.staff_login_otps ENABLE ROW LEVEL SECURITY;
-- No grants to authenticated/anon - only service_role (server functions) should touch this.
GRANT ALL ON public.staff_login_otps TO service_role;

