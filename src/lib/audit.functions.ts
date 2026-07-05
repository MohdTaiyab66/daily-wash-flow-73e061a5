import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/lib/admin-middleware";

export type VehicleAuditRow = {
  service_id: string;
  scheduled_date: string | null;
  customer_id: string | null;
  customer_name: string | null;
  service_vehicle_id: string | null;
  service_make: string | null;
  service_model: string | null;
  service_reg: string | null;
  booking_id: string | null;
  booking_vehicle_id: string | null;
  booking_make: string | null;
  booking_model: string | null;
  booking_reg: string | null;
  mismatch: boolean;
  created_at: string;
};

export const getVehicleAudit = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d: { scope?: "all" | "mismatch"; limit?: number }) => ({
    scope: d?.scope ?? "all",
    limit: Math.min(Math.max(d?.limit ?? 200, 1), 1000),
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("v_vehicle_audit" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.scope === "mismatch") q = q.eq("mismatch", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return ((rows as unknown) ?? []) as VehicleAuditRow[];
  });

export const getVehicleTraceLog = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d: { booking_id?: string; service_id?: string; limit?: number }) => ({
    booking_id: d?.booking_id ?? null,
    service_id: d?.service_id ?? null,
    limit: Math.min(Math.max(d?.limit ?? 200, 1), 500),
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("vehicle_trace_log" as any)
      .select("id, source, booking_id, service_id, addon_request_id, vehicle_id, customer_id, actor_user_id, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.booking_id) q = q.eq("booking_id", data.booking_id);
    if (data.service_id) q = q.eq("service_id", data.service_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
