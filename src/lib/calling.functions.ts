import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Initiates a masked call between partner and customer.
 * Partner never sees the customer's real phone number.
 * In production this would call a provider (Exotel/Knowlarity/Twilio) to bridge two numbers.
 * For pilot launch we return a proxy "Urban Wash" number and log the request.
 */
export const initiateMaskedCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { service_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    // Verify the partner actually owns this service (RLS will also enforce).
    const { data: svc, error } = await supabase
      .from("services")
      .select("id,customer_id,partner_id")
      .eq("id", data.service_id)
      .maybeSingle();
    if (error) throw error;
    if (!svc || svc.partner_id !== userId) {
      throw new Error("Not allowed to call this customer");
    }
    // TODO: Replace with real provider bridge (e.g. Exotel click-to-call API).
    return {
      ok: true,
      proxy_number: "+91 80000 00000",
      message: "Connecting your call via Urban Wash. The customer's number stays private.",
    };
  });
