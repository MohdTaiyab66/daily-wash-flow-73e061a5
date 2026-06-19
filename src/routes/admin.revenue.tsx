import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminRevenueSummary, adminSetCustomerPayment } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IndianRupee, TrendingUp, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/admin/revenue")({
  component: RevenuePage,
});

function RevenuePage() {
  const fn = useServerFn(adminRevenueSummary);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-revenue"], queryFn: () => fn() });
  const setPay = useServerFn(adminSetCustomerPayment);
  const mut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "paid" | "pending" }) => setPay({ data: { id, status } }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin-revenue"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "paid" | "pending">("all");

  const rows = useMemo(() => {
    const lower = q.trim().toLowerCase();
    return (data?.customers ?? []).filter((c) => {
      if (filter !== "all" && c.payment_status !== filter) return false;
      if (!lower) return true;
      return c.full_name?.toLowerCase().includes(lower) || c.area?.toLowerCase().includes(lower);
    });
  }, [data, q, filter]);

  const s = data?.summary;
  const fmt = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Revenue</h1>
      <p className="mt-1 text-sm text-muted-foreground">Subscription billing across all customers.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <KPI icon={<TrendingUp className="h-4 w-4" />} label="Expected revenue" value={fmt(s?.expected_revenue ?? 0)} sub={`${s?.total_customers ?? 0} customers`} />
        <KPI icon={<CheckCircle2 className="h-4 w-4 text-[color:var(--success)]" />} label="Paid" value={fmt(s?.paid_revenue ?? 0)} sub={`${s?.paid_count ?? 0} customers`} />
        <KPI icon={<Clock className="h-4 w-4 text-destructive" />} label="Pending" value={fmt(s?.pending_revenue ?? 0)} sub={`${s?.pending_count ?? 0} customers`} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="Search name or area…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-1">
          {(["all", "paid", "pending"] as const).map((f) => (
            <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)} className="capitalize">{f}</Button>
          ))}
        </div>
      </div>

      <Card className="mt-4 divide-y divide-border">
        {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">No customers.</p>}
        {rows.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
            <div className="min-w-0">
              <Link to="/admin/customers/$id" params={{ id: c.id }} className="font-medium hover:underline">{c.full_name}</Link>
              <p className="text-xs text-muted-foreground">{c.area} · renews {c.subscription_end}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold"><IndianRupee className="inline h-3.5 w-3.5" />{Number(c.amount).toLocaleString("en-IN")}</span>
              <Badge variant={c.payment_status === "paid" ? "default" : "destructive"}>{c.payment_status === "paid" ? "Paid" : "Pending"}</Badge>
              <Button size="sm" variant="outline" onClick={() => mut.mutate({ id: c.id, status: c.payment_status === "paid" ? "pending" : "paid" })} disabled={mut.isPending}>
                Mark {c.payment_status === "paid" ? "pending" : "paid"}
              </Button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function KPI({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground">{icon}<span className="text-[10px] uppercase tracking-wider">{label}</span></div>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </Card>
  );
}
