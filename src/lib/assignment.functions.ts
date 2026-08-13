import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============== My Assignment (partner) ==============
export const getMyAssignment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
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

    // Working-day math (dynamic per assignment; supports any duration).
    const workingDaysTotal = Number(a.working_days ?? 0);
    const distinctScheduled = Array.from(new Set(all.map((s: any) => s.scheduled_date))).sort();
    const todayStr = today;
    const workingDaysCompleted = distinctScheduled.filter((d) => d && d < todayStr).length;
    const workingDaysRemaining = Math.max(0, workingDaysTotal - workingDaysCompleted);
    const hoursPerDay = Number(a.hours_per_day ?? a.estimated_hours ?? 0);
    const todaysCustomers = todays.length;
    const expectedEarningsToday = todaysCustomers * rate;

    return {
      assignment: a,
      day_progress: Math.max(1, Math.min(dayNum, a.duration_days)),
      total_cars: all.length,
      completed_cars: completed,
      remaining_cars: remaining,
      completed_today: completedToday,
      remaining_today: remainingToday,
      todays_customers: todaysCustomers,
      expected_earnings_today: expectedEarningsToday,
      hours_per_day: hoursPerDay,
      working_days_total: workingDaysTotal,
      working_days_completed: workingDaysCompleted,
      working_days_remaining: workingDaysRemaining,
      original_duration_days: Number(a.original_duration_days ?? a.duration_days ?? 0),
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
      remaining_days: Math.max(0, Math.ceil((new Date(a.end_date).getTime() - Date.now()) / 86400000) + 1),
    };
  });

// Route visibility — today's route unlocks N hours before shift start.
// Admin-configurable via platform_settings.route_visibility_hours (default 6).
export const getRouteVisibility = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = (context as any).supabase;
    const userId = (context as any).userId;
    const { data, error } = await (supabase as any)
      .rpc("get_route_visibility", { p_partner: userId });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.assignment_id) return { visible: true, unlock_at: null, shift_start: null, assignment_id: null, override: row?.override ?? "auto" };
    return {
      visible: !!row.visible,
      unlock_at: row.unlock_at ?? null,
      shift_start: row.shift_start ?? null,
      assignment_id: row.assignment_id ?? null,
      override: row.override ?? "auto",
    };
  });

export const modifyAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assignment_id: string; delta: number }) => d)
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const { data: result, error } = await supabase.rpc("modify_assignment", {
      p_assignment_id: data.assignment_id,
      p_delta: data.delta,
    });
    if (error) throw new Error(error.message);
    return result;
  });

export const getAssignmentCancellability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assignment_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any).rpc(
      "get_assignment_cancellability",
      { p_assignment_id: data.assignment_id },
    );
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
      can_cancel: !!row?.can_cancel,
      reason: (row?.reason as string) ?? "UNKNOWN",
      deadline_at: (row?.deadline_at as string | null) ?? null,
      shift_start_at: (row?.shift_start_at as string | null) ?? null,
      route_started: !!row?.route_started,
      status: (row?.status as string | null) ?? null,
    };
  });

type CancelError = { code: string; message: string };

export const cancelMyAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assignment_id: string }) => d)
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; code: string; message: string }> => {
    const supabase = (context as any).supabase;
    const userId = (context as any).userId;
    const { error } = await supabase.rpc("cancel_assignment", { p_assignment_id: data.assignment_id });
    if (error) {
      const msg = error.message || "";
      const err: CancelError = { code: "ASSIGNMENT_CANNOT_BE_CANCELLED", message: msg };
      if (/ROUTE_STARTED|route already started/i.test(msg)) err.code = "ROUTE_STARTED";
      else if (/CUTOFF_PASSED|cutoff passed/i.test(msg)) err.code = "CUTOFF_PASSED";
      else if (/ASSIGNMENT_ALREADY_(CANCELLED|COMPLETED|EXPIRED)/i.test(msg)) {
        err.code = msg.match(/ASSIGNMENT_ALREADY_(\w+)/i)?.[0]?.toUpperCase() ?? "ASSIGNMENT_ALREADY_MODIFIED";
      } else if (/ASSIGNMENT_NOT_FOUND/i.test(msg)) err.code = "ASSIGNMENT_NOT_FOUND";
      else if (/disabled by admin/i.test(msg)) err.code = "CANCELLATION_DISABLED";
      console.error("[cancelMyAssignment] partner=%s assignment=%s code=%s msg=%s", userId, data.assignment_id, err.code, msg);
      const e = new Error(err.message) as Error & CancelError;
      e.code = err.code;
      throw e;
    }
    console.info("[cancelMyAssignment] partner=%s assignment=%s cancelled ok", userId, data.assignment_id);
    return { ok: true };
  });

// ============== Wallet Ledger (partner self-view) ==============
export const getMyLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = (context as any).supabase;
    const { data } = await supabase
      .select("id,entry_type,amount,balance_after,description,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

// ============== End of Day Summary ==============
export const getEndOfDaySummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
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

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// ============== Reclaim released route ==============
// If the partner went briefly offline earlier, the Daily Auto Recovery flow
// releases today's stops (services.partner_id set to NULL, original_partner_id
// preserved). When the partner comes back online, we reclaim any of those
// released stops that no other partner has picked up so the Home dashboard
// counts stay in sync with the actual assignment.
export const reclaimReleasedRouteToday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = (context as any).userId;
    const today = new Date().toISOString().slice(0, 10);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: released } = await supabaseAdmin
      .from("services")
      .select("id,recovery_event_id")
      .is("partner_id", null)
      .eq("original_partner_id", userId)
      .eq("scheduled_date", today)
      .eq("status", "pending");
    const rows = released ?? [];
    if (rows.length === 0) return { reclaimed: 0 };
    const ids = rows.map((r: any) => r.id);
    const { error } = await (supabaseAdmin.from("services") as any)
      .update({ partner_id: userId, updated_at: new Date().toISOString() })
      .in("id", ids);
    if (error) throw new Error(error.message);
    // Resolve any pending DAR events tied to these services.
    const eventIds = Array.from(new Set(rows.map((r: any) => r.recovery_event_id).filter(Boolean)));
    if (eventIds.length) {
      await (supabaseAdmin.from("dar_events") as any)
        .update({ status: "recovered", resolved_at: new Date().toISOString() })
        .in("id", eventIds)
        .eq("status", "pending");
    }
    return { reclaimed: ids.length };
  });



// ============== Validate Active Assignment Integrity ==============
// Server-side guard: when an ACTIVE assignment exists we must NEVER report
// "0 customers" simply because of a data-quality glitch. This function runs
// consistency checks and returns a structured mismatch report so the UI can
// surface a clear error banner instead of a silent zero.
export type AssignmentIntegrityReport = {
  ok: boolean;
  has_active_assignment: boolean;
  assignment_id: string | null;
  todays_services: number;
  todays_customers: number;
  total_services: number;
  services_missing_customer: number;
  services_wrong_partner: number;
  mismatches: string[];
};

export const validateTodayAssignment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AssignmentIntegrityReport> => {
    const { supabase, userId } = context as any;
    const today = new Date().toISOString().slice(0, 10);
    const { data: a } = await supabase
      .from("assignments")
      .select("id,partner_id,status,end_date")
      .eq("partner_id", userId)
      .eq("status", "active")
      .gte("end_date", today)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const report: AssignmentIntegrityReport = {
      ok: true,
      has_active_assignment: !!a,
      assignment_id: a?.id ?? null,
      todays_services: 0,
      todays_customers: 0,
      total_services: 0,
      services_missing_customer: 0,
      services_wrong_partner: 0,
      mismatches: [],
    };
    if (!a) return report;

    const { data: services } = await supabase
      .from("services")
      .select("id,customer_id,partner_id,scheduled_date,status")
      .eq("assignment_id", a.id);
    const rows = services ?? [];
    report.total_services = rows.length;
    const todays = rows.filter((s: any) => s.scheduled_date === today);
    report.todays_services = todays.length;
    report.todays_customers = new Set(todays.map((s: any) => s.customer_id).filter(Boolean)).size;
    report.services_missing_customer = rows.filter((s: any) => !s.customer_id).length;
    report.services_wrong_partner = rows.filter(
      (s: any) => s.partner_id && s.partner_id !== userId,
    ).length;

    if (report.total_services === 0) {
      report.mismatches.push("ACTIVE_ASSIGNMENT_HAS_NO_SERVICES");
    }
    if (report.services_missing_customer > 0) {
      report.mismatches.push("SERVICES_MISSING_CUSTOMER_ID");
    }
    if (report.services_wrong_partner > 0) {
      report.mismatches.push("SERVICES_ASSIGNED_TO_DIFFERENT_PARTNER");
    }
    if (report.todays_services > 0 && report.todays_customers !== report.todays_services) {
      report.mismatches.push("TODAYS_SERVICES_CUSTOMER_COUNT_MISMATCH");
    }
    report.ok = report.mismatches.length === 0;

    // Persist mismatches so admins can diagnose partner-side data drift.
    if (!report.ok) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("assignment_integrity_audit").insert({
          partner_id: userId,
          assignment_id: report.assignment_id,
          mismatches: report.mismatches,
          todays_services: report.todays_services,
          todays_customers: report.todays_customers,
          total_services: report.total_services,
          services_missing_customer: report.services_missing_customer,
          services_wrong_partner: report.services_wrong_partner,
          source: "validateTodayAssignment",
        });
      } catch (e) {
        console.error("[integrity-audit] failed to persist", e);
      }
    }
    return report;
  });
