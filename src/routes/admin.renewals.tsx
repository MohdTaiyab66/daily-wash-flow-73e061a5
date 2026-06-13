import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAdminRenewalsAdvanced } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ExtendCustomerDialog } from "@/components/ExtendCustomerDialog";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/admin/renewals")({
  component: RenewalsPage,
});

function RenewalsPage() {
  const fn = useServerFn(listAdminRenewalsAdvanced);
  const { data } = useQuery({ queryKey: ["admin-renewals-adv"], queryFn: () => fn() });
  const [areaQ, setAreaQ] = useState("");
  const [partnerQ, setPartnerQ] = useState("");

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const todayIso = iso(today);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = iso(tomorrow);
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndIso = iso(weekEnd);

  const filtered = useMemo(() => {
    const a = areaQ.trim().toLowerCase();
    const p = partnerQ.trim().toLowerCase();
    return (data ?? []).filter((c: any) => {
      if (a && !c.area?.toLowerCase().includes(a)) return false;
      if (p && !(c.partner?.full_name?.toLowerCase().includes(p) || c.partner?.partner_code?.toLowerCase().includes(p))) return false;
      return true;
    });
  }, [data, areaQ, partnerQ]);

  const todayList = filtered.filter((c: any) => c.subscription_end === todayIso);
  const tomorrowList = filtered.filter((c: any) => c.subscription_end === tomorrowIso);
  const weekList = filtered.filter((c: any) => c.subscription_end > tomorrowIso && c.subscription_end <= weekEndIso);
  const expiredList = filtered.filter((c: any) => c.subscription_end < todayIso);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Renewals</h1>
          <p className="mt-1 text-sm text-muted-foreground">Keep customers active — extend, renew, or follow up.</p>
        </div>
        <div className="flex gap-2">
          <Input className="w-44" placeholder="Search area" value={areaQ} onChange={(e) => setAreaQ(e.target.value)} />
          <Input className="w-44" placeholder="Search partner" value={partnerQ} onChange={(e) => setPartnerQ(e.target.value)} />
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Bucket title="Renewal today" tone="orange" rows={todayList} />
        <Bucket title="Renewal tomorrow" tone="orange" rows={tomorrowList} />
        <Bucket title="This week" tone="orange" rows={weekList} />
        <Bucket title="Expired" tone="red" rows={expiredList} />
      </div>

      <p className="mt-6 text-[11px] text-muted-foreground">
        <span className="mr-3"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Active</span>
        <span className="mr-3"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-500" />Due soon</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-500" />Expired</span>
      </p>
    </div>
  );
}

function Bucket({ title, rows, tone }: { title: string; rows: any[]; tone: "orange" | "red" }) {
  const dot = tone === "red" ? "bg-rose-500" : "bg-orange-500";
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />{title}
        </h2>
        <span className="text-2xl font-semibold">{rows.length}</span>
      </div>
      <div className="mt-3 divide-y divide-border">
        {rows.length === 0 && <p className="py-4 text-xs text-muted-foreground">Nothing here.</p>}
        {rows.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div className="min-w-0">
              <Link to="/admin/customers/$id" params={{ id: c.id }} className="truncate font-medium hover:underline">{c.full_name}</Link>
              <p className="truncate text-xs text-muted-foreground">
                {c.area} · +91 {c.phone}
                {c.partner ? ` · ${c.partner.full_name}` : " · Unassigned"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">{c.subscription_end}</Badge>
              <ExtendCustomerDialog customerId={c.id} currentEnd={c.subscription_end} variant="outline" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
