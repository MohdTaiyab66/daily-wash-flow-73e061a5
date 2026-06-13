import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLiveOps } from "@/lib/ops.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, Car, CheckCircle2, Clock, MapPin, ParkingCircle, ShieldAlert, XCircle } from "lucide-react";

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
