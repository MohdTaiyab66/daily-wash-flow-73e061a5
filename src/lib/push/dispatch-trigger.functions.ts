import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Triggers the marketplace broadcast fan-out logic.
 * Used by the cron job to periodically retry and broadcast all open bookings.
 * Includes detailed logs for [BOOKING-PUSH:01-09].
 */
export const dispatchMarketplacePushes = createServerFn({ method: "POST" })
  .handler(async () => {
    try {
      console.log("[BOOKING-PUSH:01] BOOKING_OPEN: marketplace fan-out tick started");
      
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { dispatchBookingPushes } = await import("./dispatch.server");
      
      const { data: openBookings, error } = await (supabaseAdmin as any).rpc("get_all_open_broadcast_bookings");
      
      if (error) throw error;
      if (!openBookings || openBookings.length === 0) {
        console.log("[BOOKING-PUSH:09] RETRIES_STOPPED: no open bookings found");
        return { ok: true, dispatched: 0 };
      }

      console.log(`[BOOKING-PUSH:02] ELIGIBLE_PARTNERS_FOUND: scanning ${openBookings.length} bookings`);
      const totalDispatched = await dispatchBookingPushes(openBookings);
      
      console.log(`[BOOKING-PUSH:09] RETRIES_STOPPED: ${totalDispatched} fan-outs completed`);
      return { ok: true, totalDispatched };
    } catch (e: any) {
      console.error("[BOOKING-PUSH:ERROR] Dispatch tick failed", e);
      return { ok: false, error: e?.message ?? String(e) };
    }
  });
