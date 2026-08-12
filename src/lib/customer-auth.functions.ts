import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

/**
 * Server function to fetch initial customer context in parallel.
 * This reduces waterfalls during app startup.
 */
export const getInitialCustomerContext = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Parallel fetch using service role or standard client?
    // Using standard client to respect RLS.
    const [profileRes, vehiclesRes] = await Promise.all([
      supabase.from("customer_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("customer_vehicles").select("*").eq("user_id", user.id)
    ]);

    return {
      user,
      profile: profileRes.data,
      vehicles: vehiclesRes.data || []
    };
  });
