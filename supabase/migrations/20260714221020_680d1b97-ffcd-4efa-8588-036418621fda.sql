CREATE TABLE public.customer_saved_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  base_plan_slug text NOT NULL,
  base_plan_price numeric NOT NULL DEFAULT 0,
  addons jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_monthly numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_saved_packages_user ON public.customer_saved_packages(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_saved_packages TO authenticated;
GRANT ALL ON public.customer_saved_packages TO service_role;

ALTER TABLE public.customer_saved_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own saved packages"
  ON public.customer_saved_packages
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.tg_customer_saved_packages_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_customer_saved_packages_updated_at
  BEFORE UPDATE ON public.customer_saved_packages
  FOR EACH ROW EXECUTE FUNCTION public.tg_customer_saved_packages_updated_at();