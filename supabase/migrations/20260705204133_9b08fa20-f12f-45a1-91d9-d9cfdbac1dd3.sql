
CREATE TABLE IF NOT EXISTS public.marketplace_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid REFERENCES public.marketplace_offers(id) ON DELETE CASCADE,
  broadcast_id uuid REFERENCES public.marketplace_broadcasts(id) ON DELETE CASCADE,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  stage text NOT NULL CHECK (stage IN (
    'push_sent','push_failed','push_delivered','push_update_sent',
    'opened','popup_displayed','accepted','declined','expired','superseded'
  )),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mp_delivery_offer_idx ON public.marketplace_delivery_events(offer_id, created_at);
CREATE INDEX IF NOT EXISTS mp_delivery_broadcast_idx ON public.marketplace_delivery_events(broadcast_id, created_at);
CREATE INDEX IF NOT EXISTS mp_delivery_partner_idx ON public.marketplace_delivery_events(partner_id, created_at);
CREATE INDEX IF NOT EXISTS mp_delivery_stage_idx ON public.marketplace_delivery_events(stage, created_at);

GRANT SELECT ON public.marketplace_delivery_events TO authenticated;
GRANT ALL ON public.marketplace_delivery_events TO service_role;

ALTER TABLE public.marketplace_delivery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mp delivery admin read"
  ON public.marketplace_delivery_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "mp delivery partner read own"
  ON public.marketplace_delivery_events FOR SELECT
  TO authenticated
  USING (partner_id = auth.uid());

-- Partners can log their own client-side delivery / open events.
CREATE POLICY "mp delivery partner insert own"
  ON public.marketplace_delivery_events FOR INSERT
  TO authenticated
  WITH CHECK (partner_id = auth.uid());

-- Rollup view for admin analytics
CREATE OR REPLACE VIEW public.marketplace_delivery_stats AS
SELECT
  broadcast_id,
  COUNT(*) FILTER (WHERE stage = 'push_sent') AS pushes_sent,
  COUNT(*) FILTER (WHERE stage = 'push_failed') AS pushes_failed,
  COUNT(*) FILTER (WHERE stage = 'push_delivered') AS pushes_delivered,
  COUNT(*) FILTER (WHERE stage = 'opened') AS opened,
  COUNT(*) FILTER (WHERE stage = 'accepted') AS accepted,
  COUNT(*) FILTER (WHERE stage = 'declined') AS declined,
  COUNT(*) FILTER (WHERE stage = 'expired') AS expired,
  MIN(created_at) AS first_event_at,
  MAX(created_at) AS last_event_at
FROM public.marketplace_delivery_events
GROUP BY broadcast_id;

GRANT SELECT ON public.marketplace_delivery_stats TO authenticated;
