/**
 * Notification push dispatcher — CRON RETRY/RECOVERY PATH ONLY.
 *
 * The primary dispatch is immediate (see src/lib/push/immediate.functions.ts,
 * invoked right after the notification row is inserted). This cron re-scans
 * for rows whose immediate send failed or never ran.
 *
 * All logic lives in src/lib/push/dispatch.server.ts — do not duplicate it here.
 */
import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCron, cronForbidden } from "@/lib/cron-auth";

export const Route = createFileRoute("/api/public/hooks/notification-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCron(request)) return cronForbidden();

        try {
          const { dispatchCustomerNotifications, dispatchPartnerNotifications, dispatchAdminAlerts } = await import(
            "@/lib/push/dispatch.server"
          );
          const [c, p, a] = await Promise.all([
            dispatchCustomerNotifications(),
            dispatchPartnerNotifications(),
            dispatchAdminAlerts(),
          ]);
          return Response.json({ ok: true, customer: c, partner: p, admin: a });
        } catch (e: any) {
          console.error("[notification-push] failed", e);
          return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
      GET: async () => Response.json({ ok: true, hint: "POST to dispatch" }),
    },
  },
});
