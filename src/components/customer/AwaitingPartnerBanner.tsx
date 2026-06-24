import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, UserCheck, Clock, Star, Calendar, PlayCircle } from "lucide-react";

/**
 * Daily Shine assignment status banner for the current user.
 * awaiting/offered → "Awaiting Partner Assignment"
 * assigned        → trust card with partner + dates
 */
export function AwaitingPartnerBanner({ userId }: { userId: string | null }) {
  const qc = useQueryClient();

  const { data: queue } = useQuery({
    queryKey: ["sub-queue", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("subscription_assignment_queue")
        .select("id, status, assigned_partner_id, created_at, updated_at, booking_id")
        .eq("customer_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as {
        id: string; status: string; assigned_partner_id: string | null;
        created_at: string; updated_at: string; booking_id: string;
      } | null;
    },
  });

  const { data: partner } = useQuery({
    queryKey: ["sub-queue-partner", queue?.assigned_partner_id],
    enabled: !!queue?.assigned_partner_id,
    queryFn: async () => {
      const { data } = await supabase.from("partners")
        .select("full_name, rating, profile_photo_url")
        .eq("id", queue!.assigned_partner_id!)
        .maybeSingle();
      return data as { full_name: string; rating: number | null; profile_photo_url: string | null } | null;
    },
  });

  const { data: serviceStart } = useQuery({
    queryKey: ["sub-queue-start", queue?.booking_id],
    enabled: !!queue?.booking_id && queue?.status === "assigned",
    queryFn: async () => {
      const { data } = await supabase.from("bookings")
        .select("scheduled_date")
        .eq("id", queue!.booking_id)
        .maybeSingle();
      return data?.scheduled_date as string | null | undefined;
    },
  });

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`sub-queue-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscription_assignment_queue", filter: `customer_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["sub-queue", userId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);

  if (!queue) return null;

  if (queue.status === "assigned" && partner) {
    const assignedOn = new Date(queue.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const startOn = serviceStart
      ? new Date(serviceStart).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : "Tomorrow";
    return (
      <div className="mt-4 rounded-2xl border border-success/30 bg-success/5 p-4">
        <div className="flex items-start gap-3">
          <UserCheck className="h-5 w-5 text-success mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Your Urban Wash Partner has been assigned</p>
            <div className="mt-2 flex items-center gap-3">
              {partner.profile_photo_url ? (
                <img src={partner.profile_photo_url} alt={partner.full_name} className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className="h-10 w-10 rounded-full bg-success/20 flex items-center justify-center text-sm font-semibold text-success">
                  {partner.full_name?.[0] ?? "P"}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{partner.full_name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Star className="h-3 w-3 fill-current" /> {Number(partner.rating ?? 5).toFixed(1)}
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="h-3 w-3" /> Assigned · <span className="text-foreground">{assignedOn}</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <PlayCircle className="h-3 w-3" /> Starts · <span className="text-foreground">{startOn}</span>
              </div>
            </div>
          </div>
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
