import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createCustomerImport, listAdminPartnersBrief } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";
import { SERVICE_AREA_NAMES, SERVICE_AREAS } from "@/lib/areas";


export const Route = createFileRoute("/admin/import")({
  component: ImportPage,
});

const PLANS = ["daily_shine_monthly", "weekly_plan", "premium_monthly"];
const TIMES = [
  "06:00 - 09:00",
  "06:30 - 09:00",
  "07:00 - 09:00",
  "08:30 - 10:30",
  "09:00 - 11:00",
];

type VehicleForm = { make: string; model: string; registration_number: string; color: string; parking_notes: string };
const emptyVehicle = (): VehicleForm => ({ make: "", model: "", registration_number: "", color: "", parking_notes: "" });

function ImportPage() {
  const navigate = useNavigate();
  const listPartners = useServerFn(listAdminPartnersBrief);
  const { data: partners } = useQuery({ queryKey: ["partners-brief"], queryFn: () => listPartners() });
  const create = useServerFn(createCustomerImport);

  const today = new Date().toISOString().slice(0, 10);
  const inThirty = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    area: "",
    latitude: "",
    longitude: "",
    subscription_plan: PLANS[0],
    subscription_start: today,
    subscription_end: inThirty,
    extended_until: "",
    preferred_time: TIMES[0],
    is_active: true,
    assigned_partner_id: "",
  });
  const [vehicles, setVehicles] = useState<VehicleForm[]>([emptyVehicle()]);

  const setField = (k: keyof typeof form) => (v: any) =>
    setForm((f) => ({ ...f, [k]: typeof v === "object" && v?.target ? v.target.value : v }));

  const setVehicle = (idx: number, k: keyof VehicleForm) => (e: any) =>
    setVehicles((arr) => arr.map((v, i) => (i === idx ? { ...v, [k]: e.target ? e.target.value : e } : v)));

  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
          full_name: form.full_name,
          phone: form.phone,
          area: form.area,
          latitude: form.latitude ? Number(form.latitude) : undefined,
          longitude: form.longitude ? Number(form.longitude) : undefined,
          subscription_plan: form.subscription_plan,
          subscription_start: form.subscription_start,
          subscription_end: form.extended_until || form.subscription_end,
          preferred_time: form.preferred_time,
          is_active: form.is_active,
          vehicles: vehicles.filter((v) => v.make && v.model),
          assigned_partner_id: form.assigned_partner_id || null,
        },
      }),
    onSuccess: () => {
      toast.success("Customer imported");
      navigate({ to: "/admin/customers" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not import"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name || !form.phone || !form.area || !vehicles[0].make || !vehicles[0].model) {
      toast.error("Please fill required fields");
      return;
    }
    mut.mutate();
  };

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Customer Import</h1>
      <p className="mt-1 text-sm text-muted-foreground">Onboard an existing Urban Wash customer for the pilot launch.</p>

      <form onSubmit={submit} className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Customer</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Customer Name *"><Input value={form.full_name} onChange={setField("full_name")} /></Field>
            <Field label="Phone Number *"><Input value={form.phone} onChange={setField("phone")} placeholder="9876543210" /></Field>
            <Field label="Area *" full>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.area}
                onChange={(e: any) => {
                  const name = e.target.value;
                  const a = SERVICE_AREAS.find((x) => x.name === name);
                  setForm((f) => ({
                    ...f,
                    area: name,
                    latitude: a ? String(a.lat) : f.latitude,
                    longitude: a ? String(a.lng) : f.longitude,
                  }));
                }}
              >
                <option value="">— Select area —</option>
                {SERVICE_AREA_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>

            <Field label="Latitude"><Input value={form.latitude} onChange={setField("latitude")} placeholder="26.8467" /></Field>
            <Field label="Longitude"><Input value={form.longitude} onChange={setField("longitude")} placeholder="80.9462" /></Field>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Subscription</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Subscription Plan">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.subscription_plan} onChange={setField("subscription_plan")}>
                {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Preferred Time Before">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.preferred_time} onChange={setField("preferred_time")}>
                {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Start Date"><Input type="date" value={form.subscription_start} onChange={setField("subscription_start")} /></Field>
            <Field label="Renewal Date"><Input type="date" value={form.subscription_end} onChange={setField("subscription_end")} /></Field>
            <Field label="Extended Until (optional)" full>
              <Input type="date" value={form.extended_until} onChange={setField("extended_until")} />
            </Field>
            <Field label="Status">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.is_active ? "1" : "0"} onChange={(e: any) => setForm((f) => ({ ...f, is_active: e.target.value === "1" }))}>
                <option value="1">Active</option>
                <option value="0">Paused</option>
              </select>
            </Field>
            <Field label="Assigned Partner">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.assigned_partner_id} onChange={setField("assigned_partner_id")}>
                <option value="">— Unassigned —</option>
                {(partners ?? []).map((p: any) => (
                  <option key={p.id} value={p.id}>{p.full_name} ({p.partner_code})</option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        {vehicles.map((v, i) => (
          <Card key={i} className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Vehicle {i + 1} {i === 1 && <span className="text-xs normal-case text-muted-foreground">(optional)</span>}
              </h2>
              {i > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setVehicles((a) => a.filter((_, j) => j !== i))}>Remove</Button>
              )}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label={i === 0 ? "Make *" : "Make"}><Input value={v.make} onChange={setVehicle(i, "make")} placeholder="Maruti" /></Field>
              <Field label={i === 0 ? "Model *" : "Model"}><Input value={v.model} onChange={setVehicle(i, "model")} placeholder="Swift" /></Field>
              <Field label="Plate Number (optional)" full><Input value={v.registration_number} onChange={setVehicle(i, "registration_number")} placeholder="UP 32 AB 1234" /></Field>
              <Field label="Vehicle Color"><Input value={v.color} onChange={setVehicle(i, "color")} /></Field>
              <Field label="Parking Notes" full><Textarea value={v.parking_notes} onChange={setVehicle(i, "parking_notes")} /></Field>
            </div>
          </Card>
        ))}

        {vehicles.length < 2 && (
          <Button type="button" variant="outline" onClick={() => setVehicles((a) => [...a, emptyVehicle()])} className="lg:col-span-2">
            + Add second vehicle
          </Button>
        )}

        <div className="lg:col-span-2">
          <Button type="submit" size="lg" disabled={mut.isPending}>
            {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
            Import Customer
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
