import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-middleware";

/**
 * Triggers immediate push notifications to Admin devices.
 * Used after high-priority events (payment, completion, unavailability).
 */
export const dispatchAdminAlerts = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { dispatchAdminNotifications } = await import("@/lib/push/dispatch.server");
    const count = await dispatchAdminNotifications();
    return { ok: true, sent: count };
  });

/**
 * Triggers immediate push notifications to all devices of a customer.
 */
export const dispatchCustomerAlerts = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { dispatchCustomerNotifications } = await import("@/lib/push/dispatch.server");
    const count = await dispatchCustomerNotifications();
    return { ok: true, sent: count };
  });

/**
 * Triggers immediate push notifications to a partner.
 */
export const dispatchPartnerAlerts = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { dispatchPartnerNotifications } = await import("@/lib/push/dispatch.server");
    const count = await dispatchPartnerNotifications();
    return { ok: true, sent: count };
  });
