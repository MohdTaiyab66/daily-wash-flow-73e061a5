/**
 * Client-side helper to log marketplace notification lifecycle events into
 * `marketplace_delivery_events`. Runs from the partner web/native app so
 * admins can see delivery / open / acceptance conversion.
 *
 * All calls are best-effort — a tracking failure must never block the UI.
 */
import { supabase } from "@/integrations/supabase/client";

type Stage =
  | "push_delivered"
  | "opened"
  | "popup_displayed"
  | "accepted"
  | "declined"
  | "expired"
  | "superseded";

export async function logMarketplaceEvent(input: {
  offerId: string;
  broadcastId?: string | null;
  partnerId?: string | null;
  stage: Stage;
  meta?: Record<string, unknown>;
}) {
  try {
    let partnerId = input.partnerId ?? null;
    if (!partnerId) {
      const { data } = await supabase.auth.getUser();
      partnerId = data.user?.id ?? null;
    }
    if (!partnerId) return;
    await (supabase as any).from("marketplace_delivery_events").insert({
      offer_id: input.offerId,
      broadcast_id: input.broadcastId ?? null,
      partner_id: partnerId,
      stage: input.stage,
      meta: input.meta ?? {},
    });
  } catch {
    /* noop */
  }
}
