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

/**
 * Customer side: when Operations changes the route in a way that shifts ETA
 * beyond the platform threshold, the server inserts a `customer_notifications`
 * row with type='eta_updated'. Refresh the My Plan / Home queries and toast.
 */
export function useCustomerRouteSync(userId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`route-sync-customer:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "customer_notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as any;
          if (row?.type !== "eta_updated") return;
          toast.message("Estimated arrival updated", {
            description: row.body ?? "Operations optimized today's route.",
          });
          qc.invalidateQueries({ queryKey: ["customer-home"] });
          qc.invalidateQueries({ queryKey: ["customer-my-plan"] });
          qc.invalidateQueries({ queryKey: ["customer-services"] });
          qc.invalidateQueries({ queryKey: ["customer-notifications-unread"] });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId, qc]);
}
