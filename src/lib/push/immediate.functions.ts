/**
 * Immediate push dispatch — the PRIMARY delivery path.
 *
 * Both of these call the same shared functions as the pg_cron endpoints
 * (src/lib/push/dispatch.server.ts). Cron is retry/recovery only.
 */
import { createServerFn } from "@tanstack/react-start";
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
