import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Pencil } from "lucide-react";
import { adminUpdateCustomer } from "@/lib/admin.functions";
import { SERVICE_AREA_NAMES } from "@/lib/areas";

const PLANS = ["daily_shine_monthly", "daily_shine_quarterly", "daily_shine_yearly"];
const TIMES = ["06:00 - 09:00", "06:30 - 09:00", "07:00 - 09:00", "08:30 - 10:30", "09:00 - 11:00"];
const REQUIRED_BEFORE = ["07:00", "08:00", "09:00", "10:00", "11:00"];
const PACKAGES = [799, 899, 999, 1099, 1499, 1598];

export function EditCustomerDialog({ customer }: { customer: any }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const fn = useServerFn(adminUpdateCustomer);

  const [f, setF] = useState({
    full_name: customer.full_name ?? "",
    phone: customer.phone ?? "",
    area: customer.area ?? "",
    address_line: customer.address_line ?? "",
    pincode: customer.pincode ?? "",
    latitude: customer.latitude?.toString() ?? "",
    longitude: customer.longitude?.toString() ?? "",
    subscription_plan: customer.subscription_plan ?? "daily_shine_monthly",
    subscription_start: customer.subscription_start ?? "",
    subscription_end: customer.subscription_end ?? "",
    preferred_time: customer.preferred_time ?? "06:00 - 09:00",
    service_required_before: customer.service_required_before ?? "",
    is_active: customer.is_active ?? true,
    package_amount: customer.package_amount?.toString() ?? "",
  });

  const set = (k: keyof typeof f) => (e: any) => setF((p) => ({ ...p, [k]: e?.target ? e.target.value : e }));

  const mut = useMutation({
    mutationFn: () => fn({ data: {
      id: customer.id,
      full_name: f.full_name,
      phone: f.phone,
      area: f.area,
      address_line: f.address_line,
      pincode: f.pincode || null,
      latitude: f.latitude ? Number(f.latitude) : null,
      longitude: f.longitude ? Number(f.longitude) : null,
      subscription_plan: f.subscription_plan,
      subscription_start: f.subscription_start,
      subscription_end: f.subscription_end,
      preferred_time: f.preferred_time,
      service_required_before: f.service_required_before || null,
      is_active: f.is_active,
      package_amount: f.package_amount ? Number(f.package_amount) : null,
    }}),
    onSuccess: () => {
      toast.success("Customer updated");
      qc.invalidateQueries({ queryKey: ["customer-profile", customer.id] });
      qc.invalidateQueries({ queryKey: ["admin-customers"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Pencil className="mr-2 h-3.5 w-3.5" />Edit</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit customer</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input value={f.full_name} onChange={set("full_name")} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={set("phone")} /></Field>
          <Field label="Area">
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.area} onChange={set("area")}>
              {SERVICE_AREA_NAMES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Pincode"><Input value={f.pincode} onChange={set("pincode")} /></Field>
          <Field label="Address" full><Input value={f.address_line} onChange={set("address_line")} /></Field>
          <Field label="Latitude"><Input value={f.latitude} onChange={set("latitude")} /></Field>
          <Field label="Longitude"><Input value={f.longitude} onChange={set("longitude")} /></Field>
          <Field label="Plan">
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.subscription_plan} onChange={set("subscription_plan")}>
              {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Package">
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.package_amount} onChange={set("package_amount")}>
              <option value="">—</option>
              {PACKAGES.map((p) => <option key={p} value={p}>₹{p}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.is_active ? "1" : "0"} onChange={(e: any) => setF((p) => ({ ...p, is_active: e.target.value === "1" }))}>
              <option value="1">Active</option>
              <option value="0">Paused</option>
            </select>
          </Field>
          <Field label="Start date"><Input type="date" value={f.subscription_start} onChange={set("subscription_start")} /></Field>
          <Field label="Renewal date"><Input type="date" value={f.subscription_end} onChange={set("subscription_end")} /></Field>
          <Field label="Preferred time slot">
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.preferred_time} onChange={set("preferred_time")}>
              {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Service required before">
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.service_required_before} onChange={set("service_required_before")}>
              <option value="">—</option>
              {REQUIRED_BEFORE.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
