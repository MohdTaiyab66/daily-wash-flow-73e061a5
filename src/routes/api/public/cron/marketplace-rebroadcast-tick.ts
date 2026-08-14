import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCron, cronForbidden } from "@/lib/cron-auth";

/**
 * MARKETPLACE RE-BROADCAST TICK
 * Triggered every 30 seconds by pg_cron.
 * 
 * 1. Sweep expired offers (timeout logic).
 * 2. Reconcile and dispatch pushes for all open bookings.
 */
export const Route = createFileRoute("/api/public/cron/marketplace-rebroadcast-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCron(request)) return cronForbidden();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          
          // 1. Clean up stale/expired offers
          await (supabaseAdmin as any).rpc("sweep_subscription_offers");
          
          // 2. Dispatch the fan-out
          const { dispatchMarketplacePushes } = await import("@/lib/push/dispatch-trigger.functions");
          await dispatchMarketplacePushes();
          
          return new Response("ok");
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e?.message }), { status: 500 });
        }
      },
    },
  },
});
