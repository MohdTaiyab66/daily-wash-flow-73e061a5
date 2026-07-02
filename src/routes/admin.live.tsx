import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLiveOps } from "@/lib/ops.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, Car, CheckCircle2, Clock, MapPin, ParkingCircle, ShieldAlert, XCircle, Satellite, Wifi, WifiOff, UserCheck } from "lucide-react";

export const Route = createFileRoute("/admin/live")({
  component: LiveOpsPage,
});

function LiveOpsPage() {
  const fn = useServerFn(getLiveOps);
  const { data } = useQuery({
    queryKey: ["admin-live-ops"],
    queryFn: () => fn(),
    refetchInterval: 15000,
  });

  const { data: gps } = useQuery({
    queryKey: ["admin-gps-health"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("admin_gps_health").select("*").maybeSingle();
      if (error) throw error;
      return data as {
        active_customers: number;
        gps_exact: number;
        gps_centroid: number;
        gps_missing: number;
        partners_online: number;
        partners_offline: number;
        partners_stale_heartbeat: number;
        customers_waiting_reassignment: number;
        as_of: string;
      } | null;
    },
    refetchInterval: 30000,
  });

  const c = data?.counts;
  const tiles = [
    { label: "Assigned today", value: c?.assigned_today ?? 0, icon: Car, tone: "" },
    { label: "Completed", value: c?.completed_today ?? 0, icon: CheckCircle2, tone: "text-emerald-600" },
    { label: "Pending", value: c?.pending_today ?? 0, icon: Clock, tone: "text-amber-600" },
    { label: "Unavailable", value: c?.unavailable_today ?? 0, icon: XCircle, tone: "text-destructive" },
    { label: "Dirty reports", value: c?.dirty_today ?? 0, icon: AlertTriangle, tone: "text-amber-600" },
    { label: "Parking issues", value: c?.parking_today ?? 0, icon: ParkingCircle, tone: "text-amber-600" },
    { label: "GPS flags (7d)", value: c?.fraud_flags_week ?? 0, icon: ShieldAlert, tone: "text-destructive" },
  ];

  return (
    <div>
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Live Operations</h1>
        <Badge variant="outline" className="gap-1"><Activity className="h-3 w-3" />Auto-refresh 15s</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Today's operational state across all partners.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Card key={t.label} className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.label}</p>
                <Icon className={`h-4 w-4 ${t.tone || "text-muted-foreground"}`} />
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{t.value}</p>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Satellite className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">GPS &amp; DAR Health</h2>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {gps?.as_of ? `Updated ${new Date(gps.as_of).toLocaleTimeString()}` : "Loading…"}
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat icon={UserCheck} label="Active customers" value={gps?.active_customers ?? 0} />
          <MiniStat icon={MapPin} label="Exact GPS" value={gps?.gps_exact ?? 0} tone="text-emerald-600" />
          <MiniStat icon={MapPin} label="Centroid GPS" value={gps?.gps_centroid ?? 0} tone="text-amber-600" />
          <MiniStat icon={MapPin} label="Missing GPS" value={gps?.gps_missing ?? 0} tone="text-destructive" />
          <MiniStat icon={Wifi} label="Partners online" value={gps?.partners_online ?? 0} tone="text-emerald-600" />
          <MiniStat icon={WifiOff} label="Partners offline" value={gps?.partners_offline ?? 0} />
          <MiniStat icon={Activity} label="Stale heartbeat (>5m)" value={gps?.partners_stale_heartbeat ?? 0} tone="text-amber-600" />
          <MiniStat icon={AlertTriangle} label="Awaiting reassignment" value={gps?.customers_waiting_reassignment ?? 0} tone="text-destructive" />
        </div>
      </Card>


      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Section title="Recent completions" empty="No completed services yet today.">
          {data?.completed.map((s: any) => (
            <Row key={s.id}
              left={s.customers?.full_name + " · " + (s.customers?.area ?? "")}
              right={s.partners ? `${s.partners.full_name}` : "—"}
              meta={s.completed_at ? new Date(s.completed_at).toLocaleTimeString() : ""}
              flag={s.gps_flag && s.gps_flag !== "ok" ? `${s.gps_flag.replace("_", " ")} · ${s.gps_distance_m ?? "?"}m` : null}
            />
          ))}
        </Section>
        <Section title="Unavailable vehicles" empty="No unavailable reports today.">
          {data?.unavailable.map((s: any) => (
            <Row key={s.id}
              left={s.customers?.full_name + " · " + (s.customers?.area ?? "")}
              right={s.partners ? s.partners.full_name : "—"}
              meta={s.unavailable_reason?.replace(/_/g, " ")}
            />
          ))}
        </Section>
        <Section title="Dirty vehicle reports" empty="No dirty reports today.">
          {data?.dirty.map((r: any) => (
            <Row key={r.id}
              left={r.services?.customers?.full_name ?? "—"}
              right={r.services?.partners?.full_name ?? "—"}
              meta={r.reason}
            />
          ))}
        </Section>
        <Section title="Parking issues" empty="No parking reports today.">
          {data?.parking.map((r: any) => (
            <Row key={r.id}
              left={r.services?.customers?.full_name ?? "—"}
              right={r.services?.partners?.full_name ?? "—"}
              meta={r.reason}
            />
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children, empty }: { title: string; children: React.ReactNode; empty: string }) {
  const arr = Array.isArray(children) ? children : [children];
  const hasAny = arr.filter(Boolean).length > 0;
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="mt-3 divide-y divide-border">
        {hasAny ? children : <p className="py-4 text-sm text-muted-foreground">{empty}</p>}
      </div>
    </Card>
  );
}

function Row({ left, right, meta, flag }: { left: string; right: string; meta?: string; flag?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{left}</p>
        {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
      </div>
      <div className="text-right">
        <p className="text-xs text-muted-foreground">{right}</p>
        {flag && <Badge variant="outline" className="mt-1 border-destructive/40 text-[10px] text-destructive"><MapPin className="mr-1 h-3 w-3" />{flag}</Badge>}
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, tone }: { icon: typeof Activity; label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className={`h-3.5 w-3.5 ${tone ?? "text-muted-foreground"}`} />
      </div>
      <p className={`mt-1.5 text-xl font-semibold tracking-tight ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
