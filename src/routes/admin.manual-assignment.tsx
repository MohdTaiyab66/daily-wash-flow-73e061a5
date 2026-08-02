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
import { ArrowLeft, ArrowRight, Check, Loader2, Search, UserCheck } from "lucide-react";

export const Route = createFileRoute("/admin/manual-assignment")({
  component: ManualAssignmentPage,
});

const STEPS = ["Choose Partner", "Choose Customers", "Review & Confirm"];

function ManualAssignmentPage() {
  const navigate = useNavigate();
  const listPartners = useServerFn(listAdminPartnersBrief);
  const listCustomers = useServerFn(adminListUnassignedCustomers);
  const create = useServerFn(adminCreateManualAssignment);

  const [step, setStep] = useState(0);
  const [partnerId, setPartnerId] = useState("");
  const [duration, setDuration] = useState(15);
  const [areaFilter, setAreaFilter] = useState("");
  const [partnerQuery, setPartnerQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: partners } = useQuery({ queryKey: ["partners-brief"], queryFn: () => listPartners() });
  const { data: customers, refetch } = useQuery({
    queryKey: ["unassigned-customers", areaFilter],
    queryFn: () => listCustomers({ data: { area: areaFilter || undefined } }),
  });

  const partner = useMemo(() => (partners ?? []).find((p: any) => p.id === partnerId), [partners, partnerId]);
  const areas = useMemo(
    () => Array.from(new Set((customers ?? []).map((c: any) => c.area))).sort(),
    [customers],
  );
  const partnerRows = useMemo(() => {
    const term = partnerQuery.trim().toLowerCase();
    if (!term) return partners ?? [];
    return (partners ?? []).filter((p: any) =>
      [p.full_name, p.phone, p.home_area].filter(Boolean).some((v: any) => String(v).toLowerCase().includes(term)),
    );
  }, [partners, partnerQuery]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const mut = useMutation({
    mutationFn: () =>
      create({ data: { partner_id: partnerId, customer_ids: Array.from(selected), duration_days: duration } }),
    onSuccess: () => {
      toast.success(`Assigned ${selected.size} customers to ${partner?.full_name}`);
      setSelected(new Set());
      refetch();
      navigate({ to: "/admin/services", search: { f: "today" } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create assignment"),
  });

  const next = () => {
    if (step === 0 && !partnerId) return toast.error("Pick a partner to continue");
    if (step === 1 && selected.size === 0) return toast.error("Select at least one customer");
    setStep((s) => Math.min(s + 1, 2));
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Assignments</h1>
      <p className="mt-1 text-sm text-muted-foreground">Assign customers to a partner in three steps.</p>

      {/* Stepper */}
      <ol className="mt-6 grid grid-cols-3 gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="min-w-0">
            <div className={`h-1 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`} />
            <p className={`mt-2 truncate text-xs font-medium ${i <= step ? "text-foreground" : "text-muted-foreground"}`}>
              {i + 1}. {label}
            </p>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card className="mt-5 rounded-2xl p-5 shadow-none">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="rounded-full pl-9"
              placeholder="Search partners…"
              value={partnerQuery}
              onChange={(e) => setPartnerQuery(e.target.value)}
            />
          </div>
          <div className="mt-4 grid max-h-[420px] gap-2 overflow-y-auto sm:grid-cols-2">
            {partnerRows.map((p: any) => {
              const active = p.id === partnerId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPartnerId(p.id)}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                    active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {String(p.full_name ?? "?").charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.full_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      +91 {p.phone}{p.home_area ? ` · ${p.home_area}` : ""}
                    </span>
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              );
            })}
            {partnerRows.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No partners match.</p>
            )}
          </div>

          <div className="mt-4 max-w-[180px]">
            <Label className="text-xs">Duration (days)</Label>
            <Input type="number" min={1} max={60} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card className="mt-5 overflow-hidden rounded-2xl p-0 shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <select
                className="h-9 rounded-full border border-input bg-background px-3 text-sm"
                value={areaFilter}
                onChange={(e) => setAreaFilter(e.target.value)}
              >
                <option value="">All areas</option>
                {areas.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <span className="text-xs text-muted-foreground">
                {customers?.length ?? 0} available · {selected.size} selected
              </span>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set((customers ?? []).map((c: any) => c.id)))}>
                Select all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          </div>
          <div className="max-h-[440px] overflow-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-10 px-4 py-2"></th>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Area</th>
                  <th className="px-4 py-2">Vehicle</th>
                  <th className="px-4 py-2">Renewal</th>
                </tr>
              </thead>
              <tbody>
                {(customers ?? []).map((c: any) => (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-4 py-2"><Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} /></td>
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
      )}

      {step === 2 && (
        <Card className="mt-5 rounded-2xl p-5 shadow-none">
          <dl className="grid gap-4 sm:grid-cols-3">
            <Summary label="Partner" value={partner?.full_name ?? "—"} sub={partner?.phone ? `+91 ${partner.phone}` : ""} />
            <Summary label="Customers" value={String(selected.size)} sub="selected" />
            <Summary label="Duration" value={`${duration} days`} sub={`₹${selected.size * 17 * duration} total`} />
          </dl>
          <div className="mt-5 max-h-64 overflow-y-auto rounded-xl border border-border">
            {(customers ?? [])
              .filter((c: any) => selected.has(c.id))
              .map((c: any) => (
                <div key={c.id} className="flex items-center justify-between border-b border-border px-4 py-2 text-sm last:border-0">
                  <span className="truncate font-medium">{c.full_name}</span>
                  <span className="truncate text-xs text-muted-foreground">{c.area}</span>
                </div>
              ))}
          </div>
        </Card>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        {step < 2 ? (
          <Button className="rounded-full" onClick={next}>
            Continue <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button className="rounded-full" size="lg" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
            Confirm assignment
          </Button>
        )}
      </div>
    </div>
  );
}

function Summary({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-lg font-semibold">{value}</dd>
      {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
