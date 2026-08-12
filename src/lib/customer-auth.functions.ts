import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Server function to fetch initial customer context in parallel.
 * This reduces waterfalls during app startup.
 * Moved database logic to handler as per TanStack Start rules.
 */
export const getInitialCustomerContext = createServerFn({ method: "GET" })
  .handler(async () => {
    // We import client helpers inside the handler to keep them out of the client bundle
    const { supabase } = await import("@/integrations/supabase/client");

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("[SERVER] Auth user error:", userError);
      return null;
    }

    console.log("[SERVER] Fetching context for user:", user.id);
    const [profileRes, vehiclesRes] = await Promise.all([
      supabase.from("customer_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("customer_vehicles").select("*").eq("user_id", user.id)
    ]);

    if (profileRes.error) console.error("[SERVER] Profile error:", profileRes.error);
    if (vehiclesRes.error) console.error("[SERVER] Vehicles error:", vehiclesRes.error);

    return {
      user,
      profile: profileRes.data,
      vehicles: vehiclesRes.data || []
    };
  });
