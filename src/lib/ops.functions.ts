import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/lib/admin-middleware";

// ============== Admin Live Ops Dashboard ==============
export const getLiveOps = createServerFn({ method: "GET" }).middleware([requireAdmin]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const today = new Date().toISOString().slice(0, 10);
  const [counts, recentCompleted, recentUnavail, recentDirty] = await Promise.all([
    supabaseAdmin.from("v_live_ops_today").select("*").maybeSingle(),
    supabaseAdmin
      .from("services")
      .select("id,completed_at,gps_flag,gps_distance_m,fraud_review,partners(full_name,partner_code),customers(full_name,area)")
      .eq("scheduled_date", today)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("services")
      .select("id,unavailable_reason,unavailable_notes,partners(full_name,partner_code),customers(full_name,area)")
      .eq("scheduled_date", today)
      .eq("status", "unavailable")
      .limit(20),
    supabaseAdmin
      .from("dirty_vehicle_reports")
      .select("id,reason,notes,created_at,services(customers(full_name,area),partners(full_name,partner_code))")
      .gte("created_at", `${today}T00:00:00`)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  return {
    counts: counts.data ?? {
      assigned_today: 0, completed_today: 0, pending_today: 0, unavailable_today: 0,
      dirty_today: 0, fraud_flags_week: 0,
    },
    completed: recentCompleted.data ?? [],
    unavailable: recentUnavail.data ?? [],
    dirty: recentDirty.data ?? [],
  };
});

// ============== Fraud / GPS Validation Queue ==============
export const listFraudFlags = createServerFn({ method: "GET" }).middleware([requireAdmin]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("services")
    .select("id,scheduled_date,status,gps_flag,gps_distance_m,completed_at,partners(full_name,partner_code,phone),customers(full_name,area,latitude,longitude)")
    .eq("fraud_review", true)
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(100);
  return data ?? [];
});

export const clearFraudFlag = createServerFn({ method: "POST" }).middleware([requireAdmin])
  .inputValidator((d: { service_id: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("services")
      .update({ fraud_review: false })
      .eq("id", data.service_id);
    if (error) throw error;
    return { ok: true };
  });

// ============== Partner Reliability ==============
export const listPartnerReliability = createServerFn({ method: "GET" }).middleware([requireAdmin]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: partners } = await supabaseAdmin
    .from("partners")
    .select("id,full_name,partner_code,phone,city,availability,rating")
    .order("full_name");
  const rows = await Promise.all(
    (partners ?? []).map(async (p: any) => {
      const { data: r } = await supabaseAdmin.rpc("partner_reliability", { p_partner_id: p.id });
      return { ...p, ...(r as object) };
    }),
  );
  return rows.sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0));
});

// ============== Attendance Dashboard ==============
export const getAttendanceToday = createServerFn({ method: "GET" }).middleware([requireAdmin]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("attendance")
    .select("id,status,marked_at,partners(full_name,partner_code,city)")
    .eq("attendance_date", today);
  const rows = data ?? [];
  const counts = { present: 0, absent: 0, late: 0 };
  rows.forEach((r: any) => { if (counts[r.status as keyof typeof counts] != null) counts[r.status as keyof typeof counts]++; });
  return { counts, rows };
});

// ============== Renewals Dashboard ==============
export const getRenewals = createServerFn({ method: "GET" }).middleware([requireAdmin]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
  const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
  const { data } = await supabaseAdmin
    .from("customers")
    .select("id,full_name,phone,area,subscription_plan,subscription_end,is_active")
    .lte("subscription_end", iso(in30))
    .gte("subscription_end", iso(today))
    .order("subscription_end");
  const all = data ?? [];
  const todayList = all.filter((c: any) => c.subscription_end === iso(today));
  const weekList = all.filter((c: any) => c.subscription_end > iso(today) && c.subscription_end <= iso(in7));
  const monthList = all.filter((c: any) => c.subscription_end > iso(in7));
  return { today: todayList, week: weekList, month: monthList };
});

// ============== Customer Map ==============
export const listCustomersForMap = createServerFn({ method: "GET" }).middleware([requireAdmin]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("customers")
    .select("id,full_name,phone,area,address_line,latitude,longitude,subscription_plan,subscription_end,is_active,vehicles(make,model,registration_number),services(scheduled_date,partners(full_name,partner_code))")
    .not("latitude", "is", null)
    .not("longitude", "is", null);
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(); in7.setDate(in7.getDate() + 7);
  const in7s = in7.toISOString().slice(0, 10);
  return (data ?? []).map((c: any) => {
    let bucket: "active" | "renewal_due" | "inactive" = "active";
    if (!c.is_active || (c.subscription_end && c.subscription_end < today)) bucket = "inactive";
    else if (c.subscription_end && c.subscription_end <= in7s) bucket = "renewal_due";
    const assigned = (c.services ?? []).find((s: any) => s.partners) ?? null;
    return { ...c, bucket, assigned_partner: assigned?.partners ?? null };
  });
});

export const getTrialReadinessReport = createServerFn({ method: "GET" }).middleware([requireAdmin]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const today = new Date().toISOString().slice(0, 10);
  const [activeCustomers, assignedCustomers, activePartners, servicesToday, pendingToday, completedToday] = await Promise.all([
    supabaseAdmin.from("customers").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabaseAdmin.from("services").select("customer_id", { count: "exact", head: true }).not("partner_id", "is", null).gte("scheduled_date", today),
    supabaseAdmin.from("partners").select("*", { count: "exact", head: true }).in("status", ["active", "pending_verification"]),
    supabaseAdmin.from("services").select("*", { count: "exact", head: true }).eq("scheduled_date", today),
    supabaseAdmin.from("services").select("*", { count: "exact", head: true }).eq("scheduled_date", today).in("status", ["pending", "in_progress"]),
    supabaseAdmin.from("services").select("*", { count: "exact", head: true }).eq("scheduled_date", today).eq("status", "completed"),
  ]);
  const { data: byArea } = await (supabaseAdmin.rpc as any)("available_customers_by_area");
  const availableCustomers = (byArea ?? []).reduce((sum: number, r: any) => sum + Number(r.available ?? 0), 0);
  return {
    activeCustomers: activeCustomers.count ?? 0,
    assignedCustomers: assignedCustomers.count ?? 0,
    availableCustomers,
    activePartners: activePartners.count ?? 0,
    servicesToday: servicesToday.count ?? 0,
    pendingServices: pendingToday.count ?? 0,
    completedServices: completedToday.count ?? 0,
  };
});

// ============== Wallet Ledger (admin) ==============
export const listAdminLedger = createServerFn({ method: "GET" }).middleware([requireAdmin])
  .inputValidator((d: { partner_id?: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("wallet_ledger")
      .select("id,partner_id,entry_type,amount,balance_after,description,created_at,partners(full_name,partner_code)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.partner_id) q = q.eq("partner_id", data.partner_id);
    const { data: rows } = await q;
    return rows ?? [];
  });

// ============== Assignment Change History (admin) ==============
export const listAdminAssignmentChanges = createServerFn({ method: "GET" }).middleware([requireAdmin]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("assignment_changes")
    .select("id,change_type,delta_cars,previous_target,new_target,released_customer_ids,created_at,partners(full_name,partner_code),assignments(area)")
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
});
