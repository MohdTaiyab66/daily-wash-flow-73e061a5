ALTER TABLE public.dirty_vehicle_reports
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS lat numeric,
  ADD COLUMN IF NOT EXISTS lng numeric,
  ADD COLUMN IF NOT EXISTS captured_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS recommendation text NOT NULL DEFAULT 'premium_or_included_wash';

UPDATE public.dirty_vehicle_reports d
SET customer_id = s.customer_id
FROM public.services s
WHERE d.service_id = s.id
  AND d.customer_id IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dirty_vehicle_reports TO authenticated;
GRANT ALL ON public.dirty_vehicle_reports TO service_role;

DROP POLICY IF EXISTS "partner rw own dirty reports" ON public.dirty_vehicle_reports;
CREATE POLICY "dirty reports: partner create own"
ON public.dirty_vehicle_reports
FOR INSERT
TO authenticated
WITH CHECK (partner_id = auth.uid());

CREATE POLICY "dirty reports: partner admin read"
ON public.dirty_vehicle_reports
FOR SELECT
TO authenticated
USING (partner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "dirty reports: partner update own"
ON public.dirty_vehicle_reports
FOR UPDATE
TO authenticated
USING (partner_id = auth.uid())
WITH CHECK (partner_id = auth.uid());