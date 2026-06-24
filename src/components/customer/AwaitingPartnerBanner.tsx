import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, UserCheck, Clock } from "lucide-react";

/**
 * Shows the Daily Shine assignment status for the current user.
 * - awaiting / offered / broadcast → "Awaiting Partner Assignment"
 * - assigned → partner name + rating
 */
export function AwaitingPartnerBanner({ userId }: { userId: string | null }) {
  const qc = useQueryClient();

  const { data: queue } = useQuery({
    queryKey: ["sub-queue", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("subscription_assignment_queue")
        .select("id, status, assigned_partner_id, created_at")
        .eq("customer_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { id: string; status: string; assigned_partner_id: string | null } | null;
    },
  });

  const { data: partner } = useQuery({
    queryKey: ["sub-queue-partner", queue?.assigned_partner_id],
    enabled: !!queue?.assigned_partner_id,
    queryFn: async () => {
      const { data } = await supabase.from("partners")
        .select("full_name, rating")
        .eq("id", queue!.assigned_partner_id!)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`sub-queue-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_assignment_queue", filter: `customer_id=eq.${userId}` }, () => {
        qc.invalidateQueries({ queryKey: ["sub-queue", userId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);

  if (!queue) return null;
  if (queue.status === "assigned" && partner) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-success/30 bg-success/5 p-4">
        <UserCheck className="h-5 w-5 text-success" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Your Urban Wash Partner is assigned</p>
          <p className="text-xs text-muted-foreground">{partner.full_name} · ★ {Number(partner.rating ?? 5).toFixed(1)}</p>
        </div>
      </div>
    );
  }
  if (queue.status === "failed") {
    return (
      <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        We couldn't find a partner automatically. Our team will assign one shortly.
      </div>
    );
  }
  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
      <div className="min-w-0">
        <p className="text-sm font-semibold">Awaiting Partner Assignment</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" /> We're matching you with the best partner in your area.
        </p>
      </div>
    </div>
  );
}
