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
    console.log(`[UNAVAILABLE-E2E:01] PARTNER_UNAVAILABLE_ACTION id=${data.serviceId} type=${data.type}`);
    const { sendOfferPush } = await import("./send.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Resolve status (Checkpoint 02)
    const { data: svc } = await supabaseAdmin.from("services").select("status").eq("id", data.serviceId).maybeSingle();
    console.log(`[UNAVAILABLE-E2E:02] SERVICE_STATUS_UPDATED status=${svc?.status}`);

    // 2. Resolve user_id (Checkpoint 05)
    const { data: customer } = await (supabaseAdmin as any)
      .from("customer_profiles")
      .select("user_id")
      .eq("id", data.customerId)
      .single();

    if (!customer?.user_id) {
      console.error(`[UNAVAILABLE-E2E:FAILURE] Could not resolve user_id for customer_id=${data.customerId}`);
      return { ok: false, error: "no_user_id" };
    }
    const userId = customer.user_id;
    console.log(`[UNAVAILABLE-E2E:05] CUSTOMER_USER_RESOLVED user_id=${userId}`);

    // 3. Verify notification row (Checkpoint 03/04)
    const { data: notif } = await supabaseAdmin
      .from("customer_notifications")
      .select("id, type")
      .eq("user_id", userId)
      .eq("metadata->>service_id", data.serviceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (notif) {
      console.log(`[UNAVAILABLE-E2E:03] CUSTOMER_NOTIFICATION_CREATED id=${notif.id}`);
      console.log(`[UNAVAILABLE-E2E:04] NOTIFICATION_TYPE_RESOLVED type=${notif.type}`);
    }

    // 4. Send (Checkpoint 07/08)
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

    if (res.sent > 0) {
      console.log(`[UNAVAILABLE-E2E:08] FCM_SERVER_ACCEPTED message_id=${res.results[0]?.messageId}`);
    } else {
      console.error(`[UNAVAILABLE-E2E:FAILURE] FCM_SEND_FAILED result=${JSON.stringify(res)}`);
    }

    return { ok: true, ...res };
  });
