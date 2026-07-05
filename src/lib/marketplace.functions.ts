import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const idInput = z.object({ broadcastId: z.string().uuid() });

export const acceptMarketplaceOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => idInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await (context.supabase as any).rpc("mp_accept_offer", {
      p_broadcast_id: data.broadcastId,
    });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; reason?: string; assignment_id?: string; subscription_id?: string };
  });

export const declineMarketplaceOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => idInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await (context.supabase as any).rpc("mp_decline_offer", {
      p_broadcast_id: data.broadcastId,
    });
    if (error) throw new Error(error.message);
    return res as { ok: boolean };
  });

export const getPartnerOpenOffers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("marketplace_offers")
      .select(
        `id, broadcast_id, round, incentive, distance_from_route_m, sent_at, response,
         broadcast:marketplace_broadcasts!inner (
           id, status, current_round, current_incentive, current_radius_m,
           round_expires_at, customer_lat, customer_lng, vehicle_id,
           vehicle:customer_vehicles ( make, model, registration_number ),
           service_area:coverage_zones ( name )
         )`
      )
      .eq("partner_id", context.userId)
      .eq("response", "pending")
      .order("sent_at", { ascending: false });
    if (error) throw new Error(error.message);
    // Only include offers where the broadcast is still open and this offer is the current round
    return (data ?? []).filter((o: any) =>
      o.broadcast?.status === "open" && o.broadcast?.current_round === o.round
    );
  });

export const getMarketplaceSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("marketplace_settings")
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
});

export const updateMarketplaceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => settingsInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await (context.supabase as any).rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await (context.supabase as any)
      .from("marketplace_settings")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMarketplaceAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await (context.supabase as any).rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: broadcasts } = await (context.supabase as any)
      .from("marketplace_broadcasts")
      .select("id,status,current_round,current_incentive,created_at,updated_at,winning_partner_id")
      .gte("created_at", since);
    const rows = broadcasts ?? [];
    const total = rows.length;
    const assigned = rows.filter((r: any) => r.status === "assigned");
    const byRound: Record<number, number> = {};
    assigned.forEach((r: any) => {
      byRound[r.current_round] = (byRound[r.current_round] ?? 0) + 1;
    });
    const expired = rows.filter((r: any) => r.status === "admin_alert" || r.status === "expired").length;
    const avgAcceptSec = assigned.length
      ? assigned.reduce((s: number, r: any) => s + (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 1000, 0) / assigned.length
      : 0;
    const avgIncentive = assigned.length
      ? assigned.reduce((s: number, r: any) => s + Number(r.current_incentive), 0) / assigned.length
      : 0;
    return {
      total,
      assigned: assigned.length,
      expired,
      accepted_by_round: byRound,
      avg_accept_seconds: Math.round(avgAcceptSec),
      avg_incentive: Number(avgIncentive.toFixed(2)),
      conversion: total ? Number(((assigned.length / total) * 100).toFixed(1)) : 0,
    };
  });
