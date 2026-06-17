import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============== My Assignment (partner) ==============
export const getMyAssignment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = new Date().toISOString().slice(0, 10);
    const { data: a } = await supabase
      .from("assignments")
      .select("*")
      .eq("partner_id", userId)
      .eq("status", "active")
      .gte("end_date", today)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!a) return null;

    const { data: services } = await supabase
      .from("services")
      .select("id,status,scheduled_date,rate_per_car")
      .eq("assignment_id", a.id);
    const all = services ?? [];
    const completed = all.filter((s: any) => s.status === "completed").length;
    const remaining = all.filter((s: any) => s.status === "pending" || s.status === "in_progress").length;

    // Today's counts
    const todays = all.filter((s: any) => s.scheduled_date === today);
    const completedToday = todays.filter((s: any) => s.status === "completed").length;
    const remainingToday = todays.filter((s: any) => s.status === "pending" || s.status === "in_progress").length;

    const start = new Date(a.start_date);
    const dayNum = Math.floor((Date.now() - start.getTime()) / 86400000) + 1;
    const heldDays = 7;
    const releaseDay = 15;
    const rate = Number(a.rate_per_car);
    const earned = completed * rate;
    const expectedTotal = all.length * rate;
    const heldCount = all.filter((s: any) => {
      if (s.status !== "completed") return false;
      const d = new Date(s.scheduled_date);
      const dn = Math.floor((d.getTime() - start.getTime()) / 86400000) + 1;
      return dn <= heldDays && dayNum < releaseDay;
    }).length;
    const held = heldCount * rate;
    const available = Math.max(0, earned - held);
    const nextPayoutDate = new Date(start);
    nextPayoutDate.setDate(nextPayoutDate.getDate() + releaseDay - 1);

    // Modifications metadata
    const { data: caps } = await supabase
      .from("platform_settings")
      .select("key,value")
      .in("key", ["modify_cooldown_days", "max_modifications_per_assignment"]);
    const settings: Record<string, number> = {};
    (caps ?? []).forEach((s: any) => { settings[s.key] = Number(s.value); });
    const maxMods = settings.max_modifications_per_assignment ?? 3;
    const cooldownDays = settings.modify_cooldown_days ?? 2;
    const lastModified = a.last_modified_at ? new Date(a.last_modified_at) : null;
    const cooldownUntil = lastModified ? new Date(lastModified.getTime() + cooldownDays * 86400000) : null;
    const canModify = (a.modification_count ?? 0) < maxMods && (!cooldownUntil || cooldownUntil <= new Date());

    const progressPct = all.length > 0 ? Math.round((completed / all.length) * 100) : 0;

    return {
      assignment: a,
      day_progress: Math.max(1, Math.min(dayNum, a.duration_days)),
      total_cars: all.length,
      completed_cars: completed,
      remaining_cars: remaining,
      completed_today: completedToday,
      remaining_today: remainingToday,
      earned,
      held,
      available_payout: available,
      expected_total: expectedTotal,
      progress_pct: progressPct,
      next_payout_date: nextPayoutDate.toISOString().slice(0, 10),
      modifications_used: a.modification_count ?? 0,
      modifications_max: maxMods,
      can_modify: canModify,
      cooldown_until: cooldownUntil ? cooldownUntil.toISOString() : null,
    };
  });

export const modifyAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assignment_id: string; delta: number }) => d)
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("modify_assignment", {
      p_assignment_id: data.assignment_id,
      p_delta: data.delta,
    });
    if (error) throw new Error(error.message);
    return result;
  });

export const cancelMyAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assignment_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("cancel_assignment", { p_assignment_id: data.assignment_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============== Wallet Ledger (partner self-view) ==============
export const getMyLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("wallet_ledger")
      .select("id,entry_type,amount,balance_after,description,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

// ============== End of Day Summary ==============
export const getEndOfDaySummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = new Date().toISOString().slice(0, 10);
    const { data: services } = await supabase
      .from("services")
      .select("id,status,started_at,completed_at,rate_per_car,start_lat,start_lng,complete_lat,complete_lng")
      .eq("partner_id", userId)
      .eq("scheduled_date", today);
    const rows = services ?? [];
    const completed = rows.filter((s: any) => s.status === "completed");
    const unavailable = rows.filter((s: any) => s.status === "unavailable").length;
    const earnings = completed.reduce((s: number, r: any) => s + Number(r.rate_per_car || 0), 0);

    const starts = rows.map((s: any) => s.started_at).filter(Boolean).sort();
    const ends = rows.map((s: any) => s.completed_at).filter(Boolean).sort();
    const hours = starts.length && ends.length
      ? Math.max(0, (new Date(ends[ends.length - 1]).getTime() - new Date(starts[0]).getTime()) / 3.6e6)
      : 0;

    const points = completed
      .filter((s: any) => s.complete_lat != null && s.complete_lng != null)
      .sort((a: any, b: any) => +new Date(a.completed_at) - +new Date(b.completed_at))
      .map((s: any) => ({ lat: Number(s.complete_lat), lng: Number(s.complete_lng) }));
    let distance = 0;
    for (let i = 1; i < points.length; i++) {
      distance += haversineKm(points[i - 1], points[i]);
    }
    return {
      completed: completed.length,
      total: rows.length,
      unavailable,
      distance_km: Math.round(distance * 10) / 10,
      hours_worked: Math.round(hours * 10) / 10,
      earnings,
    };
  });

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
