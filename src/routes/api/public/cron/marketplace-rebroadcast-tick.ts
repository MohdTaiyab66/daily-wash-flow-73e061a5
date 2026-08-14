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
        const isAuthorized = isAuthorizedCron(request);
        if (!isAuthorized) return cronForbidden();


        try {
          console.log("[BOOKING-PUSH:CRON] TICK_STARTED");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          
          // 1. Clean up stale/expired offers
          await (supabaseAdmin as any).rpc("sweep_subscription_offers");
          
          // 2. Dispatch the fan-out
          // Use the internal trigger which recalculates eligibility
          const { dispatchMarketplacePushes } = await import("@/lib/push/dispatch-trigger.functions");
          const result = await dispatchMarketplacePushes();
          
          if (result.ok) {
            console.log(`[BOOKING-PUSH:CRON] NEXT_TICK total_dispatched=${result.totalDispatched ?? 0}`);
          }
          
          return new Response("ok");
        } catch (e: any) {
          console.error("[BOOKING-PUSH:CRON] TICK_FAILED", e);
          return new Response(JSON.stringify({ error: e?.message }), { status: 500 });
        }
      },
    },
  },
});
