import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  adminAddCustomerToAssignment,
  adminCancelAssignment,
  adminRemoveCustomerFromAssignment,
  adminUpdateAssignment,
  getPartnerAssignmentDetail,
} from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Plus, Search, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/partner-assignment/$id")({
  component: PartnerAssignmentPage,
});

function PartnerAssignmentPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getPartnerAssignmentDetail);
  const updFn = useServerFn(adminUpdateAssignment);
  const addFn = useServerFn(adminAddCustomerToAssignment);
  const remFn = useServerFn(adminRemoveCustomerFromAssignment);
  const cancelFn = useServerFn(adminCancelAssignment);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-partner-assignment", id],
    queryFn: () => getFn({ data: { partner_id: id } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-partner-assignment", id] });

  const updateMut = useMutation({
    mutationFn: (patch: any) => updFn({ data: { assignment_id: data!.assignment!.id, ...patch } }),
    onSuccess: () => { toast.success("Assignment updated"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });
  const addMut = useMutation({
    mutationFn: (customer_id: string) => addFn({ data: { assignment_id: data!.assignment!.id, customer_id } }),
    onSuccess: (r: any) => { toast.success(`Added · ${r.added} services`); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Add failed"),
  });
  const remMut = useMutation({
    mutationFn: (customer_id: string) => remFn({ data: { assignment_id: data!.assignment!.id, customer_id } }),
    onSuccess: () => { toast.success("Customer removed"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Remove failed"),
  });
  const cancelMut = useMutation({
    mutationFn: () => cancelFn({ data: { assignment_id: data!.assignment!.id } }),
    onSuccess: () => { toast.success("Assignment cancelled"); navigate({ to: "/admin/partners" }); },
    onError: (e: any) => toast.error(e?.message ?? "Cancel failed"),
  });

  const [form, setForm] = useState<any>({});
  const [search, setSearch] = useState("");

  const availableFiltered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = data?.available ?? [];
    if (!term) return list.slice(0, 30);
    return list.filter((c: any) =>
      [c.full_name, c.phone, c.area, c.registration_number].filter(Boolean).some((v: string) => String(v).toLowerCase().includes(term))
    ).slice(0, 30);
  }, [data?.available, search]);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-6 text-sm text-muted-foreground">Partner not found.</div>;

  const a: any = data.assignment;
  const p: any = data.partner;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild size="sm" variant="ghost"><Link to="/admin/partners"><ArrowLeft className="mr-1 h-4 w-4" />Back</Link></Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{p.full_name ?? "Partner"}</h1>
          <p className="text-xs text-muted-foreground">{p.partner_code} · +91 {p.phone} · {p.home_area ?? "no area"}</p>
        </div>
      </div>

      {!a ? (
        <Card className="p-6 text-sm text-muted-foreground">No active assignment for this partner.</Card>
      ) : (
        <>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Active assignment</p>
                <p className="mt-1 text-lg font-semibold">{a.area} · {a.target_cars} cars/day</p>
                <p className="text-xs text-muted-foreground">{a.start_date} → {a.end_date} · {a.working_days} working days</p>
              </div>
              <Badge variant="outline" className="capitalize">{a.status}</Badge>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label="Rate per car (₹)">
                <Input type="number" defaultValue={a.rate_per_car} onChange={(e) => setForm({ ...form, rate_per_car: Number(e.target.value) })} />
              </Field>
              <Field label="Target cars / day">
                <Input type="number" defaultValue={a.target_cars} onChange={(e) => setForm({ ...form, target_cars: Number(e.target.value) })} />
              </Field>
              <Field label="Start time">
                <Input defaultValue={a.expected_start_time ?? ""} placeholder="07:00" onChange={(e) => setForm({ ...form, expected_start_time: e.target.value })} />
              </Field>
              <Field label="End date">
                <Input type="date" defaultValue={a.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </Field>
              <Field label="Estimated hours">
                <Input type="number" step="0.1" defaultValue={a.estimated_hours ?? 0} onChange={(e) => setForm({ ...form, estimated_hours: Number(e.target.value) })} />
              </Field>
              <Field label="Total earnings (₹)">
                <Input type="number" defaultValue={a.total_earnings ?? 0} onChange={(e) => setForm({ ...form, total_earnings: Number(e.target.value) })} />
              </Field>
              <Field label="Route visibility (hrs before shift, blank = use admin default)">
                <Input
                  type="number"
                  min={0}
                  max={24}
                  defaultValue={a.route_visibility_hours ?? ""}
                  placeholder="Global default"
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    setForm({ ...form, route_visibility_hours: raw === "" ? null : Number(raw) });
                  }}
                />
              </Field>
              <Field label="Auto-renew when this assignment ends">
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  defaultValue={a.auto_renew ? "true" : "false"}
                  onChange={(e) => setForm({ ...form, auto_renew: e.target.value === "true" })}
                >
                  <option value="false">Off</option>
                  <option value="true">On (extend by default duration)</option>
                </select>
              </Field>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => updateMut.mutate(form)} disabled={updateMut.isPending || Object.keys(form).length === 0}>
                {updateMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save changes
              </Button>
              <Button variant="outline" onClick={() => confirm("Cancel this assignment? Pending customers will be released.") && cancelMut.mutate()} disabled={cancelMut.isPending}>
                {cancelMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                Cancel assignment
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customers in assignment ({data.customers.length})</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr><th className="py-2">Customer</th><th>Area</th><th>Phone</th><th>Completed</th><th></th></tr>
                </thead>
                <tbody>
                  {data.customers.map((c: any) => (
                    <tr key={c.customer_id} className="border-t border-border">
                      <td className="py-2 font-medium">{c.full_name}</td>
                      <td className="text-muted-foreground">{c.area}</td>
                      <td className="text-muted-foreground">{c.phone}</td>
                      <td>{c.completed}/{c.total}</td>
                      <td className="py-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => confirm(`Remove ${c.full_name} from this assignment?`) && remMut.mutate(c.customer_id)} disabled={remMut.isPending}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {data.customers.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No customers yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Add customer (unassigned in {a.area})</p>
            <div className="mt-3 relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search name, phone, plate…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="mt-3 divide-y divide-border">
              {availableFiltered.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">{c.full_name}</p>
                    <p className="text-[11px] text-muted-foreground">{c.area} · +91 {c.phone} · {c.registration_number ?? "no plate"}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => addMut.mutate(c.id)} disabled={addMut.isPending}>
                    <Plus className="mr-1 h-3.5 w-3.5" />Add
                  </Button>
                </div>
              ))}
              {availableFiltered.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No unassigned customers found.</p>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs text-muted-foreground">{label}</Label><div className="mt-1">{children}</div></div>;
}
