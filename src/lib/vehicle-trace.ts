import { supabase } from "@/integrations/supabase/client";

export type VehicleTraceSource =
  | "customer_schedule"
  | "admin_render"
  | "activate_booking"
  | "create_addon"
  | "route_generate"
  | "trigger_reject"
  | "ops_sync";

export interface VehicleTracePayload {
  booking_id?: string | null;
  service_id?: string | null;
  addon_request_id?: string | null;
  vehicle_id?: string | null;
  customer_id?: string | null;
  details?: Record<string, unknown>;
}

/**
 * Fire-and-forget vehicle trace event.
 * - Always logs to the browser/server console with a [vehicle-trace] tag.
 * - Best-effort inserts into `public.vehicle_trace_log` via the
 *   `log_vehicle_trace` RPC. Silently ignores errors so callers can
 *   never break the user flow because of tracing.
 */
export function traceVehicle(source: VehicleTraceSource, payload: VehicleTracePayload) {
  try {
    // eslint-disable-next-line no-console
    console.info("[vehicle-trace]", source, payload);
  } catch { /* noop */ }
  try {
    void (supabase as any).rpc("log_vehicle_trace", {
      p_source: source,
      p_booking_id: payload.booking_id ?? null,
      p_service_id: payload.service_id ?? null,
      p_addon_request_id: payload.addon_request_id ?? null,
      p_vehicle_id: payload.vehicle_id ?? null,
      p_customer_id: payload.customer_id ?? null,
      p_payload: (payload.details ?? {}) as any,
    }).then?.(() => undefined, () => undefined);
  } catch { /* noop */ }
}
