import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const idInput = z.object({ broadcastId: z.string().uuid() });

export const acceptMarketplaceOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => idInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await ((context as any).supabase as any).rpc("mp_accept_offer", {
      p_broadcast_id: data.broadcastId,
    });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; reason?: string; assignment_id?: string; subscription_id?: string };
  });

export const declineMarketplaceOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => idInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await ((context as any).supabase as any).rpc("mp_decline_offer", {
      p_broadcast_id: data.broadcastId,
    });
    if (error) throw new Error(error.message);
    return res as { ok: boolean };
  });

export const getPartnerOpenOffers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Server-authoritative: this RPC sweeps expired/superseded/closed offers
    // first, then returns ONLY rows that are pending, current-round, and have
    // round_expires_at > server-now. The client must not filter further.
    const { supabase, userId } = context as any;
    const { data, error } = await (supabase as any).rpc("get_partner_open_offers", {
      p_partner_id: userId,
    });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    if (rows.length === 0) return [];

    // Hydrate coverage-zone + subscription + vehicle in bulk.
    const subIds = Array.from(new Set(rows.map((r) => r.subscription_id).filter(Boolean))) as string[];
    const vehIds = Array.from(new Set(rows.map((r) => r.vehicle_id).filter(Boolean))) as string[];
    const [subsRes, vehRes] = await Promise.all([
      subIds.length
        ? (supabase as any).from("subscriptions")
            .select("id, amount, start_date, renewal_date").in("id", subIds)
        : Promise.resolve({ data: [] as any[] }),
      vehIds.length
        ? (supabase as any).from("customer_vehicles")
            .select("id, make, model, registration_number").in("id", vehIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const subById = new Map<string, any>(((subsRes.data ?? []) as any[]).map((s: any) => [s.id, s]));
    const vehById = new Map<string, any>(((vehRes.data ?? []) as any[]).map((v: any) => [v.id, v]));

    return rows.map((r) => ({
      id: r.id,
      broadcast_id: r.broadcast_id,
      partner_id: r.partner_id,
      round: r.round,
      incentive: r.incentive,
      distance_from_route_m: r.distance_from_route_m,
      route_impact_m: r.route_impact_m,
      sent_at: r.sent_at,
      response: r.response,
      broadcast: {
        id: r.broadcast_id,
        status: r.broadcast_status,
        current_round: r.current_round,
        current_incentive: r.current_incentive,
        current_radius_m: r.current_radius_m,
        round_expires_at: r.round_expires_at,
        customer_lat: r.customer_lat,
        customer_lng: r.customer_lng,
        vehicle_id: r.vehicle_id,
        subscription_id: r.subscription_id,
        booking_id: r.booking_id,
        vehicle: r.vehicle_id ? vehById.get(r.vehicle_id) ?? null : null,
        subscription: r.subscription_id ? subById.get(r.subscription_id) ?? null : null,
      },
      server_now: r.server_now,
    }));
  });



/**
 * Lightweight "route preview" for the incoming-offer sheet: how many cars
 * are on today's route right now and today's expected earnings. The card
 * uses this to render `24 → 25 cars` and `₹408 → ₹425` deltas so the
 * partner sees the impact of accepting the offer at a glance.
 */
export const getPartnerRoutePreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const today = new Date().toISOString().slice(0, 10);
    const { data: a } = await (supabase as any)
      .from("assignments")
      .select("id, rate_per_car")
      .eq("partner_id", userId)
      .eq("status", "active")
      .gte("end_date", today)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!a) return { cars_today: 0, earnings_today: 0, rate_per_car: 0 };
    const { data: services } = await (supabase as any)
      .from("services")
      .select("id, status, scheduled_date, rate_per_car")
      .eq("assignment_id", a.id)
      .eq("scheduled_date", today);
    const rows = (services ?? []) as any[];
    const cars = rows.filter((s) => s.status !== "cancelled").length;
    const rate = Number(a.rate_per_car ?? 0);
    const earnings = rows.reduce(
      (sum, s) => (s.status !== "cancelled" ? sum + Number(s.rate_per_car ?? rate) : sum),
      0,
    );
    return { cars_today: cars, earnings_today: Math.round(earnings), rate_per_car: rate };
  });

export const getMarketplaceSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = (context as any).supabase;
    const { data, error } = await (supabase as any)
      .select("*")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const settingsInput = z.object({
  base_incentive: z.number().nonnegative(),
  round_increments: z.array(z.number().nonnegative()).max(10),
  max_incentive: z.number().nonnegative(),
  round_duration_sec: z.number().int().min(15).max(600),
  max_rounds: z.number().int().min(1).max(10),
  broadcast_enabled: z.boolean(),
  expand_radius_enabled: z.boolean(),
  radius_per_round_m: z.array(z.number().int().nonnegative()).max(10),
  neighbour_polygon_expansion: z.boolean(),
  auto_assign_final_round: z.boolean(),
  // Notification tuning — read by the native Android service and the push dispatcher.
  notification_sound: z.string().min(1).max(60).optional(),
  vibration_enabled: z.boolean().optional(),
  heads_up_enabled: z.boolean().optional(),
  full_screen_enabled: z.boolean().optional(),
  countdown_seconds: z.number().int().min(15).max(600).optional(),
  notification_priority: z.enum(["high", "max"]).optional(),
});

export const updateMarketplaceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => settingsInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await (supabase as any).rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await (supabase as any)
      .from("marketplace_settings")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMarketplaceAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data: isAdmin } = await (supabase as any).rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: broadcasts } = await (supabase as any)
      .from("marketplace_broadcasts")
      .select("id,status,current_round,current_incentive,created_at,updated_at,winning_partner_id")
      .gte("created_at", since);
    const rows = broadcasts ?? [];
    const total = rows.length;
    const assigned = rows.filter((r: any) => r.status === "assigned");
    const cancelled = rows.filter((r: any) => r.status === "cancelled").length;
    const expired = rows.filter((r: any) => r.status === "admin_alert" || r.status === "expired").length;
    const open = rows.filter((r: any) => r.status === "open").length;
    const byRound: Record<number, number> = {};
    assigned.forEach((r: any) => {
      byRound[r.current_round] = (byRound[r.current_round] ?? 0) + 1;
    });
    const avgAcceptSec = assigned.length
      ? assigned.reduce((s: number, r: any) => s + (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 1000, 0) / assigned.length
      : 0;
    const avgIncentive = assigned.length
      ? assigned.reduce((s: number, r: any) => s + Number(r.current_incentive), 0) / assigned.length
      : 0;

    // Offer-level counters (accepted/declined/superseded/expired/pending) in the same window
    const { data: offerCounts } = await (supabase as any)
      .from("marketplace_offers")
      .select("response", { count: "exact", head: false })
      .gte("sent_at", since);
    const offers = (offerCounts ?? []) as { response: string }[];
    const byResponse: Record<string, number> = {};
    offers.forEach((o) => {
      byResponse[o.response] = (byResponse[o.response] ?? 0) + 1;
    });

    return {
      total,
      assigned: assigned.length,
      expired,
      cancelled,
      open,
      accepted_by_round: byRound,
      avg_accept_seconds: Math.round(avgAcceptSec),
      avg_incentive: Number(avgIncentive.toFixed(2)),
      conversion: total ? Number(((assigned.length / total) * 100).toFixed(1)) : 0,
      offers: {
        accepted: byResponse.accepted ?? 0,
        declined: byResponse.declined ?? 0,
        superseded: byResponse.superseded ?? 0,
        expired: byResponse.expired ?? 0,
        pending: byResponse.pending ?? 0,
      },
    };
  });

// ────────────────────────── Admin controls on live broadcasts ──────────────────────────

const bcastIdInput = z.object({ broadcastId: z.string().uuid() });

async function rpc(context: any, fn: string, args: Record<string, unknown>) {
  const { data, error } = await (context.supabase as any).rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

export const getLiveBroadcasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isAdmin = await rpc(context, "has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { data, error } = await (context.supabase as any)
      .from("marketplace_broadcasts")
      .select(
        `id, status, current_round, current_incentive, current_radius_m,
         round_started_at, round_expires_at, created_at, subscription_id, customer_id, vehicle_id,
         customer:customers ( full_name, phone ),
         vehicle:customer_vehicles ( make, model, registration_number ),
         service_area:coverage_zones ( name )`,
      )
      .eq("status", "open")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getMarketplaceHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isAdmin = await rpc(context, "has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { data, error } = await (context.supabase as any).from("mp_health").select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const adminCancelBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => bcastIdInput.extend({ reason: z.string().max(280).optional() }).parse(i))
  .handler(({ data, context }) => rpc(context, "mp_admin_cancel_broadcast", { p_broadcast_id: data.broadcastId, p_reason: data.reason ?? null }));

export const adminExtendTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => bcastIdInput.extend({ seconds: z.number().int().min(5).max(900) }).parse(i))
  .handler(({ data, context }) => rpc(context, "mp_admin_extend_timer", { p_broadcast_id: data.broadcastId, p_seconds: data.seconds }));

export const adminSetIncentive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => bcastIdInput.extend({ incentive: z.number().nonnegative().max(500) }).parse(i))
  .handler(({ data, context }) => rpc(context, "mp_admin_set_incentive", { p_broadcast_id: data.broadcastId, p_incentive: data.incentive }));

export const adminSetRadius = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => bcastIdInput.extend({ radiusM: z.number().int().nonnegative().max(100000) }).parse(i))
  .handler(({ data, context }) => rpc(context, "mp_admin_set_radius", { p_broadcast_id: data.broadcastId, p_radius_m: data.radiusM }));

export const adminRebroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => bcastIdInput.parse(i))
  .handler(({ data, context }) => rpc(context, "mp_admin_rebroadcast", { p_broadcast_id: data.broadcastId }));

export const adminForceAssignBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => bcastIdInput.extend({ partnerId: z.string().uuid() }).parse(i))
  .handler(({ data, context }) => rpc(context, "mp_admin_force_assign", { p_broadcast_id: data.broadcastId, p_partner_id: data.partnerId }));

