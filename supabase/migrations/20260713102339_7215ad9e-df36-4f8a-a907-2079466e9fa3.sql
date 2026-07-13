
CREATE TABLE public.assignment_integrity_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id UUID,
  assignment_id UUID,
  mismatches TEXT[] NOT NULL DEFAULT '{}',
  todays_services INT NOT NULL DEFAULT 0,
  todays_customers INT NOT NULL DEFAULT 0,
  total_services INT NOT NULL DEFAULT 0,
  services_missing_customer INT NOT NULL DEFAULT 0,
  services_wrong_partner INT NOT NULL DEFAULT 0,
  source TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_aia_partner ON public.assignment_integrity_audit(partner_id, created_at DESC);
CREATE INDEX idx_aia_assignment ON public.assignment_integrity_audit(assignment_id, created_at DESC);

GRANT SELECT ON public.assignment_integrity_audit TO authenticated;
GRANT ALL ON public.assignment_integrity_audit TO service_role;

ALTER TABLE public.assignment_integrity_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view integrity audit"
ON public.assignment_integrity_audit
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
