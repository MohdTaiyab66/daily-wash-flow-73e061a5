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
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { dispatchBookingPushes } = await import("./dispatch.server");
      
      const { data: openBookings, error } = await (supabaseAdmin as any).rpc("get_all_open_broadcast_bookings");
      
      if (error) throw error;
      if (!openBookings || openBookings.length === 0) {
        return { ok: true, dispatched: 0 };
      }

      console.log(`[BOOKING-PUSH:CRON] OPEN_BOOKINGS_FOUND count=${openBookings.length}`);
      const totalDispatched = await dispatchBookingPushes(openBookings);
      
      return { ok: true, totalDispatched };
    } catch (e: any) {
      console.error("[BOOKING-PUSH:ERROR] Dispatch tick failed", e);
      return { ok: false, error: e?.message ?? String(e) };
    }
  });
