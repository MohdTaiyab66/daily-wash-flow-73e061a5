import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Calendar, Pause, Sparkles, CheckCircle2, Clock, Plus, RefreshCw, Droplets, Wrench, CalendarPlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/c/_authed/subscriptions")({
  ssr: false,
  head: () => ({ meta: [{ title: "My Plan — Urban Wash" }] }),
  component: MyPlanPage,
});

type Booking = {
  id: string;
  scheduled_date: string;
  status: string;
  payment_status: string;
  total_amount: number;
  base_amount: number;
  addon_amount: number;
  service_id: string;
  service_catalog: { name: string; service_type: string; slug: string } | null;
};

type AddonRow = {
  id: string;
  booking_id: string;
  addon_name: string;
  price: number;
  created_at: string;
};

function MyPlanPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const bookingsQ = useQuery({
    queryKey: ["customer-bookings-all", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Booking[]> => {
      const { data, error } = await (supabase as any)
        .from("bookings")
        .select("id, scheduled_date, status, payment_status, total_amount, base_amount, addon_amount, service_id, service_catalog:service_id(name, service_type, slug)")
        .order("scheduled_date", { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data ?? []) as Booking[];
    },
  });

  const all = bookingsQ.data ?? [];
  const subs = all.filter((b) => b.service_catalog?.service_type === "subscription");
  const realSub = subs.find(
    (s) => s.status !== "cancelled" && s.status !== "expired" && new Date(s.scheduled_date) <= new Date(),
  ) ?? subs[0];

  // Demo subscription shown when the customer has no active plan yet,
  // so they get a feel for how Daily Shine tracking will look.
  const isDemo = !realSub;
  const demoStart = new Date(Date.now() - 12 * 86400000);
  const activeSub: (Booking & { _demo?: boolean }) | undefined = realSub ?? {
    id: "demo",
    scheduled_date: demoStart.toISOString().slice(0, 10),
    status: "active",
    payment_status: "cash_on_service",
    total_amount: 1499,
    base_amount: 1499,
    addon_amount: 0,
    service_id: "demo",
    service_catalog: { name: "Daily Shine — Exterior + 4× Interior", service_type: "subscription", slug: "daily-shine" },
    _demo: true,
  };

  // Plan period: 30 days from scheduled_date
  const planStart = activeSub ? new Date(activeSub.scheduled_date) : null;
  const planEnd = planStart ? new Date(planStart.getTime() + 30 * 24 * 60 * 60 * 1000) : null;
  const today = new Date();
  const totalDays = 30;
  const elapsed = planStart ? Math.max(0, Math.min(totalDays, Math.floor((today.getTime() - planStart.getTime()) / 86400000))) : 0;
  const daysLeft = planEnd ? Math.max(0, Math.ceil((planEnd.getTime() - today.getTime()) / 86400000)) : 0;
  const expiringSoon = daysLeft > 0 && daysLeft <= 7;

  // Wash status — track interior + exterior for current sub
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const interiorReal = all.filter(
    (b) =>
      (b.service_catalog?.slug?.includes("interior") || b.service_catalog?.slug?.includes("deep")) &&
      new Date(b.scheduled_date) >= monthStart &&
      b.status === "completed",
  );
  const exteriorReal = all.filter(
    (b) =>
      (b.service_catalog?.slug?.includes("exterior") || b.service_catalog?.slug?.includes("basic") || b.service_catalog?.slug?.includes("daily")) &&
      new Date(b.scheduled_date) >= monthStart &&
      b.status === "completed",
  );
  const interiorCount = isDemo ? 2 : interiorReal.length;
  const exteriorCount = isDemo ? 12 : exteriorReal.length;
  const interiorLast = isDemo ? new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10) : interiorReal[0]?.scheduled_date;
  const exteriorLast = isDemo ? new Date(Date.now() - 86400000).toISOString().slice(0, 10) : exteriorReal[0]?.scheduled_date;

  const addonsQ = useQuery({
    queryKey: ["customer-addons", subs.map((s) => s.id).join(",")],
    enabled: subs.length > 0,
    queryFn: async (): Promise<AddonRow[]> => {
      const ids = subs.map((s) => s.id);
      const { data, error } = await (supabase as any)
        .from("booking_addons")
        .select("id, booking_id, addon_name, price, created_at")
        .in("booking_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AddonRow[];
    },
  });

  const recent = all.slice(0, 8);
  const completedCount = all.filter((b) => b.status === "completed").length;
  const pendingCount = all.filter((b) => b.status === "pending" || b.status === "scheduled").length;

  return (
    <div className="px-5 pt-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Plan</h1>
          <p className="mt-1 text-xs text-muted-foreground">Track your Daily Shine service.</p>
        </div>
        <Sparkles className="h-6 w-6 text-primary" />
      </div>

      {bookingsQ.isLoading && (
        <div className="mt-6 space-y-3">
          <div className="h-32 animate-pulse rounded-3xl bg-muted" />
          <div className="h-24 animate-pulse rounded-2xl bg-muted" />
        </div>
      )}

      {!bookingsQ.isLoading && !activeSub && (
        <div className="mt-8 flex flex-col items-center rounded-3xl border border-dashed border-border p-10 text-center">
          <Sparkles className="h-10 w-10 text-muted-foreground" />
          <h3 className="mt-3 text-base font-semibold">No active plan</h3>
          <p className="mt-1 text-xs text-muted-foreground">Subscribe to Daily Shine to enjoy daily car care.</p>
          <Button asChild className="mt-5 rounded-full">
            <Link to="/c/home">Browse plans</Link>
          </Button>
        </div>
      )}

      {activeSub && (
        <>
          {isDemo && (
            <div className="mt-5 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-[11px] text-primary">
              <span className="font-semibold">Demo preview · </span>
              Subscribe to Daily Shine to start tracking your real services here.
            </div>
          )}
          {/* Active plan hero */}
          <div className="mt-5 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-accent/40 to-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-primary">{isDemo ? "Demo plan" : "Active plan"}</p>
                <h2 className="mt-0.5 truncate text-xl font-semibold">{activeSub.service_catalog?.name ?? "Daily Shine"}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Started {planStart?.toLocaleDateString()} · Renews {planEnd?.toLocaleDateString()}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-medium capitalize text-success">
                {activeSub.status.replaceAll("_", " ")}
              </span>
            </div>

            {/* Progress */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Day {elapsed} of {totalDays}</span>
                <span className={expiringSoon ? "font-semibold text-primary" : ""}>
                  {daysLeft} day{daysLeft === 1 ? "" : "s"} left
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all"
                  style={{ width: `${(elapsed / totalDays) * 100}%` }}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm font-semibold">₹{activeSub.total_amount}/mo</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" disabled={isDemo}>
                  <Pause className="h-3.5 w-3.5" /> Pause
                </Button>
                {(expiringSoon || isDemo) && (
                  <Button asChild={isDemo} size="sm" className="h-8 gap-1 rounded-full text-xs">
                    {isDemo ? (
                      <Link to="/c/home"><RefreshCw className="h-3.5 w-3.5" /> Subscribe</Link>
                    ) : (
                      <><RefreshCw className="h-3.5 w-3.5" /> Renew</>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* This month's washes */}
          <div className="mt-5">
            <h3 className="text-sm font-semibold tracking-tight">This month</h3>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <WashCard
                title="Interior wash"
                icon={Wrench}
                count={interiorCount}
                target={4}
                lastDate={interiorLast}
              />
              <WashCard
                title="Exterior wash"
                icon={Droplets}
                count={exteriorCount}
                target={26}
                lastDate={exteriorLast}
              />
            </div>
          </div>

          {/* Counters */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatCard icon={CheckCircle2} label="Completed" value={isDemo ? 14 : completedCount} tone="success" />
            <StatCard icon={Clock} label="Upcoming" value={isDemo ? 2 : pendingCount} tone="primary" />
          </div>


          {/* Add-ons */}
          <div className="mt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-tight">Add-ons</h3>
              <Link to="/c/home" className="inline-flex items-center gap-1 text-xs text-primary">
                <Plus className="h-3.5 w-3.5" /> Add more
              </Link>
            </div>
            <div className="mt-2 space-y-2">
              {(addonsQ.data ?? []).length === 0 && !addonsQ.isLoading && (
                <p className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  No add-ons yet. Polish, ceramic shield, interior shampoo and more available.
                </p>
              )}
              {(addonsQ.data ?? []).map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm">
                  <span className="font-medium">{a.addon_name}</span>
                  <span className="text-xs text-muted-foreground">₹{a.price}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent services */}
          <div className="mt-5">
            <h3 className="text-sm font-semibold tracking-tight">Recent services</h3>
            <div className="mt-2 space-y-2">
              {recent.length === 0 && (
                <p className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  No services yet.
                </p>
              )}
              {recent.map((b) => (
                <Link
                  key={b.id}
                  to="/c/bookings/$id"
                  params={{ id: b.id }}
                  className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{b.service_catalog?.name ?? "Service"}</div>
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Calendar className="h-3 w-3" /> {b.scheduled_date}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                      b.status === "completed"
                        ? "bg-success/15 text-success"
                        : b.status === "cancelled"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-primary/10 text-primary"
                    }`}
                  >
                    {b.status.replaceAll("_", " ")}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function WashCard({
  title,
  icon: Icon,
  count,
  target,
  lastDate,
}: {
  title: string;
  icon: any;
  count: number;
  target: number;
  lastDate?: string;
}) {
  const done = count >= target;
  const pct = Math.min(100, (count / target) * 100);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <Icon className={`h-4 w-4 ${done ? "text-success" : "text-primary"}`} />
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            done ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
          }`}
        >
          {done ? "Done" : "Pending"}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold">{title}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {count} / {target} this month
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      {lastDate && <p className="mt-2 text-[10px] text-muted-foreground">Last: {lastDate}</p>}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: number;
  tone: "success" | "primary";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${tone === "success" ? "text-success" : "text-primary"}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
