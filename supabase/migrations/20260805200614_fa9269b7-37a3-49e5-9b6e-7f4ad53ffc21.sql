CREATE TABLE public.staff_login_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  role text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_login_otps_phone ON public.staff_login_otps (phone, role, created_at DESC);

GRANT ALL ON public.staff_login_otps TO service_role;

ALTER TABLE public.staff_login_otps ENABLE ROW LEVEL SECURITY;
