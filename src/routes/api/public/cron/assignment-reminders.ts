/**
 * Cron endpoint for partner assignment reminders.
 * Runs every 5-15 minutes to nudge partners who haven't accepted their route.
 */
import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCron, cronForbidden } from "@/lib/cron-auth";

export const Route = createFileRoute("/api/public/cron/assignment-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCron(request)) return cronForbidden();

        try {
          const { dispatchAssignmentReminders } = await import("@/lib/push/reminders.server");
          const sent = await dispatchAssignmentReminders();
          return Response.json({ ok: true, sent });
        } catch (e: any) {
          console.error("[assignment-reminders] failed", e);
          return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
      GET: async ({ request }) => {
        if (!isAuthorizedCron(request)) return cronForbidden();
        return Response.json({ ok: true, hint: "POST to trigger reminders" });
      },
    },
  },
});
