/**
 * Sends FCM push for newly created marketplace_offers that have not yet been
 * pushed. Runs every 15-30s from pg_cron.
 *
 * The payload includes:
 *  - a single-use `action_token` so the Android native OfferActionReceiver
 *    can Accept / Decline directly from the notification.
 *  - a rich set of `data` fields the native service renders in the heads-up
 *    notification (vehicle, area, distance, incentive, working_days).
 *
 * Deduplication: `viewed_at IS NOT NULL` prevents re-pushes for the same
 * offer on countdown/refresh — a new push is only sent for a brand-new offer
 * row (i.e. new round or new broadcast).
 */
import { createFileRoute } from "@tanstack/react-router";

function workingDaysBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return 26;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const days = Math.max(1, Math.round((e - s) / 86400000));
  return Math.min(days, 30);
}

async function dispatchPending() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendOfferPush } = await import("@/lib/push/send.server");

  const { data: rows, error } = await (supabaseAdmin as any)
    .from("marketplace_offers")
    .select(
      `id, partner_id, broadcast_id, round, incentive, distance_from_route_m, route_impact_m, sent_at,
       broadcast:marketplace_broadcasts!inner (
         status, round_expires_at,
         vehicle:customer_vehicles ( make, model, registration_number ),
         service_area:coverage_zones ( name ),
         subscription:subscriptions ( start_date, renewal_date )
       )`,
    )
    .eq("response", "pending")
    .is("viewed_at", null)
    .gt("sent_at", new Date(Date.now() - 5 * 60_000).toISOString())
    .order("sent_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  let dispatched = 0;
  for (const r of rows ?? []) {
    if ((r as any).broadcast?.status !== "open") continue;

    // Mark viewed_at first so we don't re-push if sending is slow.
    await (supabaseAdmin as any)
      .from("marketplace_offers")
      .update({ viewed_at: new Date().toISOString() })
      .eq("id", r.id)
      .is("viewed_at", null);

    const v = (r as any).broadcast?.vehicle;
    const vehicleLabel = v ? `${v.make ?? ""} ${v.model ?? ""}`.trim() || "Vehicle" : "Vehicle";
    const area = (r as any).broadcast?.service_area?.name ?? "Nearby area";
    const distM = r.distance_from_route_m ?? 0;
    const distStr = distM < 1000 ? `${distM} m` : `${(distM / 1000).toFixed(1)} km`;
    const sub = (r as any).broadcast?.subscription;
    const workingDays = workingDaysBetween(sub?.start_date, sub?.renewal_date);

    // Mint the single-use action token (3-minute TTL, tied to this partner + broadcast).
    const { data: tokenRow, error: tokenErr } = await (supabaseAdmin as any).rpc(
      "mp_mint_action_token",
      {
        p_offer_id: r.id,
        p_broadcast_id: r.broadcast_id,
        p_partner_id: r.partner_id,
      },
    );
    if (tokenErr || !tokenRow) continue;
    const actionToken = String(tokenRow);

    const title = "🚗 New Daily Shine Customer";
    const body = `${vehicleLabel} · ${area} · ${distStr} · ₹${r.incentive}/day`;
    const data: Record<string, string> = {
      type: "marketplace_offer",
      broadcast_id: String(r.broadcast_id),
      offer_id: String(r.id),
      partner_id: String(r.partner_id),
      action_token: actionToken,
      title,
      body,
      vehicle: vehicleLabel,
      area,
      distance: distStr,
      incentive: `₹${r.incentive}/day`,
      working_days: String(workingDays),
      link: "/app",
    };

    try {
      await sendOfferPush({ userId: r.partner_id, title, body, data, channelId: "offers" });
      dispatched++;
    } catch {
      /* best effort */
    }
  }
  return dispatched;
}

async function handle(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const got = request.headers.get("x-cron-secret");
    if (got !== expected) return new Response("Unauthorized", { status: 401 });
  }
  try {
    const dispatched = await dispatchPending();
    return Response.json({ ok: true, dispatched });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/cron/marketplace-push-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
