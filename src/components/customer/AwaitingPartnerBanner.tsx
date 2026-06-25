import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, UserCheck, Clock, Star, Calendar, PlayCircle, Search, Radar, Megaphone, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Queue = {
  id: string;
  status: string;
  assigned_partner_id: string | null;
  current_offer_partner_id: string | null;
  offer_expires_at: string | null;
  radius_km: number | null;
  lock_until: string | null;
  created_at: string;
  updated_at: string;
  booking_id: string;
};

const STEPS = [
  { key: "searching", label: "Searching", icon: Search,
    copy: "Finding the closest top-rated partner for your area." },
  { key: "offered", label: "Offered", icon: Radar,
    copy: "A recommended partner has been notified. Waiting for them to accept…" },
  { key: "expanding", label: "Expanding", icon: Megaphone,
    copy: "Broadening the search radius to reach more partners nearby." },
  { key: "assigned", label: "Assigned", icon: CheckCircle2,
    copy: "Your partner is locked in and your route is being optimized." },
] as const;

function stepIndex(q: Queue): number {
  if (q.status === "assigned") return 3;
  if (q.status === "offered" || q.current_offer_partner_id) return 1;
  if ((q.radius_km ?? 2) > 2) return 2;
  return 0;
}

function useCountdown(iso: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [iso]);
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return 0;
  return Math.ceil(ms / 1000);
}

export function AwaitingPartnerBanner({ userId }: { userId: string | null }) {
  const qc = useQueryClient();

  const { data: queue } = useQuery({
    queryKey: ["sub-queue", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("subscription_assignment_queue")
        .select("id, status, assigned_partner_id, current_offer_partner_id, offer_expires_at, radius_km, lock_until, created_at, updated_at, booking_id")
        .eq("customer_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as Queue | null;
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

  const idx = useMemo(() => (queue ? stepIndex(queue) : 0), [queue]);
  const secondsLeft = useCountdown(queue?.status === "offered" ? queue?.offer_expires_at ?? null : null);

  if (!queue) return null;

  if (queue.status === "failed") {
    return (
      <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        We couldn't find a partner automatically. Our team will assign one shortly.
      </div>
    );
  }

  const isAssigned = queue.status === "assigned" && !!partner;
  const current = STEPS[idx];

  return (
    <div
      className={cn(
        "mt-4 rounded-2xl border p-4",
        isAssigned ? "border-success/30 bg-success/5" : "border-primary/30 bg-primary/5",
      )}
    >
      <div className="flex items-start gap-3">
        {isAssigned ? (
          <UserCheck className="h-5 w-5 text-success mt-0.5" />
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-primary mt-0.5" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {isAssigned ? "Your Urban Wash Partner has been assigned" : "Setting up your Daily Shine"}
            </p>
            {queue.status === "offered" && secondsLeft != null && (
              <span className="text-[11px] tabular-nums text-primary font-medium">{secondsLeft}s</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{current.copy}</p>

          {/* Stepper */}
          <div className="mt-3 flex items-center gap-1.5">
            {STEPS.map((s, i) => {
              const done = i < idx || isAssigned;
              const active = i === idx && !isAssigned;
              return (
                <div key={s.key} className="flex-1">
                  <div
                    className={cn(
                      "h-1.5 rounded-full transition-colors",
                      done ? "bg-success" : active ? "bg-primary" : "bg-muted",
                    )}
                  />
                  <div className="mt-1 flex items-center gap-1">
                    <s.icon
                      className={cn(
                        "h-3 w-3",
                        done ? "text-success" : active ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <span
                      className={cn(
                        "text-[10px]",
                        done ? "text-success" : active ? "text-primary font-medium" : "text-muted-foreground",
                      )}
                    >
                      {s.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Assigned details */}
          {isAssigned && partner && (
            <div className="mt-3 rounded-xl bg-background/60 p-3">
              <div className="flex items-center gap-3">
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
                  <Calendar className="h-3 w-3" /> Assigned ·{" "}
                  <span className="text-foreground">
                    {new Date(queue.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <PlayCircle className="h-3 w-3" /> Starts ·{" "}
                  <span className="text-foreground">
                    {serviceStart
                      ? new Date(serviceStart).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                      : "Tomorrow"}
                  </span>
                </div>
              </div>
              {queue.lock_until && new Date(queue.lock_until) > new Date() && (
                <p className="mt-2 text-[11px] text-success">
                  Your partner is locked in until{" "}
                  {new Date(queue.lock_until).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} for consistency.
                </p>
              )}
            </div>
          )}

          {/* Searching / expanding hint */}
          {!isAssigned && queue.status !== "offered" && (queue.radius_km ?? 0) > 2 && (
            <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary">
              <Clock className="h-3 w-3" /> Search radius now {queue.radius_km} km
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
