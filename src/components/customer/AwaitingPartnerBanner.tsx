import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Star, Search, UserCheck, Loader2, PlayCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Customer-facing status card for Daily Shine.
 *
 * Per product policy we DO NOT expose ETA, live location, route position,
 * stop number, or any optimisation detail. Customers only see:
 *   1. Today's promised service window (e.g. "Before 10:00 AM")
 *   2. A simple status (Scheduled / Searching Partner / Partner Assigned /
 *      In Progress / Completed)
 *   3. The assigned partner's profile (name, photo, rating) — no location.
 */

type Queue = {
  id: string;
  status: string;
  assigned_partner_id: string | null;
  booking_id: string;
};

type Booking = {
  id: string;
  preferred_before_time: string | null;
  scheduled_date: string | null;
};

type TodayService = {
  id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
};

export function AwaitingPartnerBanner({ userId }: { userId: string | null }) {
  const qc = useQueryClient();

  const { data: queue } = useQuery({
    queryKey: ["sub-queue", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("subscription_assignment_queue")
        .select("id, status, assigned_partner_id, booking_id")
        .eq("customer_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as Queue | null;
    },
  });

  const { data: booking } = useQuery({
    queryKey: ["sub-queue-booking", queue?.booking_id],
    enabled: !!queue?.booking_id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("bookings")
        .select("id, preferred_before_time, scheduled_date")
        .eq("id", queue!.booking_id)
        .maybeSingle();
      return data as Booking | null;
    },
  });

  const { data: partner } = useQuery({
    queryKey: ["sub-queue-partner", queue?.assigned_partner_id],
    enabled: !!queue?.assigned_partner_id,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("get_assigned_partner_public", {
        p_partner_id: queue!.assigned_partner_id!,
      });
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as
        | { full_name: string; rating: number | null; profile_photo_url: string | null; created_at: string | null }
        | null;
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const { data: todayService } = useQuery({
    queryKey: ["customer-today-service", userId, today],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("services")
        .select("id, status, started_at, completed_at")
        .eq("customer_id", userId)
        .eq("scheduled_date", today)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as TodayService | null;
    },
  });

  // Realtime: refresh on queue, service, and partner changes only.
  useEffect(() => {
    if (!userId) return;
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ["sub-queue", userId] });
      qc.invalidateQueries({ queryKey: ["customer-today-service", userId, today] });
    };
    const ch = supabase
      .channel(`sub-status-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_assignment_queue", filter: `customer_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "services", filter: `customer_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, qc, today]);

  if (!queue) return null;

  if (queue.status === "failed") {
    return (
      <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        We're unable to assign a partner automatically. Our team will take care of this for you shortly.
      </div>
    );
  }

  const serviceWindow = booking?.preferred_before_time?.trim() || null;
  const isAssigned = queue.status === "assigned" && !!queue.assigned_partner_id;
  const completedAt = todayService?.completed_at ? new Date(todayService.completed_at) : null;
  const inProgress = todayService?.status === "in_progress";
  const completed = todayService?.status === "completed";

  type State = "searching" | "assigned" | "in_progress" | "completed";
  const state: State = completed
    ? "completed"
    : inProgress
    ? "in_progress"
    : isAssigned
    ? "assigned"
    : "searching";

  const tone =
    state === "completed"
      ? "border-success/30 bg-success/5"
      : state === "in_progress"
      ? "border-primary/40 bg-primary/5"
      : state === "assigned"
      ? "border-success/30 bg-success/5"
      : "border-primary/30 bg-primary/5";

  const titleMap: Record<State, string> = {
    searching: "Searching for a partner",
    assigned: "Today's service is scheduled",
    in_progress: "Your Daily Shine service is in progress",
    completed: "Service completed",
  };
  const copyMap: Record<State, string> = {
    searching: "We're finding the right partner for your area. We'll let you know as soon as it's confirmed.",
    assigned: "Your vehicle will be serviced before your selected time.",
    in_progress: "Your partner is taking care of your vehicle now.",
    completed: completedAt
      ? `Completed at ${completedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}.`
      : "All done for today.",
  };

  const Icon =
    state === "completed"
      ? CheckCircle2
      : state === "in_progress"
      ? PlayCircle
      : state === "assigned"
      ? UserCheck
      : Search;

  const iconCls =
    state === "completed" || state === "assigned"
      ? "text-success"
      : state === "in_progress"
      ? "text-primary"
      : "text-primary";

  return (
    <div className={cn("mt-4 rounded-2xl border p-4", tone)}>
      {/* Service window */}
      {serviceWindow && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-background/70 px-3 py-2.5">
          <Clock className="h-4 w-4 text-primary" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Today's service window</p>
            <p className="text-sm font-semibold">{serviceWindow}</p>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3">
        {state === "searching" ? (
          <Loader2 className={cn("mt-0.5 h-5 w-5 animate-spin", iconCls)} />
        ) : (
          <Icon className={cn("mt-0.5 h-5 w-5", iconCls)} />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{titleMap[state]}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{copyMap[state]}</p>

          {/* Partner profile — no location, route, or ETA shown. */}
          {partner && state !== "searching" && (
            <div className="mt-3 rounded-xl bg-background/60 p-3">
              <div className="flex items-center gap-3">
                {partner.profile_photo_url ? (
                  <img
                    src={partner.profile_photo_url}
                    alt={partner.full_name}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-success/20 text-sm font-semibold text-success">
                    {partner.full_name?.[0] ?? "P"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{partner.full_name}</p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3 w-3 fill-current" /> {Number(partner.rating ?? 5).toFixed(1)}
                    </span>
                    {partner.created_at && (
                      <span>· {yearsWithUrbanWash(partner.created_at)}</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function yearsWithUrbanWash(iso: string) {
  const years = Math.max(0, (Date.now() - new Date(iso).getTime()) / (365.25 * 86400000));
  if (years < 1) {
    const months = Math.max(1, Math.round(years * 12));
    return `${months} mo with Urban Wash`;
  }
  const y = Math.floor(years);
  return `${y}+ yr${y === 1 ? "" : "s"} with Urban Wash`;
}
