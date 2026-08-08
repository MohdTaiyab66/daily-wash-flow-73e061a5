import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Mark the customer's active subscription for cancellation at the end of the
 * current billing cycle. Existing renewal cron should skip subscriptions with
 * `cancel_at_period_end = true` once `renewal_date <= now()`.
 */
export const requestCancellation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subscriptionId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: row, error } = await supabase
      .from("subscriptions")
      .update({ cancel_at_period_end: true, cancelled_at: new Date().toISOString() })
      .eq("id", data.subscriptionId)
      .eq("user_id", userId)
      .select("id, cancel_at_period_end, cancelled_at, renewal_date")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Subscription not found");
    return row;
  });

export const undoCancellation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subscriptionId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("subscriptions")
      .update({ cancel_at_period_end: false, cancelled_at: null })
      .eq("id", data.subscriptionId)
      .eq("user_id", userId)
      .select("id, cancel_at_period_end")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Subscription not found");
    return row;
  });

export const getActiveSubscriptionForVehicle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { vehicleId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("subscriptions")
      .select("id, status, renewal_date, cancel_at_period_end, cancelled_at, amount, plan_slug")
      .eq("user_id", userId)
      .eq("vehicle_id", data.vehicleId)
      .in("status", ["active", "assigned", "awaiting_partner_assignment"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });
