CREATE OR REPLACE FUNCTION public.set_updated_at_now()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE public.subscription_monthly_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  addon_type TEXT NOT NULL CHECK (addon_type IN ('extra_exterior','extra_interior','extra_both')),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  monthly_price INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sub_monthly_addons_sub ON public.subscription_monthly_addons(subscription_id) WHERE is_active;
CREATE INDEX idx_sub_monthly_addons_user ON public.subscription_monthly_addons(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_monthly_addons TO authenticated;
GRANT ALL ON public.subscription_monthly_addons TO service_role;

ALTER TABLE public.subscription_monthly_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monthly_addons: customer manage own"
ON public.subscription_monthly_addons
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "monthly_addons: admin manage all"
ON public.subscription_monthly_addons
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_sub_monthly_addons_updated_at
BEFORE UPDATE ON public.subscription_monthly_addons
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();