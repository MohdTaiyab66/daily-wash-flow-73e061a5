
CREATE TABLE IF NOT EXISTS public.checkout_holds (
  booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  holder_id text NOT NULL,
  reason text NOT NULL DEFAULT 'checkout',
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

GRANT SELECT ON public.checkout_holds TO authenticated;
GRANT ALL ON public.checkout_holds TO service_role;

ALTER TABLE public.checkout_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ch_self_select" ON public.checkout_holds;
CREATE POLICY "ch_self_select" ON public.checkout_holds
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.acquire_checkout_hold(
  p_booking_id uuid,
  p_holder_id text,
  p_ttl_seconds integer DEFAULT 300,
  p_reason text DEFAULT 'checkout'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
  v_status text;
  v_existing public.checkout_holds%ROWTYPE;
  v_ttl integer := greatest(30, least(coalesce(p_ttl_seconds, 300), 900));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT user_id, payment_status INTO v_owner, v_status
  FROM public.bookings WHERE id = p_booking_id;
  IF v_owner IS NULL OR v_owner <> v_user THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;
  IF v_status = 'paid' THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'already_paid');
  END IF;

  DELETE FROM public.checkout_holds WHERE expires_at < now();

  SELECT * INTO v_existing FROM public.checkout_holds
  WHERE booking_id = p_booking_id FOR UPDATE;

  IF v_existing.booking_id IS NOT NULL AND v_existing.holder_id <> p_holder_id THEN
    RETURN jsonb_build_object(
      'acquired', false,
      'reason', 'held',
      'expires_at', v_existing.expires_at
    );
  END IF;

  INSERT INTO public.checkout_holds (booking_id, user_id, holder_id, reason, acquired_at, expires_at)
  VALUES (p_booking_id, v_user, p_holder_id, coalesce(p_reason, 'checkout'), now(), now() + make_interval(secs => v_ttl))
  ON CONFLICT (booking_id) DO UPDATE
    SET holder_id = excluded.holder_id,
        reason = excluded.reason,
        acquired_at = now(),
        expires_at = excluded.expires_at;

  RETURN jsonb_build_object('acquired', true, 'expires_at', now() + make_interval(secs => v_ttl));
END;
$$;

CREATE OR REPLACE FUNCTION public.release_checkout_hold(
  p_booking_id uuid,
  p_holder_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  DELETE FROM public.checkout_holds
  WHERE booking_id = p_booking_id
    AND user_id = v_user
    AND holder_id = p_holder_id;
  RETURN jsonb_build_object('released', true);
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_checkout_hold(uuid, text, integer, text) FROM public;
REVOKE ALL ON FUNCTION public.release_checkout_hold(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.acquire_checkout_hold(uuid, text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_checkout_hold(uuid, text) TO authenticated, service_role;
