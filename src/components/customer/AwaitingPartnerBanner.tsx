import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Star, Search, UserCheck, Loader2, PlayCircle, CheckCircle2 } from "lucide-react";
import { StatusChip } from "@/components/customer/ui/kit";
import { cn } from "@/lib/utils";

/**
 * Customer-facing status card for Daily Shine.
 *
 * Source of truth (in this order):
 *   1. `subscriptions.assigned_partner_id`  → partner is confirmed for this
 *      vehicle. Show partner card. Never show "unable to assign".
 *   2. Today's `services` row for this customer → show live status
 *      (in-progress / completed) and the servicing partner.
 *   3. `subscription_assignment_queue`      → only used to distinguish
 *      "searching" vs "unable to assign automatically" when NO partner is
 *      assigned anywhere.
 *
 * Per product policy: no ETA, no live location, no route position.
 */

type Sub = {
  id: string;
  vehicle_id: string | null;
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
  partner_id: string | null;
  vehicle_id: string | null;
};

type Queue = {
  id: string;
  status: string;
  assigned_partner_id: string | null;
  booking_id: string;
};

export function AwaitingPartnerBanner({
  userId,
  vehicleId = null,
}: {
  userId: string | null;
  vehicleId?: string | null;
}) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  // 1) Active/awaiting subscriptions for this user, scoped to the selected vehicle when given.
  const { data: subs } = useQuery({
    queryKey: ["awaiting-partner-subs", userId, vehicleId],
    enabled: !!userId,
    queryFn: async () => {
      let q: any = (supabase as any)
        .from("subscriptions")
        .select("id, vehicle_id, status, assigned_partner_id, booking_id")
        .eq("user_id", userId)
        .in("status", ["active", "awaiting_partner_assignment", "assigned"])
        .order("created_at", { ascending: false });
      if (vehicleId) q = q.eq("vehicle_id", vehicleId);
      const { data } = await q;
      return (data ?? []) as Sub[];
    },
  });

  // 2) Today's service (if any) — carries the servicing partner + live status.
  const { data: todayService } = useQuery({
    queryKey: ["customer-today-service", userId, today, vehicleId],
    enabled: !!userId,
    queryFn: async () => {
      let q: any = (supabase as any)
        .from("services")
        .select("id, status, started_at, completed_at, partner_id, vehicle_id")
        .eq("customer_id", userId)
        .eq("scheduled_date", today)
        .order("created_at", { ascending: false })
        .limit(1);
      if (vehicleId) q = q.eq("vehicle_id", vehicleId);
      const { data } = await q.maybeSingle();
      return data as TodayService | null;
    },
  });

  // Pick the "primary" subscription to describe: one that already has a
  // partner if any, else the newest awaiting.
  const primarySub =
    subs?.find((s) => !!s.assigned_partner_id) ?? subs?.[0] ?? null;

  // 3) Only look at the queue when no partner is assigned anywhere.
  const noPartnerAnywhere =
    !todayService?.partner_id && !primarySub?.assigned_partner_id;

  const { data: queue } = useQuery({
    queryKey: ["awaiting-partner-queue", userId],
    enabled: !!userId && noPartnerAnywhere,
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

  // 3b) Open marketplace broadcast for this customer — while a broadcast is
  // still open we must keep showing "Searching…", never "unable to assign".
  const { data: openBroadcast } = useQuery({
    queryKey: ["awaiting-partner-broadcast", userId, primarySub?.id ?? null],
    enabled: !!userId && noPartnerAnywhere,
    refetchInterval: 15000,
    queryFn: async () => {
      let q: any = (supabase as any)
        .from("marketplace_broadcasts")
        .select("id, status, subscription_id")
        .eq("customer_id", userId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1);
      if (primarySub?.id) q = q.eq("subscription_id", primarySub.id);
      const { data } = await q.maybeSingle();
      return data as { id: string; status: string } | null;
    },
  });

  // Booking window: prefer today's service booking; else the primary sub's booking.
  const bookingIdForWindow = primarySub?.booking_id ?? queue?.booking_id ?? null;
  const { data: booking } = useQuery({
    queryKey: ["awaiting-partner-booking", bookingIdForWindow],
    enabled: !!bookingIdForWindow,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("bookings")
        .select("id, preferred_before_time, scheduled_date")
        .eq("id", bookingIdForWindow!)
        .maybeSingle();
      return data as Booking | null;
    },
  });

  const assignedPartnerId =
    todayService?.partner_id ?? primarySub?.assigned_partner_id ?? null;

  const { data: partner } = useQuery({
    queryKey: ["awaiting-partner-profile", assignedPartnerId],
    enabled: !!assignedPartnerId,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("get_assigned_partner_public", {
        p_partner_id: assignedPartnerId!,
      });
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as
        | { full_name: string; rating: number | null; profile_photo_url: string | null; created_at: string | null }
        | null;
    },
  });

  // Realtime: refetch when anything relevant to this user changes.
  useEffect(() => {
    if (!userId) return;
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ["awaiting-partner-subs", userId] });
      qc.invalidateQueries({ queryKey: ["awaiting-partner-queue", userId] });
      qc.invalidateQueries({ queryKey: ["awaiting-partner-broadcast", userId] });
      qc.invalidateQueries({ queryKey: ["customer-today-service", userId, today] });
    };
    const ch = supabase
      .channel(`sub-status-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_assignment_queue", filter: `customer_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "services", filter: `customer_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "marketplace_broadcasts", filter: `customer_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, qc, today]);

  // Nothing to show when the user has no Daily Shine at all.
  if (!subs || subs.length === 0) return null;

  const serviceWindow = booking?.preferred_before_time?.trim() || null;
  const completedAt = todayService?.completed_at ? new Date(todayService.completed_at) : null;
  const inProgress = todayService?.status === "in_progress";
  const completed = todayService?.status === "completed";

  type State = "searching" | "assigned" | "in_progress" | "completed" | "unassignable";
  let state: State;
  if (completed) state = "completed";
  else if (inProgress) state = "in_progress";
  else if (assignedPartnerId) state = "assigned";
  else if (queue?.status === "failed" && !openBroadcast) state = "unassignable";
  else state = "searching";

  // Hard block: if we have an assigned partner anywhere, never render the red
  // "unable to assign" state — even if a stale queue row still says "failed".
  if (state === "unassignable" && assignedPartnerId) state = "assigned";

  if (state === "unassignable") {
    return (
      <div className="mt-6 rounded-3xl border border-destructive/20 bg-destructive/5 p-5 text-[13px] font-medium leading-relaxed text-destructive/80">
        We're unable to assign a partner automatically. Our team will take care of this for you shortly.
      </div>
    );
  }

  const tone =
    state === "completed"
      ? "border-success/10 bg-success/5"
      : state === "in_progress"
      ? "border-primary/10 bg-primary/5"
      : state === "assigned"
      ? "border-success/10 bg-success/5"
      : "border-primary/10 bg-primary/5";

  const titleMap: Record<Exclude<State, "unassignable">, string> = {
    searching: "Subscription activated · Waiting for area assignment",
    assigned: "Today's service scheduled",
    in_progress: "Your Daily Shine service is in progress",
    completed: "Service completed",
  };
  const copyMap: Record<Exclude<State, "unassignable">, string> = {
    searching: "You're all set. We'll notify you once your first service is completed.",
    assigned: "", // Empty so it's not rendered
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
      : "text-primary";

  return (
    <div className={cn("rounded-[22px] border border-[#EEEEEE] bg-white p-5 shadow-sm", tone)}>
      {serviceWindow && (
        <div className="mb-4 flex items-center gap-3 border-b border-[#F5F5F5] pb-4">
          <Clock className="h-4 w-4 text-[#FF6B00]" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#8A8A8A]">Today's window</p>
            <p className="text-[15px] font-bold text-[#1A1A1A]">{serviceWindow}</p>
          </div>
          <div className="ml-auto">
            <StatusChip tone={state === "completed" ? "success" : "brand"} className="h-5 px-2 text-[9px] font-bold uppercase tracking-wider">
               {state === "completed" ? "Completed" : "Scheduled"}
            </StatusChip>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold tracking-tight text-[#1A1A1A]">{titleMap[state]}</p>
          {copyMap[state] && <p className="mt-1 text-[13px] font-medium leading-relaxed text-[#555555]">{copyMap[state]}</p>}

          {partner && state !== "searching" && (
            <div className="mt-4 flex items-center gap-3">
              {partner.profile_photo_url ? (
                <img
                  src={partner.profile_photo_url}
                  alt={partner.full_name}
                  className="h-10 w-10 rounded-xl object-cover"
                />
              ) : (
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#E8F5E9] text-[14px] font-bold text-[#2E7D32]">
                  {partner.full_name?.[0] ?? "P"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-[#1A1A1A]">{partner.full_name}</p>
                <div className="flex items-center gap-2 text-[11px] font-medium text-[#8A8A8A]">
                  <span className="inline-flex items-center gap-1 text-[#FF6B00]">
                    <Star className="h-3 w-3 fill-current" /> {Number(partner.rating ?? 5).toFixed(1)}
                  </span>
                  <span className="opacity-30">·</span>
                  <span>{state === "assigned" ? "Partner assigned" : state === "in_progress" ? "Service in progress" : "Partner"}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

