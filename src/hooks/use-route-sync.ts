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
    const ch = supabase
      .channel(`route-sync-partner:${partnerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "partner_notifications", filter: `partner_id=eq.${partnerId}` },
        (payload) => {
          const row = payload.new as any;
          if (row?.type !== "route_updated") return;
          toast.message("Route updated by Operations", {
            description: row.body ?? "Your route was refreshed.",
          });
          qc.invalidateQueries({ queryKey: ["partner-services"] });
          qc.invalidateQueries({ queryKey: ["partner-route"] });
          qc.invalidateQueries({ queryKey: ["partner-today"] });
          qc.invalidateQueries({ queryKey: ["partner-assignments"] });
          qc.invalidateQueries({ queryKey: ["partner-live"] });
          qc.invalidateQueries({ queryKey: ["partner-notifications-unread"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "services", filter: `partner_id=eq.${partnerId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["partner-services"] });
          qc.invalidateQueries({ queryKey: ["partner-route"] });
          qc.invalidateQueries({ queryKey: ["partner-today"] });
          qc.invalidateQueries({ queryKey: ["partner-assignments"] });
          qc.invalidateQueries({ queryKey: ["partner-live"] });
        }
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

