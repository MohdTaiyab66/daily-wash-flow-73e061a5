import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  listAdminPartnersBrief,
  adminListUnassignedCustomers,
  adminCreateManualAssignment,
} from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserCheck } from "lucide-react";

export const Route = createFileRoute("/admin/manual-assignment")({
  component: ManualAssignmentPage,
});

function ManualAssignmentPage() {
  const navigate = useNavigate();
  const listPartners = useServerFn(listAdminPartnersBrief);
  const listCustomers = useServerFn(adminListUnassignedCustomers);
  const create = useServerFn(adminCreateManualAssignment);

  const [partnerId, setPartnerId] = useState("");
  const [duration, setDuration] = useState(15);
  const [areaFilter, setAreaFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: partners } = useQuery({ queryKey: ["partners-brief"], queryFn: () => listPartners() });
  const { data: customers, refetch } = useQuery({
    queryKey: ["unassigned-customers", areaFilter],
    queryFn: () => listCustomers({ data: { area: areaFilter || undefined } }),
  });

  const partner = useMemo(() => (partners ?? []).find((p: any) => p.id === partnerId), [partners, partnerId]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const mut = useMutation({
    mutationFn: () =>
      create({ data: { partner_id: partnerId, customer_ids: Array.from(selected), duration_days: duration } }),
    onSuccess: () => {
      toast.success(`Assigned ${selected.size} customers to ${partner?.full_name}`);
      setSelected(new Set());
      refetch();
      navigate({ to: "/admin/services" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create assignment"),
  });

  const submit = () => {
    if (!partnerId) return toast.error("Pick a partner");
    if (selected.size === 0) return toast.error("Select at least one customer");
    if (duration < 1) return toast.error("Duration must be at least 1 day");
    mut.mutate();
  };

  const areas = Array.from(new Set((customers ?? []).map((c: any) => c.area))).sort();

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Manual Assignment</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Trial mode: assign customers directly to any partner, bypassing area matching.
          </p>
        </div>
        <Badge variant="secondary">Trial mode</Badge>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Step 1 · Partner & duration</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Partner *</Label>
            <select
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
            >
              <option value="">— Select partner —</option>
              {(partners ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} ({p.phone}) {p.home_area ? `· ${p.home_area}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Duration (days)</Label>
            <Input type="number" min={1} max={60} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Filter by area</Label>
            <select
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
            >
              <option value="">All areas</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <Card className="mt-4 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
          <h2 className="text-sm font-semibold">Step 2 · Customers ({customers?.length ?? 0} available · {selected.size} selected)</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set((customers ?? []).map((c: any) => c.id)))}>Select all</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 w-10"></th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Area</th>
                <th className="px-4 py-2">Vehicle</th>
                <th className="px-4 py-2">Renewal</th>
              </tr>
            </thead>
            <tbody>
              {(customers ?? []).map((c: any) => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-4 py-2">
                    <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                  </td>
                  <td className="px-4 py-2">
                    <p className="font-medium">{c.full_name}</p>
                    <p className="text-[11px] text-muted-foreground">+91 {c.phone}</p>
                  </td>
                  <td className="px-4 py-2">{c.area}</td>
                  <td className="px-4 py-2">
                    <p>{c.vehicle_make} {c.vehicle_model}</p>
                    <p className="text-[11px] text-muted-foreground">{c.registration_number}</p>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{c.subscription_end}</td>
                </tr>
              ))}
              {(customers ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No unassigned customers in this area.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-6 flex items-center justify-end gap-3">
        <p className="text-sm text-muted-foreground">
          {selected.size} customers × {duration} days = <span className="font-medium text-foreground">₹{selected.size * 17 * duration}</span> total
        </p>
        <Button size="lg" onClick={submit} disabled={mut.isPending}>
          {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
          Create Assignment
        </Button>
      </div>
    </div>
  );
}
