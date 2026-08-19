import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Service Outcome Authority
 */
export const SERVICE_OUTCOMES = {
  COMPLETED: "completed",
  UNAVAILABLE: "unavailable",
  NEED_WASH: "need_wash", // Maps to status='unavailable' + reason='dirty_vehicle' in DB for now, or new outcome column
} as const;

export const UNAVAILABLE_REASONS = [
  "vehicle_not_available",
  "parking_locked",
  "customer_asked_to_skip",
  "access_not_available",
  "customer_not_responding",
  "vehicle_taken_out",
  "keys_not_available",
  "security_guard_denied",
  "other"
] as const;

/**
 * AUTHORITATIVE EARNING CONFIG
 * COMPLETED: 17
 * UNAVAILABLE: 12
 * NEED WASH: 12
 */
export async function getAuthoritativeEarningConfig(supabase: any) {
  const { data: settings } = await supabase
    .from("platform_settings")
    .select("key,value")
    .in("key", ["daily_shine_rate_per_car", "unavailability_credit"]);
  
  const config = {
    completed: 17,
    unavailable: 12,
    need_wash: 12
  };

  (settings || []).forEach((s: any) => {
    const val = Number(s.value);
    if (isNaN(val)) return;
    if (s.key === "daily_shine_rate_per_car") config.completed = val;
    if (s.key === "unavailability_credit") {
      config.unavailable = val;
      config.need_wash = val;
    }
  });

  return config;
}

export const submitServiceOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    serviceId: z.string().uuid(),
    outcome: z.enum(["completed", "unavailable", "need_wash"]),
    reason: z.string().optional(),
    notes: z.string().optional(),
    photos: z.array(z.string()).min(1),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { serviceId, outcome, reason, notes, photos, lat, lng } = data;

    // 1. Validate Service Ownership & Status
    const { data: service, error: sErr } = await supabase
      .from("services")
      .select("*")
      .eq("id", serviceId)
      .single();

    if (sErr || !service) throw new Error("Service not found");
    if (service.partner_id !== userId) throw new Error("Unauthorized");
    if (service.status === "completed") throw new Error("Already completed");

    // 2. Map Outcome to RPC/DB
    // Current DB schema uses status='completed' or status='unavailable'
    // NEED_WASH is mapped to status='unavailable' with reason='dirty_vehicle'
    
    let result;
    if (outcome === "completed") {
      // Logic for complete service
      result = await supabase.rpc("partner_complete_service", {
        p_service_id: serviceId,
        p_lat: lat || 0,
        p_lng: lng || 0,
        p_notes: notes || null
      });
    } else {
      // Unavailable or Need Wash
      const finalReason = outcome === "need_wash" ? "dirty_vehicle" : reason;
      
      // Validation for Need Wash (4 photos)
      if (outcome === "need_wash" && photos.length < 4) {
        throw new Error("4 photos required for Need Wash");
      }
      
      // Validation for Unavailable (2 photos required by DB)
      if (outcome === "unavailable" && photos.length < 2) {
        throw new Error("2 evidence photos required for Unavailability");
      }

      result = await supabase.rpc("submit_service_unavailable", {
        p_service_id: serviceId,
        p_reason: finalReason,
        p_notes: notes || (outcome === "need_wash" ? "Need Wash reported" : "Vehicle unavailable"),
        p_photos: photos,
        p_lat: lat || 0,
        p_lng: lng || 0
      });
    }


    if (result.error) throw new Error(result.error.message);

    return { ok: true, outcome, serviceId };
  });
