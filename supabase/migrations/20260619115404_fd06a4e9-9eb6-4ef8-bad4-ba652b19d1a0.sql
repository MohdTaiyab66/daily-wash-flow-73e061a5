
-- 1) Remove old overload of admin_update_customer (PostgREST cannot choose between two — Save silently fails)
DROP FUNCTION IF EXISTS public.admin_update_customer(
  uuid, text, text, text, text, text, numeric, numeric, text, date, date, text, text, boolean, integer
);

-- 2) Payment status on customers (paid / pending)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_payment_status_chk;
ALTER TABLE public.customers
  ADD CONSTRAINT customers_payment_status_chk CHECK (payment_status IN ('paid','pending'));

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Admin RPC to toggle payment status
CREATE OR REPLACE FUNCTION public.admin_set_customer_payment(p_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('paid','pending') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  UPDATE public.customers
    SET payment_status = p_status,
        paid_at = CASE WHEN p_status = 'paid' THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_customer_payment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_customer_payment(uuid, text) TO authenticated, service_role;

-- 3) Revenue summary RPC for admin
CREATE OR REPLACE FUNCTION public.admin_revenue_summary()
RETURNS TABLE(
  total_customers int,
  active_customers int,
  expected_revenue numeric,
  paid_revenue numeric,
  pending_revenue numeric,
  paid_count int,
  pending_count int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cust AS (
    SELECT c.id, c.payment_status, c.is_active,
           COALESCE((SELECT SUM(v.package_amount) FROM public.vehicles v WHERE v.customer_id = c.id), 0)::numeric AS amount
    FROM public.customers c
  )
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE is_active)::int,
    COALESCE(SUM(amount),0),
    COALESCE(SUM(amount) FILTER (WHERE payment_status='paid'),0),
    COALESCE(SUM(amount) FILTER (WHERE payment_status='pending'),0),
    COUNT(*) FILTER (WHERE payment_status='paid')::int,
    COUNT(*) FILTER (WHERE payment_status='pending')::int
  FROM cust;
$$;

REVOKE ALL ON FUNCTION public.admin_revenue_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revenue_summary() TO authenticated, service_role;

-- Per-customer breakdown
CREATE OR REPLACE FUNCTION public.admin_revenue_customers()
RETURNS TABLE(
  id uuid,
  full_name text,
  area text,
  payment_status text,
  paid_at timestamptz,
  amount numeric,
  subscription_end date,
  is_active boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.full_name, c.area, c.payment_status, c.paid_at,
         COALESCE((SELECT SUM(v.package_amount) FROM public.vehicles v WHERE v.customer_id = c.id), 0)::numeric,
         c.subscription_end, c.is_active
  FROM public.customers c
  ORDER BY c.payment_status DESC, c.full_name ASC;
$$;

REVOKE ALL ON FUNCTION public.admin_revenue_customers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revenue_customers() TO authenticated, service_role;

-- 4) Parking RPC: mark service unavailable when parking blocks completion (so partner is unblocked)
CREATE OR REPLACE FUNCTION public.submit_parking_issue(
  p_service_id uuid,
  p_reason text,
  p_notes text,
  p_photo text,
  p_lat numeric,
  p_lng numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner uuid := auth.uid();
  v_result jsonb;
BEGIN
  INSERT INTO public.parking_reports(service_id, partner_id, reason, notes, photo_path)
  VALUES (p_service_id, v_partner, p_reason, NULLIF(p_notes,''), p_photo);

  -- Mark service unavailable and credit ₹12 via existing function
  SELECT public.submit_service_unavailable(
    p_service_id,
    'parking_locked',
    COALESCE(NULLIF(p_notes,''), p_reason),
    p_photo,
    p_lat,
    p_lng
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_parking_issue(uuid, text, text, text, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_parking_issue(uuid, text, text, text, numeric, numeric) TO authenticated, service_role;
