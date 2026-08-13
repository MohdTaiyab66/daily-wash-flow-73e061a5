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
import { isAuthorizedCron, cronForbidden } from "@/lib/cron-auth";


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

  const { data: offerRows, error } = await (supabaseAdmin as any)
    .from("marketplace_offers")
    .select("id, partner_id, broadcast_id, round, incentive, distance_from_route_m, route_impact_m, sent_at")
    .eq("response", "pending")
    .is("viewed_at", null)
    .gt("sent_at", new Date(Date.now() - 5 * 60_000).toISOString())
    .order("sent_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[BOOKING-PUSH:ERROR] FAILED_TO_FETCH_OFFERS", error);
    throw error;
  }

  if (!offerRows?.length) {
    return 0;
  }

  // marketplace_broadcasts has no FK constraints, so PostgREST cannot embed
  // vehicle/zone/subscription. Resolve them with explicit lookups instead.
  const broadcastIds = [...new Set((offerRows ?? []).map((o: any) => o.broadcast_id).filter(Boolean))];
  const rows: any[] = [];
  if (broadcastIds.length) {
    const { data: bcs } = await (supabaseAdmin as any)
      .from("marketplace_broadcasts")
      .select("id, status, round_expires_at, vehicle_id, service_area_id, subscription_id")
      .in("id", broadcastIds);
    const byId = new Map((bcs ?? []).map((b: any) => [b.id, b]));

    const ids = (key: string) => [...new Set((bcs ?? []).map((b: any) => b[key]).filter(Boolean))];
    const [veh, zones, subs] = await Promise.all([
      ids("vehicle_id").length
        ? (supabaseAdmin as any).from("customer_vehicles").select("id, make, model, registration_number").in("id", ids("vehicle_id"))
        : Promise.resolve({ data: [] }),
      ids("service_area_id").length
        ? (supabaseAdmin as any).from("coverage_zones").select("id, name").in("id", ids("service_area_id"))
        : Promise.resolve({ data: [] }),
      ids("subscription_id").length
        ? (supabaseAdmin as any).from("subscriptions").select("id, start_date, renewal_date").in("id", ids("subscription_id"))
        : Promise.resolve({ data: [] }),
    ]);
    const vMap = new Map((veh.data ?? []).map((x: any) => [x.id, x]));
    const zMap = new Map((zones.data ?? []).map((x: any) => [x.id, x]));
    const sMap = new Map((subs.data ?? []).map((x: any) => [x.id, x]));

    for (const o of offerRows ?? []) {
      const b: any = byId.get(o.broadcast_id);
      rows.push({
        ...o,
        broadcast: b
          ? {
              status: b.status,
              round_expires_at: b.round_expires_at,
              vehicle: vMap.get(b.vehicle_id) ?? null,
              service_area: zMap.get(b.service_area_id) ?? null,
              subscription: sMap.get(b.subscription_id) ?? null,
            }
          : null,
      });
    }
  }

  let dispatchedCount = 0;
  console.log(`[BOOKING-PUSH:06] FCM_FANOUT_STARTED count=${rows.length}`);
  
  for (const r of rows ?? []) {
    if ((r as any).broadcast?.status !== "open") {
      console.log(`[BOOKING-PUSH:CANDIDATE] partner=${r.partner_id} eligible=false reason=broadcast_not_open status=${(r as any).broadcast?.status}`);
      continue;
    }

    // Is this a subsequent round for the same partner+broadcast? If so we
    // silently UPDATE the existing notification instead of posting a new one.
    const { data: priorRows } = await (supabaseAdmin as any)
      .from("marketplace_offers")
      .select("id")
      .eq("broadcast_id", r.broadcast_id)
      .eq("partner_id", r.partner_id)
      .not("viewed_at", "is", null)
      .neq("id", r.id)
      .limit(1);
    const isUpdate = Array.isArray(priorRows) && priorRows.length > 0;

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
    if (tokenErr || !tokenRow) {
      console.log(`[BOOKING-PUSH:CANDIDATE] partner=${r.partner_id} eligible=false reason=token_mint_failed error=${tokenErr?.message}`);
      continue;
    }
    const actionToken = String(tokenRow);

    const title = "🚗 New Daily Shine Customer";
    const body = `${vehicleLabel} · ${area} · ${distStr} · ₹${r.incentive}/day`;
    const data: Record<string, string> = {
      type: isUpdate ? "marketplace_offer_update" : "marketplace_offer",
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
      console.log(`[BOOKING-PUSH:CANDIDATE] partner=${r.partner_id} eligible=true reason=sending_push type=${data.type}`);
      const result = await sendOfferPush({
        userId: r.partner_id,
        title,
        body,
        data,
        channelId: "offers_v4",
        dataOnly: true,
        silent: isUpdate,
        tag: String(r.broadcast_id),
      });
      
      if (result.sent > 0) {
        dispatchedCount++;
        console.log(`[BOOKING-PUSH:RESULT] partner=${r.partner_id} success=true`);
      } else {
        console.log(`[BOOKING-PUSH:RESULT] partner=${r.partner_id} success=false reason=fcm_failed`);
      }

      // Delivery tracking — non-blocking
      await (supabaseAdmin as any).from("marketplace_delivery_events").insert({
        offer_id: r.id,
        broadcast_id: r.broadcast_id,
        partner_id: r.partner_id,
        stage: result.sent > 0 ? (isUpdate ? "push_update_sent" : "push_sent") : "push_failed",
        meta: { 
          round: r.round, 
          incentive: r.incentive, 
          sent: result.sent, 
          failed: result.failed, 
          error: (result as any).results?.[0]?.error 
        },
      });
    } catch (e: any) {
      console.error(`[BOOKING-PUSH:RESULT] partner=${r.partner_id} success=false reason=exception error=${e?.message}`);
      await (supabaseAdmin as any).from("marketplace_delivery_events").insert({
        offer_id: r.id,
        broadcast_id: r.broadcast_id,
        partner_id: r.partner_id,
        stage: "push_failed",
        meta: { round: r.round, error: e?.message },
      });
    }
  }
  console.log(`[BOOKING-PUSH:08] FANOUT_COMPLETE dispatched=${dispatchedCount}`);

  return dispatchedCount;
}

async function handle(request: Request) {
  if (!isAuthorizedCron(request)) return cronForbidden();

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
