CREATE POLICY "Partners read customers for their services"
ON public.customers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.services s
    WHERE s.customer_id = customers.id
      AND s.partner_id = auth.uid()
      AND s.status IN ('pending','in_progress','unavailable','completed')
  )
);