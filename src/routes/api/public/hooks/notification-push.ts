/**
 * Notification push dispatcher.
 *
 * Called by pg_cron every minute. Finds recent unpushed notifications in
 *   - customer_notifications (service_reassigned)
 *   - partner_notifications  (new_assignments, offer_accepted, etc.)
 *   - admin_alerts           (dar_event and similar)
 * and dispatches an FCM push to every registered device for the recipient.
 *
 * Notifications are marked `pushed_at = now()` so retries are idempotent.
 */
import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCron, cronForbidden } from "@/lib/cron-auth";
import { sendOfferPush } from "@/lib/push/send.server";


async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/**
 * H-2: server-side allow-list of notification types the Customer App may
 * receive. Anything else — partner lifecycle events, marketplace offers,
 * assignment/dispatch internals — is silently dropped even if a future bug
 * or manual insert accidentally lands in `customer_notifications`.
 *
 * Keep this list in sync with the product spec in docs/uw-release-audit.md.
 */
const CUSTOMER_ALLOWED_TYPES = new Set<string>([
  // Payment lifecycle
  "payment_success",
  "payment_failed",
  "payment_cancelled",
  "payment_pending",
  "subscription_paid",
  "subscription_activated",
  "booking_confirmed",
  "refund_processing",
  // Service lifecycle (customer-visible only)
  "service_completed",
  "service_started",
  "partner_accepted",

  "completed",
  "vehicle_unavailable",
  "service_unavailable",
  "vehicle_dirty",
  "dirty_vehicle",
  "extension_applied",
  "addon_completed",
  "entitlement_exhausted",
  // Reminders
  "weekly_wash_reminder",
  "weekly_included_reminder",
  "renewal_reminder",
  "subscription_renewing_soon",
  "expiry_reminder",
  "subscription_expiring_soon",
]);

/**
 * H-1: partner-side types that must render through the unified Kotlin
 * heads-up path (assignments_v4 channel, uw_offer.mp3, full-screen intent,
 * deep link on tap). MUST match `ASSIGNMENT_TYPES` in
 * android-native/kotlin/UrbanwashMessagingService.kt.
 */
const PARTNER_ASSIGNMENT_TYPES = new Set<string>([
  "new_assignment",
  "new_assignments",
  "assignment_created",
  "assignment_updated",
  "partner_assigned",
  "daily_shine",
  "daily_shine_offer",
  "new_booking",
  "new_customers",
  "route_updated",
]);

async function dispatchCustomer(sb: any) {
  const { data: rows } = await sb
    .from("customer_notifications")
    .select("id,user_id,title,body,type,link")
    .is("pushed_at", null)
    .gt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .limit(50);
  for (const r of rows ?? []) {
    const type = String(r.type ?? "");
    if (!CUSTOMER_ALLOWED_TYPES.has(type)) {
      // Not a customer-facing type — mark as processed so we don't retry
      // forever, but do NOT dispatch a push. This is the H-2 safety net.
      await sb
        .from("customer_notifications")
        .update({ pushed_at: new Date().toISOString() })
        .eq("id", r.id);
      // eslint-disable-next-line no-console
      console.warn(`[notification-push] blocked customer notification type="${type}" id=${r.id}`);
      continue;
    }
    try {
      await sendOfferPush({
        userId: r.user_id,
        title: r.title,
        body: r.body ?? "",
        data: { type, link: r.link ?? "" },
        channelId: "general",
      });
    } catch {
      /* keep going */
    }
    await sb.from("customer_notifications").update({ pushed_at: new Date().toISOString() }).eq("id", r.id);
  }
  return rows?.length ?? 0;
}

async function dispatchPartner(sb: any) {
  const { data: rows } = await sb
    .from("partner_notifications")
    .select("id,partner_id,title,body,type,link,metadata")
    .is("pushed_at", null)
    // Daily Shine offer pushes are owned exclusively by
    // /api/public/cron/offer-push-dispatch, keyed by offer_id and logged in
    // offer_delivery_events. Sending them here creates a second FCM path.
    .neq("type", "daily_shine_offer")
    .gt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .limit(50);
  for (const r of rows ?? []) {
    const type = String(r.type ?? "");
    const isAssignment = PARTNER_ASSIGNMENT_TYPES.has(type);
    try {
      await sendOfferPush({
        userId: r.partner_id,
        title: r.title,
        body: r.body ?? "",
        data: {
          type,
          link: r.link ?? (isAssignment ? "/app/assignments" : ""),
          // Kotlin uses these to key the notification and deep link.
          ...(r.metadata?.assignment_id ? { assignment_id: String(r.metadata.assignment_id) } : {}),
          ...(r.metadata?.service_id ? { service_id: String(r.metadata.service_id) } : {}),
        },
        // Unified assignment channel; general otherwise.
        channelId: isAssignment ? "assignments_v4" : "general",
        // dataOnly so the Kotlin service always builds the heads-up (custom
        // channel, uw_offer.mp3, full-screen intent) — even when the app is
        // backgrounded or swiped away.
        dataOnly: isAssignment,
        tag: isAssignment ? `assignment:${r.id}` : undefined,
      });
    } catch {

      /* noop */
    }
    await sb.from("partner_notifications").update({ pushed_at: new Date().toISOString() }).eq("id", r.id);
  }
  return rows?.length ?? 0;
}

async function dispatchAdmin(sb: any) {
  const { data: rows } = await sb
    .from("admin_alerts")
    .select("id,title,body,kind,meta")
    .is("pushed_at", null)
    .gt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .limit(20);
  if (!rows?.length) return 0;
  const { data: admins } = await sb.rpc("get_admin_user_ids").catch(() => ({ data: null }));
  const adminIds: string[] = (admins ?? []).map((x: any) => x.user_id ?? x);
  for (const r of rows) {
    for (const uid of adminIds) {
      try {
        await sendOfferPush({
          userId: uid,
          title: r.title,
          body: r.body ?? "",
          data: { type: "admin_alert", kind: r.kind ?? "" },
          channelId: "general",
        });
      } catch {
        /* noop */
      }
    }
    await sb.from("admin_alerts").update({ pushed_at: new Date().toISOString() }).eq("id", r.id);
  }
  return rows.length;
}

export const Route = createFileRoute("/api/public/hooks/notification-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCron(request)) return cronForbidden();

        const sb = await admin();
        const [c, p, a] = await Promise.all([dispatchCustomer(sb), dispatchPartner(sb), dispatchAdmin(sb)]);
        return Response.json({ ok: true, customer: c, partner: p, admin: a });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to dispatch" }),
    },
  },
});
