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
    const { data: partnerId, error: partnerError } = await supabase.rpc("resolve_partner_id", { u_id: userId });
    if (partnerError || !partnerId) throw new Error("Partner identity not found");

    // 1. Validate Service Ownership & Status
    const { data: service, error: sErr } = await supabase
      .from("services")
      .select("*")
      .eq("id", serviceId)
      .single();

    if (sErr || !service) throw new Error("Service not found");
    if (service.partner_id !== partnerId) throw new Error("Unauthorized");
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
        p_notes: notes || null,
        p_force_override: true,
      });
    } else {
      // Unavailable or Need Wash
      const finalReason = outcome === "need_wash" ? "dirty_vehicle" : reason;
      
      // Validation for Need Wash (4 photos)
      if (outcome === "need_wash" && photos.length < 4) {
        throw new Error("4 photos required for Need Wash");
      }
      
      // Validation for Unavailable (2 photos required by DB migration 20260702220818)
      if (outcome === "unavailable" && photos.length < 2) {
        throw new Error("At least 2 evidence photos required for Unavailability");
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

    // 3. Entitlement Deduction (Safety check/Trigger)
    // If the service belongs to a subscription, we ensure 1 Daily Shine is deducted.
    // The RPCs partner_complete_service and submit_service_unavailable currently handle earnings and records,
    // but try_consume_entitlement is the source of truth for the '25 service days' meter.
    
    // Fetch the service details to get vehicle_id and service_id (for type check)
    const { data: updatedSvc } = await supabase
      .from("services")
      .select("vehicle_id, service_id, scheduled_date, status, unavailable_reason")
      .eq("id", serviceId)
      .single();

    if (updatedSvc && updatedSvc.vehicle_id) {
      const { data: catalog } = await supabase
        .from("service_catalog")
        .select("service_type, slug")
        .eq("id", updatedSvc.service_id)
        .single();

      if (catalog?.service_type === 'subscription') {
        const benefitType = catalog.slug?.includes('interior') ? 'interior' : 'exterior_daily';
        
        // We call try_consume_entitlement. 
        // Note: The RPC itself prevents double-deduction per service day by using the ledger/uniqueness.
        await supabase.rpc("try_consume_entitlement", {
          p_vehicle_id: updatedSvc.vehicle_id,
          p_benefit: benefitType,
          p_reason: `service_${outcome}`,
          p_booking_id: null // We don't necessarily have the booking ID here, but vehicle + benefit + cycle handles it
        });
      }
    }

    return { ok: true, outcome, serviceId };
  });
