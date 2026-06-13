
CREATE TABLE IF NOT EXISTS public.subscription_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  days INTEGER NOT NULL CHECK (days <> 0),
  reason TEXT NOT NULL,
  previous_end DATE NOT NULL,
  new_end DATE NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.subscription_extensions TO authenticated;
GRANT ALL ON public.subscription_extensions TO service_role;

ALTER TABLE public.subscription_extensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage extensions" ON public.subscription_extensions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_subscription_extensions_customer ON public.subscription_extensions(customer_id, created_at DESC);

-- Admin RPC to extend a customer's subscription
CREATE OR REPLACE FUNCTION public.admin_extend_customer(
  p_customer_id UUID,
  p_days INTEGER,
  p_reason TEXT
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev DATE;
  v_new DATE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_days = 0 THEN RAISE EXCEPTION 'Days must be non-zero'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  SELECT subscription_end INTO v_prev FROM public.customers WHERE id = p_customer_id;
  IF v_prev IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF;

  v_new := v_prev + p_days;

  UPDATE public.customers
    SET subscription_end = v_new,
        is_active = CASE WHEN v_new >= CURRENT_DATE THEN true ELSE is_active END,
        updated_at = now()
    WHERE id = p_customer_id;

  INSERT INTO public.subscription_extensions(customer_id, days, reason, previous_end, new_end, created_by)
  VALUES (p_customer_id, p_days, p_reason, v_prev, v_new, auth.uid());

  RETURN jsonb_build_object('ok', true, 'previous_end', v_prev, 'new_end', v_new);
END $$;

-- Photo cleanup function (deletes storage + db rows older than 7 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_service_photos()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paths text[];
  v_deleted int;
BEGIN
  SELECT array_agg(storage_path) INTO v_paths
    FROM public.service_photos
    WHERE captured_at < now() - INTERVAL '7 days';

  IF v_paths IS NOT NULL THEN
    DELETE FROM storage.objects
      WHERE bucket_id = 'service-photos' AND name = ANY(v_paths);
  END IF;

  DELETE FROM public.service_photos WHERE captured_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('deleted', v_deleted, 'at', now());
END $$;
