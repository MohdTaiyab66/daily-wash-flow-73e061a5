
CREATE TABLE public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'razorpay',
  provider_order_id text,
  provider_payment_id text,
  channel text NOT NULL CHECK (channel IN ('native','web','unknown')),
  outcome text NOT NULL CHECK (outcome IN ('started','success','failure','cancelled','retry','timeout')),
  attempt_no int NOT NULL DEFAULT 1,
  error_code text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_attempts_booking_created_idx ON public.payment_attempts (booking_id, created_at DESC);
CREATE INDEX payment_attempts_user_created_idx ON public.payment_attempts (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.payment_attempts TO authenticated;
GRANT ALL ON public.payment_attempts TO service_role;

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payment attempts"
  ON public.payment_attempts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own payment attempts"
  ON public.payment_attempts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all payment attempts"
  ON public.payment_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
