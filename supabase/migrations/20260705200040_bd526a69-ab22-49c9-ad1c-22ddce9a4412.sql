
-- 1. Marketplace notification settings columns
ALTER TABLE public.marketplace_settings
  ADD COLUMN IF NOT EXISTS notification_sound TEXT NOT NULL DEFAULT 'uw_offer',
  ADD COLUMN IF NOT EXISTS vibration_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS heads_up_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS full_screen_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS countdown_seconds INT NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS notification_priority TEXT NOT NULL DEFAULT 'max'
    CHECK (notification_priority IN ('high','max'));

-- 2. Signed action tokens for accept/decline from notification
CREATE TABLE IF NOT EXISTS public.push_action_tokens (
  token TEXT PRIMARY KEY,
  partner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broadcast_id UUID NOT NULL REFERENCES public.marketplace_broadcasts(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES public.marketplace_offers(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '3 minutes'),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.push_action_tokens TO authenticated;
GRANT ALL ON public.push_action_tokens TO service_role;

ALTER TABLE public.push_action_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners view own action tokens"
  ON public.push_action_tokens
  FOR SELECT
  TO authenticated
  USING (partner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_pat_partner ON public.push_action_tokens(partner_id);
CREATE INDEX IF NOT EXISTS idx_pat_expires ON public.push_action_tokens(expires_at);

-- 3. Mint token (service-role only; called by push dispatcher)
CREATE OR REPLACE FUNCTION public.mp_mint_action_token(
  p_offer_id UUID,
  p_broadcast_id UUID,
  p_partner_id UUID
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := encode(gen_random_bytes(24), 'base64');
  v_token := replace(replace(replace(v_token, '+', '-'), '/', '_'), '=', '');
  INSERT INTO public.push_action_tokens (token, partner_id, broadcast_id, offer_id)
  VALUES (v_token, p_partner_id, p_broadcast_id, p_offer_id);
  RETURN v_token;
END;
$$;

-- 4. Consume token + perform action (public endpoint calls this)
CREATE OR REPLACE FUNCTION public.mp_consume_action_token(
  p_token TEXT,
  p_action TEXT   -- 'accept' | 'decline'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.push_action_tokens%ROWTYPE;
  v_result JSONB;
BEGIN
  SELECT * INTO v_row FROM public.push_action_tokens
    WHERE token = p_token
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
  END IF;
  IF v_row.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_used');
  END IF;
  IF v_row.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  UPDATE public.push_action_tokens
     SET consumed_at = now()
   WHERE token = p_token;

  IF p_action = 'accept' THEN
    -- Impersonate the partner: mp_accept_offer reads auth.uid(), so we
    -- perform the write directly here to avoid session juggling.
    PERFORM set_config('request.jwt.claim.sub', v_row.partner_id::text, true);
    v_result := (SELECT public.mp_accept_offer(v_row.broadcast_id));
  ELSIF p_action = 'decline' THEN
    PERFORM set_config('request.jwt.claim.sub', v_row.partner_id::text, true);
    v_result := (SELECT public.mp_decline_offer(v_row.broadcast_id));
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_action');
  END IF;

  RETURN COALESCE(v_result, jsonb_build_object('ok', true));
END;
$$;

REVOKE ALL ON FUNCTION public.mp_consume_action_token(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mp_consume_action_token(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.mp_mint_action_token(UUID, UUID, UUID) TO service_role;
