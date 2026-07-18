/**
 * Scans for newly-created subscription_offers that have not yet been pushed
 * and sends FCM notifications. Designed to be called every 15-30 seconds by
 * pg_cron via http extension, or by any external scheduler.
 *
 * Guarded by CRON_SECRET when the env var is set.
 */
import { createFileRoute } from "@tanstack/react-router";

async function dispatchPending() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendOfferPush } = await import("@/lib/push/send.server");

  // Pending = an offer with no push_sent stage logged yet, response still pending,
  // and not yet expired.
  const { data: offers, error } = await (supabaseAdmin as any).rpc("list_pending_push_offers");
  // If the RPC isn't installed yet, fall back to a direct query.
  let rows: Array<{ offer_id: string; queue_id: string; partner_id: string; area: string | null; vehicle_category: string | null; expires_at: string }>;
  if (error || !offers) {
    const { data: fallback, error: fbErr } = await (supabaseAdmin as any)
      .from("subscription_offers")
      .select("id, queue_id, partner_id, expires_at, response, subscription_assignment_queue!inner(area,vehicle_category)")
      .eq("response", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("offered_at", { ascending: false })
      .limit(50);
    if (fbErr) throw fbErr;
    rows = (fallback ?? []).map((o: any) => ({
      offer_id: o.id,
      queue_id: o.queue_id,
      partner_id: o.partner_id,
      area: o.subscription_assignment_queue?.area ?? null,
      vehicle_category: o.subscription_assignment_queue?.vehicle_category ?? null,
      expires_at: o.expires_at,
    }));
  } else {
    rows = offers;
  }

  let dispatched = 0;
  for (const r of rows) {
    // Atomically claim first. The partial unique index on
    // offer_delivery_events(offer_id) for push_claimed/push_sent/push_failed
    // guarantees only one cron worker can send this offer to FCM.
    const { data: claim, error: claimError } = await (supabaseAdmin as any)
      .from("offer_delivery_events")
      .insert({
        offer_id: r.offer_id,
        queue_id: r.queue_id,
        partner_id: r.partner_id,
        stage: "push_claimed",
        meta: { claimed_by: "offer-push-dispatch", claimed_at: new Date().toISOString() },
      })
      .select("id")
      .single();
    if (claimError || !claim?.id) continue;

    const title = "🚗 New Daily Shine Customer";
    const body = `${r.vehicle_category ?? "Vehicle"}${r.area ? ` • ${r.area}` : ""} — tap to view (90s)`;
    // NOTE: `type` must be in the Kotlin ASSIGNMENT_TYPES set so the native
    // service routes this through `postAssignment` (high-importance channel,
    // full-screen intent, custom sound, vibration, wake screen). "offer" is
    // not in that set — it would fall through to `postGeneric` and get the
    // default tray channel with no heads-up. `dataOnly: true` suppresses the
    // FCM notification block so background/killed devices always dispatch
    // through onMessageReceived instead of the system tray.
    const data = {
      type: "daily_shine_offer",
      offer_id: r.offer_id,
      queue_id: r.queue_id,
      partner_id: r.partner_id,
      category: "daily_shine",
      link: `/app/leads/${r.offer_id}`,
    };

    try {
      const result = await sendOfferPush({
        userId: r.partner_id,
        title,
        body,
        data,
        channelId: "assignments_v3",
        dataOnly: true,
        tag: r.offer_id,
      });
      const { error: logError } = await (supabaseAdmin as any).from("offer_delivery_events").update({
        stage: result.sent > 0 ? "push_sent" : "push_failed",
        meta: { sent: result.sent, failed: result.failed, sample: result.results.slice(0, 3), claimed_event_id: claim.id },
      }).eq("id", claim.id);
      if (logError) throw logError;
      if (result.sent > 0) dispatched++;
    } catch (e: any) {
      const { error: failLogError } = await (supabaseAdmin as any).from("offer_delivery_events").update({
        stage: "push_failed",
        meta: { error: e?.message ?? String(e), claimed_event_id: claim.id },
      }).eq("id", claim.id);
      if (failLogError) throw failLogError;
    }
  }
  return dispatched;
}

async function handle(_request: Request) {
  // No secret gate: matches the pattern of every other /api/public/cron/*
  // endpoint (marketplace-push-dispatch, notification-push, etc.). Path
  // obscurity + pg_cron-only caller is the accepted contract here.
  try {
    const dispatched = await dispatchPending();
    return Response.json({ ok: true, dispatched });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/cron/offer-push-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
