import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Partner side: when Operations saves a manual route change,
 * the server inserts a `partner_notifications` row with type='route_updated'.
 * Refresh every route-related query the partner app uses, and show a toast.
 */
export function usePartnerRouteSync(partnerId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!partnerId) return;

    // Single source of truth for every partner surface that renders the route:
    // Home / Live Route / My Assignment all read these keys.
    const refreshRoute = () => {
      qc.invalidateQueries({ queryKey: ["today-assignment"] });
      qc.invalidateQueries({ queryKey: ["route-today"] });
      qc.invalidateQueries({ queryKey: ["route-preview"] });
      qc.invalidateQueries({ queryKey: ["my-assignment"] });
      qc.invalidateQueries({ queryKey: ["cancellability"] });
      qc.invalidateQueries({ queryKey: ["marketplace-offers"] });
      qc.invalidateQueries({ queryKey: ["earnings-v3"] });
      qc.invalidateQueries({ queryKey: ["wallet-balance"] });
    };

    const ch = supabase
      .channel(`route-sync-partner:${partnerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "partner_notifications", filter: `partner_id=eq.${partnerId}` },
        (payload) => {
          const row = payload.new as any;
          if (row?.type !== "route_updated") return;
          toast.message("Route updated", {
            description: row.body ?? "Your route was refreshed.",
          });
          refreshRoute();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "services", filter: `partner_id=eq.${partnerId}` },
        refreshRoute
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "assignments", filter: `partner_id=eq.${partnerId}` },
        refreshRoute
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [partnerId, qc]);
}


// Customer-side route sync has been removed by product policy.
// Customers must never see ETA, route position, or partner movement.
// Operational route changes that respect the customer's service window
// do NOT generate customer notifications.

