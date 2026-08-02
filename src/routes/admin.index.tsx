import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getAdminOverview, listAdminServices, listAdminRenewalsAdvanced, listAdminPartners,
} from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, IndianRupee, CalendarDays, RotateCcw, ClipboardList, ShieldAlert, UserPlus, UserCheck,
  Sparkles, Map as MapIcon, Search, Plus, ArrowRight, Activity,
} from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: Dashboard,
});

const QUICK_ACTIONS: Array<{ to: any; search?: any; label: string; icon: any }> = [
  { to: "/admin/import", label: "Add Customer", icon: UserPlus },
  { to: "/admin/manual-assignment", label: "Assign Partner", icon: UserCheck },
  { to: "/admin/services", search: { f: "all" }, label: "Create Booking", icon: Plus },
  { to: "/admin/marketplace", label: "Daily Shine Offer", icon: Sparkles },
  { to: "/admin/live", label: "Live Map", icon: MapIcon },
  { to: "/admin/customers", label: "Search Customer", icon: Search },
];

const TIMELINE: Array<{ key: string; label: string; statuses: string[]; tone: string }> = [
  { key: "running", label: "Running", statuses: ["in_progress", "started", "on_the_way"], tone: "bg-primary" },
  { key: "pending", label: "Pending", statuses: ["scheduled", "pending", "assigned"], tone: "bg-amber-500" },
  { key: "completed", label: "Completed", statuses: ["completed"], tone: "bg-emerald-500" },
  { key: "cancelled", label: "Cancelled", statuses: ["cancelled"], tone: "bg-muted-foreground" },
  { key: "delayed", label: "Delayed", statuses: ["delayed", "missed"], tone: "bg-destructive" },
];

function Dashboard() {
  const overviewFn = useServerFn(getAdminOverview);
  const servicesFn = useServerFn(listAdminServices);
  const renewalsFn = useServerFn(listAdminRenewalsAdvanced);
  const partnersFn = useServerFn(listAdminPartners);

  const { data: overview, isLoading } = useQuery({ queryKey: ["admin-overview"], queryFn: () => overviewFn() });
  const { data: services } = useQuery({ queryKey: ["admin-services", ""], queryFn: () => servicesFn({ data: { q: "" } }) });
  const { data: renewals } = useQuery({ queryKey: ["admin-renewals-advanced"], queryFn: () => renewalsFn() });
  const { data: partners } = useQuery({ queryKey: ["admin-partners"], queryFn: () => partnersFn() });
  const { data: feed } = useQuery({
    queryKey: ["admin-activity-feed"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("admin_notifications")
        .select("id,category,title,body,created_at,read_at")
        .order("created_at", { ascending: false })
        .limit(12);
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  const today = new Date().toISOString().slice(0, 10);
  const todays = useMemo(
    () => (services ?? []).filter((s: any) => s.scheduled_date === today),
    [services, today],
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of TIMELINE) {
      map[row.key] = todays.filter((s: any) => row.statuses.includes(String(s.status ?? ""))).length;
    }
    return map;
  }, [todays]);

  const pendingRenewals = (renewals ?? []).filter((r: any) => r.subscription_end >= today).length;
  const onlinePartners = (partners ?? []).filter((p: any) => p.availability === "online").length;
  const alerts = (feed ?? []).filter((n: any) => !n.read_at && ["alerts", "system", "fraud"].includes(n.category)).length;
  const todayRevenue = todays
    .filter((s: any) => s.status === "completed")
    .reduce((sum: number, s: any) => sum + Number(s.rate_per_car || 0), 0);

  const kpis: Array<{ label: string; value: string | number; icon: any; to: any; search?: any; accent?: boolean }> = [
    { label: "Today's Services", value: overview?.todayServices ?? todays.length, icon: CalendarDays, to: "/admin/services", search: { f: "today" } },
    { label: "Active Partners", value: onlinePartners, icon: Users, to: "/admin/partners" },
    { label: "Today's Revenue", value: `₹${todayRevenue.toLocaleString("en-IN")}`, icon: IndianRupee, to: "/admin/revenue" },
    { label: "Pending Renewals", value: pendingRenewals, icon: RotateCcw, to: "/admin/renewals" },
    { label: "Pending Bookings", value: counts.pending ?? 0, icon: ClipboardList, to: "/admin/services", search: { f: "pending" } },
    { label: "Critical Alerts", value: alerts, icon: ShieldAlert, to: "/admin/notifications", accent: alerts > 0 },
  ];

  return (
    <div className="space-y-8">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Urban Wash operations · Lucknow</p>
        </div>
        <Link
          to="/admin/manual-assignment"
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <UserCheck className="h-4 w-4" /> <span className="hidden sm:inline">Assign partner</span>
        </Link>
      </header>

      {/* KPI widgets */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Link key={k.label} to={k.to} search={k.search} className="block">
              <Card className={`rounded-2xl p-4 shadow-none transition-colors hover:bg-accent ${k.accent ? "border-destructive/40" : ""}`}>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <p className="truncate text-[11px] font-medium uppercase tracking-wider">{k.label}</p>
                </div>
                {isLoading ? (
                  <Skeleton className="mt-2 h-7 w-16" />
                ) : (
                  <p className={`mt-1.5 text-2xl font-semibold tracking-tight ${k.accent ? "text-destructive" : ""}`}>{k.value}</p>
                )}
              </Card>
            </Link>
          );
        })}
      </section>

      {/* Quick actions */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Quick actions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.label}
                to={a.to}
                search={a.search}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <Icon className="h-4 w-4 text-primary" /> {a.label}
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Timeline */}
        <Card className="rounded-2xl p-5 shadow-none lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Today's timeline</h2>
            <Link to="/admin/services" search={{ f: "today" }} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {TIMELINE.map((row) => (
              <div key={row.key} className="rounded-xl border border-border p-3">
                <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span className={`h-1.5 w-1.5 rounded-full ${row.tone}`} /> {row.label}
                </span>
                <p className="mt-1 text-xl font-semibold">{counts[row.key] ?? 0}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-1.5">
            {todays.slice(0, 6).map((s: any) => (
              <Link
                key={s.id}
                to="/admin/service/$id"
                params={{ id: s.id }}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-muted/60"
              >
                <span className="w-16 shrink-0 text-xs text-muted-foreground">{s.time_slot ?? "—"}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{s.customers?.full_name ?? "Customer"}</span>
                <span className="hidden truncate text-xs text-muted-foreground sm:block">
                  {s.partners?.full_name ?? "Unassigned"}
                </span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                  {String(s.status ?? "").replace("_", " ")}
                </span>
              </Link>
            ))}
            {todays.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No services scheduled today.</p>
            )}
          </div>
        </Card>

        {/* Activity feed */}
        <Card className="rounded-2xl p-5 shadow-none">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Latest activity</h2>
            <Link to="/admin/notifications" className="text-xs text-primary hover:underline">All</Link>
          </div>
          <div className="mt-4 space-y-3">
            {(feed ?? []).slice(0, 8).map((n: any) => (
              <div key={n.id} className="flex gap-3">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.read_at ? "bg-muted-foreground/40" : "bg-primary"}`} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{n.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {n.category} · {new Date(n.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
            {(feed ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nothing new.</p>
            )}
          </div>
        </Card>
      </div>

      {/* Live operations */}
      <Card className="rounded-2xl p-5 shadow-none">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Activity className="h-4 w-4" /> Live operations
          </h2>
          <Link to="/admin/live" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            Open live map <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Stat label="Partners online" value={onlinePartners} />
          <Stat label="Jobs running" value={counts.running ?? 0} />
          <Stat label="Routes today" value={new Set(todays.map((s: any) => s.partners?.partner_code).filter(Boolean)).size} />
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
