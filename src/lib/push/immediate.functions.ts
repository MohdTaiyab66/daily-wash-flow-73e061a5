import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Flush unpushed notifications immediately.
 * Called after critical state changes (start/complete service).
 */
export const flushNotificationPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { dispatchCustomerNotifications, dispatchPartnerNotifications } = await import("./dispatch.server");
    const [c, p] = await Promise.all([
      dispatchCustomerNotifications(),
      dispatchPartnerNotifications(),
    ]);
    return { customerSent: c, partnerSent: p };
  });

/**
 * Direct Completion Push Bypass.
 * Used for instant notification delivery after service completion or unavailability,
 * bypassing the standard dispatcher loop for P0 reliability.
 */
export const sendDirectCompletionPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    serviceId: z.string().uuid(),
  }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendOfferPush } = await import("./send.server");

    console.log(`[UNAVAILABLE-PUSH:01] DIRECT_BYPASS_TRIGGERED service_id=${data.serviceId}`);

    // 1. Resolve status & vehicle_id
    const { data: svc } = await supabaseAdmin.from("services").select("status, vehicle_id, customer_id").eq("id", data.serviceId).maybeSingle();
    
    if (!svc) {
      console.warn(`[UNAVAILABLE-PUSH:ERROR] Service not found id=${data.serviceId}`);
      return { ok: false };
    }
    
    console.log(`[UNAVAILABLE-PUSH:02] STATUS_UPDATED status=${svc.status} vehicle_id=${svc.vehicle_id} customer_id=${svc.customer_id}`);

    // 2. Fetch owner
    const { data: vehicle } = await supabaseAdmin.from("customer_vehicles").select("user_id").eq("id", svc.vehicle_id).maybeSingle();
    const customerId = svc.customer_id || vehicle?.user_id;

    if (!customerId) {
      console.warn(`[UNAVAILABLE-PUSH:ERROR] No customer found for vehicle=${svc.vehicle_id}`);
      return { ok: false };
    }

    // 3. Register notification row
    const type = svc.status === "completed" ? "completed" : "unavailable_report";
    const title = svc.status === "completed" ? "Service Completed ✓" : "Vehicle Unavailable";
    const body = svc.status === "completed" 
      ? "Your vehicle service has been completed successfully." 
      : "We were unable to perform today's service because your vehicle was unavailable.";

    const { data: notif } = await supabaseAdmin.from("customer_notifications").insert({
      user_id: customerId,
      vehicle_id: svc.vehicle_id,
      title,
      body,
      type,
      link: `/c/service/history/${data.serviceId}`,
      metadata: { service_id: data.serviceId }
    }).select("id").single();

    if (!notif) return { ok: false };

    // 4. Immediate Push to ALL active tokens for this account
    console.log(`[CUSTOMER-E2E:05-DIAG] IMMEDIATE_DISPATCH_STARTED notif_id=${notif.id} customer_id=${customerId} vehicle_id=${svc.vehicle_id} type=${type}`);
    
    // We use sendOfferPush which internally fetches all active tokens for the user_id
    // and routes to the correct Firebase project using the 'app' column.
    const result = await sendOfferPush({
      userId: customerId,
      title,
      body,
      data: {
        type,
        link: `/c/service/history/${data.serviceId}`,
        broadcast_id: `customer:${notif.id}`,
        action_token: String(notif.id),
        offer_id: String(notif.id),
        vehicle_id: String(svc.vehicle_id),
        service_id: data.serviceId,
      },
      channelId: "assignments_v4",
      dataOnly: true,
      tag: `customer:${notif.id}`,
    });

    if (result.sent > 0) {
      await supabaseAdmin.from("customer_notifications").update({ pushed_at: new Date().toISOString() }).eq("id", notif.id);
      console.log(`[CUSTOMER-E2E:08-FCM] FCM_ACCEPTED count=${result.sent} sample_msg_id=${result.results.find(r => r.ok)?.messageId}`);
    } else {
      console.error(`[CUSTOMER-E2E:09-FCM] FCM_FAILED for customer=${customerId}. tokens_found=${result.results.length}`);
    }

    return { ok: result.sent > 0 };
  });
