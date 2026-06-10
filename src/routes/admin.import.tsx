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
    address_line: "",
    area: "",
    pincode: "",
    latitude: "",
    longitude: "",
    subscription_plan: PLANS[0],
    subscription_start: today,
    subscription_end: inThirty,
    preferred_time: TIMES[0],
    is_active: true,
    vehicle_make: "",
    vehicle_model: "",
    vehicle_registration: "",
    vehicle_color: "",
    parking_notes: "",
    assigned_partner_id: "",
  });

  const set = (k: keyof typeof form) => (v: any) =>
    setForm((f) => ({ ...f, [k]: typeof v === "object" && v?.target ? v.target.value : v }));

  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
          ...form,
          latitude: form.latitude ? Number(form.latitude) : undefined,
          longitude: form.longitude ? Number(form.longitude) : undefined,
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
    if (!form.full_name || !form.phone || !form.address_line || !form.area || !form.vehicle_make || !form.vehicle_model || !form.vehicle_registration) {
      toast.error("Please fill required fields");
      return;
    }
    mut.mutate();
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Customer Import</h1>
          <p className="mt-1 text-sm text-muted-foreground">Onboard an existing Urban Wash customer for the pilot launch.</p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Customer</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Customer Name *"><Input value={form.full_name} onChange={set("full_name")} /></Field>
            <Field label="Phone Number *"><Input value={form.phone} onChange={set("phone")} placeholder="9876543210" /></Field>
            <Field label="Address *" full><Input value={form.address_line} onChange={set("address_line")} /></Field>
            <Field label="Area *"><Input value={form.area} onChange={set("area")} placeholder="Gomti Nagar" /></Field>
            <Field label="Pincode"><Input value={form.pincode} onChange={set("pincode")} /></Field>
            <Field label="Latitude"><Input value={form.latitude} onChange={set("latitude")} placeholder="26.8467" /></Field>
            <Field label="Longitude"><Input value={form.longitude} onChange={set("longitude")} placeholder="80.9462" /></Field>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Vehicle</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Make *"><Input value={form.vehicle_make} onChange={set("vehicle_make")} placeholder="Maruti" /></Field>
            <Field label="Model *"><Input value={form.vehicle_model} onChange={set("vehicle_model")} placeholder="Swift" /></Field>
            <Field label="Reg. Number *" full><Input value={form.vehicle_registration} onChange={set("vehicle_registration")} placeholder="UP 32 AB 1234" /></Field>
            <Field label="Color"><Input value={form.vehicle_color} onChange={set("vehicle_color")} /></Field>
            <Field label="Parking Notes" full><Textarea value={form.parking_notes} onChange={set("parking_notes")} /></Field>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Subscription</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Plan">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.subscription_plan} onChange={set("subscription_plan")}>
                {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Preferred Time">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.preferred_time} onChange={set("preferred_time")}>
                {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Start Date"><Input type="date" value={form.subscription_start} onChange={set("subscription_start")} /></Field>
            <Field label="Renewal Date"><Input type="date" value={form.subscription_end} onChange={set("subscription_end")} /></Field>
            <Field label="Status">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.is_active ? "1" : "0"} onChange={(e: any) => setForm((f) => ({ ...f, is_active: e.target.value === "1" }))}>
                <option value="1">Active</option>
                <option value="0">Paused</option>
              </select>
            </Field>
            <Field label="Assigned Partner (optional)">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.assigned_partner_id} onChange={set("assigned_partner_id")}>
                <option value="">— Unassigned —</option>
                {(partners ?? []).map((p: any) => (
                  <option key={p.id} value={p.id}>{p.full_name} ({p.partner_code})</option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

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
