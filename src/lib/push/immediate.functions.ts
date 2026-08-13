/**
 * Immediate push dispatch — the PRIMARY delivery path.
 *
 * Both of these call the same shared functions as the pg_cron endpoints
 * (src/lib/push/dispatch.server.ts). Cron is retry/recovery only.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Called by the partner app right after `respond_subscription_offer` succeeds,
 * so the customer's "partner accepted" notification lands in ~1-2s instead of
 * waiting for the 1-minute cron. Idempotent: rows already stamped `pushed_at`
 * are skipped, and any row whose send fails stays queued for the cron retry.
 */
export const flushNotificationPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { dispatchCustomerNotifications, dispatchPartnerNotifications } = await import(
      "@/lib/push/dispatch.server"
    );
    try {
      console.log("[CUSTOMER-SERVICE-PUSH:E4] flushNotificationPush manual trigger started");
      const [customer, partner] = await Promise.all([
        dispatchCustomerNotifications(),
        dispatchPartnerNotifications(),
      ]);
      console.log(`[CUSTOMER-SERVICE-PUSH:E5] flushNotificationPush results: customer=${customer}, partner=${partner}`);
      return { ok: true as const, customer, partner };
    } catch (e: any) {
      // Never surface push failures to the UI — cron picks it up.
      console.warn("[immediate-push] flushNotificationPush failed", e);
      return { ok: false as const, customer: 0, partner: 0 };
    }
  });

/**
 * [CUSTOMER-COMPLETE-PUSH] BYPASS DISPATCHER
 * Directly sends a service completion notification using the PROVEN FCM path.
 */
export const sendDirectCompletionPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        customerId: z.string().uuid(),
        serviceId: z.string().uuid(),
        type: z.enum(["service_completed", "service_unavailable", "vehicle_unavailable", "vehicle_dirty", "dirty_vehicle"]),
        title: z.string(),
        body: z.string(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { sendOfferPush } = await import("./send.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    console.log(`[CUSTOMER-COMPLETE-PUSH:01] START customer_id=${data.customerId} service_id=${data.serviceId} type=${data.type}`);

    // Resolve the customer's user_id from their customer_id
    const { data: customer } = await (supabaseAdmin as any)
      .from("customer_profiles")
      .select("user_id")
      .eq("id", data.customerId)
      .single();

    if (!customer?.user_id) {
      console.error(`[CUSTOMER-COMPLETE-PUSH:ERR] Could not resolve user_id for customer_id=${data.customerId}`);
      return { ok: false, error: "no_user_id" };
    }

    const userId = customer.user_id;

    // Use the SAME proven send function and payload structure as Direct Test Push
    const res = await sendOfferPush({
      userId,
      title: data.title,
      body: data.body,
      data: {
        type: data.type,
        service_id: data.serviceId,
        sent_at: new Date().toISOString(),
        broadcast_id: `svc:${data.serviceId}:${Date.now()}`,
        action_token: `token:${data.serviceId}`,
        offer_id: data.serviceId,
      },
      channelId: "assignments_v4",
      dataOnly: true, // Native heads-up path
    });

    console.log(`[CUSTOMER-COMPLETE-PUSH:05] FCM_RESPONSE`, res);
    return { ok: true, ...res };
  });
