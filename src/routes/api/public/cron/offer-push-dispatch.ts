/**
 * Daily Shine offer push — CRON RETRY/RECOVERY PATH ONLY.
 *
 * The primary dispatch is immediate (see src/lib/push/immediate.functions.ts,
 * invoked right after payment verification creates the offers). This cron
 * exists to pick up anything the immediate path missed or failed to send.
 *
 * All logic lives in src/lib/push/dispatch.server.ts — do not duplicate it here.
 */
import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCron, cronForbidden } from "@/lib/cron-auth";

async function handle(request: Request) {
  // Auth: x-cron-secret OR the Supabase apikey header pg_cron sends.
  if (!isAuthorizedCron(request)) return cronForbidden();

  try {
    const { dispatchPendingOffers } = await import("@/lib/push/dispatch.server");
    const dispatched = await dispatchPendingOffers("cron:offer-push-dispatch");
    return Response.json({ ok: true, dispatched });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/cron/offer-push-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
