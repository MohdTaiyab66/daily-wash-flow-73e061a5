import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

/**
 * Server function to fetch initial customer context in parallel.
 * This reduces waterfalls during app startup.
 */
export const getInitialCustomerContext = createServerFn({ method: "GET" })
  .handler(async () => {
    // Note: requireSupabaseAuth middleware would block if no session.
    // We let the client handle redirects, but we want to fetch data efficiently if auth exists.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const [profileRes, vehiclesRes] = await Promise.all([
      supabase.from("customer_profiles").select("*").eq("user_id", user.id).single(),
      supabase.from("customer_vehicles").select("*").eq("user_id", user.id)
    ]);

    return {
      user,
      profile: profileRes.data,
      vehicles: vehiclesRes.data || []
    };
  });
