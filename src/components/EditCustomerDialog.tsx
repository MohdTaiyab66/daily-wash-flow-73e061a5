import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import {
  adminUpdateCustomer,
  createVehicleImageUploadUrl,
  adminUpsertSecondaryVehicle,
  adminDeleteVehicle,
} from "@/lib/admin.functions";
import { SERVICE_AREA_NAMES } from "@/lib/areas";
import { FILE_PICKER_UNAVAILABLE_MESSAGE, selectImageFile } from "@/lib/fileSelect";

const PLANS = ["daily_shine_monthly", "daily_shine_quarterly", "daily_shine_yearly"];
const BEFORE_TIMES = [
  { value: "06:00", label: "Before 6 AM" },
  { value: "07:00", label: "Before 7 AM" },
  { value: "08:00", label: "Before 8 AM" },
  { value: "09:00", label: "Before 9 AM" },
  { value: "10:00", label: "Before 10 AM" },
  { value: "11:00", label: "Before 11 AM" },
];
const PACKAGES = [799, 899, 999, 1099, 1499, 1598];


export function EditCustomerDialog({ customer, vehicles = [] }: { customer: any; vehicles?: any[] }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const fn = useServerFn(adminUpdateCustomer);
  const createUploadUrl = useServerFn(createVehicleImageUploadUrl);
  const upsertVehicle = useServerFn(adminUpsertSecondaryVehicle);
  const deleteVehicle = useServerFn(adminDeleteVehicle);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingImage2, setUploadingImage2] = useState(false);

  const primary = vehicles[0];
  const second = vehicles[1];

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
    make: primary?.make ?? "",
    model: primary?.model ?? "",
    registration_number: primary?.registration_number ?? "",
    color: primary?.color ?? "",
    parking_notes: primary?.parking_notes ?? "",
    front_image_path: primary?.front_image_path ?? customer.front_image_path ?? "",
  });

  const [v2, setV2] = useState({
    id: second?.id ?? "",
    make: second?.make ?? "",
    model: second?.model ?? "",
    registration_number: second?.registration_number ?? "",
    color: second?.color ?? "",
    package_amount: second?.package_amount?.toString() ?? "",
    front_image_path: second?.front_image_path ?? "",
    parking_notes: second?.parking_notes ?? "",
  });

  // Reload form values whenever the dialog opens or the customer data refreshes,
  // so successive edits pick up the latest server state instead of stale initial state.
  useEffect(() => {
    if (!open) return;
    setF({
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
      preferred_time: customer.preferred_time ?? "06:00",
      service_required_before: customer.service_required_before ?? "",
      is_active: customer.is_active ?? true,
      package_amount: customer.package_amount?.toString() ?? "",
      make: primary?.make ?? "",
      model: primary?.model ?? "",
      registration_number: primary?.registration_number ?? "",
      color: primary?.color ?? "",
      parking_notes: primary?.parking_notes ?? "",
      front_image_path: primary?.front_image_path ?? customer.front_image_path ?? "",
    });
    setV2({
      id: second?.id ?? "",
      make: second?.make ?? "",
      model: second?.model ?? "",
      registration_number: second?.registration_number ?? "",
      color: second?.color ?? "",
      package_amount: second?.package_amount?.toString() ?? "",
      front_image_path: second?.front_image_path ?? "",
      parking_notes: second?.parking_notes ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer.id, customer.updated_at, vehicles]);

  const set = (k: keyof typeof f) => (e: any) => setF((p) => ({ ...p, [k]: e?.target ? e.target.value : e }));
  const set2 = (k: keyof typeof v2) => (e: any) => setV2((p) => ({ ...p, [k]: e?.target ? e.target.value : e }));

  const mut = useMutation({
    mutationFn: async () => {
      await fn({ data: {
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
        make: f.make,
        model: f.model,
        registration_number: f.registration_number,
        color: f.color || null,
        parking_notes: f.parking_notes || null,
        front_image_path: f.front_image_path || null,
      }});

      // Save second vehicle if user filled essential fields
      const hasAny = v2.make || v2.model || v2.registration_number || v2.package_amount || v2.front_image_path;
      if (hasAny) {
        if (!v2.make || !v2.model || !v2.registration_number) {
          throw new Error("Second vehicle needs make, model, and registration number");
        }
        await upsertVehicle({ data: {
          customer_id: customer.id,
          vehicle_id: v2.id || null,
          make: v2.make,
          model: v2.model,
          registration_number: v2.registration_number,
          color: v2.color || null,
          package_amount: v2.package_amount ? Number(v2.package_amount) : null,
          front_image_path: v2.front_image_path || null,
          parking_notes: v2.parking_notes || null,
        }});
      }
    },
    onSuccess: () => {
      toast.success("Customer updated");
      qc.invalidateQueries({ queryKey: ["customer-profile", customer.id] });
      qc.invalidateQueries({ queryKey: ["admin-customers"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const removeSecond = useMutation({
    mutationFn: () => deleteVehicle({ data: { vehicle_id: v2.id } }),
    onSuccess: () => {
      toast.success("Second vehicle removed");
      setV2({ id: "", make: "", model: "", registration_number: "", color: "", package_amount: "", front_image_path: "", parking_notes: "" });
      qc.invalidateQueries({ queryKey: ["customer-profile", customer.id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Remove failed"),
  });

  const pickImage = async (slot: 1 | 2) => {
    const file = await selectImageFile();
    if (!file) return toast.error(FILE_PICKER_UNAVAILABLE_MESSAGE);
    await uploadImage(file, slot);
  };

  const uploadImage = async (file: File, slot: 1 | 2) => {
    const setU = slot === 1 ? setUploadingImage : setUploadingImage2;
    setU(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `admin-edit/${customer.id}-v${slot}-${Date.now()}.${ext}`;
      const { supabase } = await import("@/integrations/supabase/client");
      const signed = await createUploadUrl({ data: { path } });
      const { error } = await supabase.storage.from("vehicle-images").uploadToSignedUrl(path, signed.token, file, { contentType: file.type });
      if (error) throw error;
      if (slot === 1) setF((p) => ({ ...p, front_image_path: path }));
      else setV2((p) => ({ ...p, front_image_path: path }));
      toast.success("Vehicle photo uploaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Photo upload failed");
    } finally {
      setU(false);
    }
  };

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
          <Field label="Vehicle make"><Input value={f.make} onChange={set("make")} /></Field>
          <Field label="Vehicle model"><Input value={f.model} onChange={set("model")} /></Field>
          <Field label="Registration"><Input value={f.registration_number} onChange={set("registration_number")} /></Field>
          <Field label="Vehicle color"><Input value={f.color} onChange={set("color")} /></Field>
          <Field label="Parking notes" full><Input value={f.parking_notes} onChange={set("parking_notes")} /></Field>
          <Field label="Vehicle front image" full>
            <button
              type="button"
              onClick={() => void captureImage(1)}
              disabled={uploadingImage}
              className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-4 text-sm disabled:opacity-50 ${f.front_image_path ? "border-success text-success" : "border-border text-muted-foreground"}`}
            >
              {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : f.front_image_path ? <Check className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              {f.front_image_path ? "✓ Captured" : "Capture car front photo"}
            </button>
          </Field>
          <Field label="Status">
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.is_active ? "1" : "0"} onChange={(e: any) => setF((p) => ({ ...p, is_active: e.target.value === "1" }))}>
              <option value="1">Active</option>
              <option value="0">Paused</option>
            </select>
          </Field>
          <Field label="Start date"><Input type="date" value={f.subscription_start} onChange={set("subscription_start")} /></Field>
          <Field label="Renewal date"><Input type="date" value={f.subscription_end} onChange={set("subscription_end")} /></Field>
          <Field label="Preferred time (before)">
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.preferred_time} onChange={set("preferred_time")}>
              {BEFORE_TIMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Service required before">
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.service_required_before} onChange={set("service_required_before")}>
              <option value="">—</option>
              {BEFORE_TIMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>

        </div>

        <div className="mt-5 rounded-md border border-border p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Second vehicle (optional)</p>
            {v2.id && (
              <Button variant="ghost" size="sm" onClick={() => confirm("Remove second vehicle?") && removeSecond.mutate()} disabled={removeSecond.isPending}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />Remove
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Make"><Input value={v2.make} onChange={set2("make")} placeholder="Maruti" /></Field>
            <Field label="Model"><Input value={v2.model} onChange={set2("model")} placeholder="Swift" /></Field>
            <Field label="Registration"><Input value={v2.registration_number} onChange={set2("registration_number")} placeholder="UP32 AB 1234" /></Field>
            <Field label="Color"><Input value={v2.color} onChange={set2("color")} /></Field>
            <Field label="Package">
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={v2.package_amount} onChange={set2("package_amount")}>
                <option value="">—</option>
                {PACKAGES.map((p) => <option key={p} value={p}>₹{p}</option>)}
              </select>
            </Field>
            <Field label="Parking notes"><Input value={v2.parking_notes} onChange={set2("parking_notes")} /></Field>
            <Field label="Vehicle front image" full>
              <button
                type="button"
                onClick={() => void captureImage(2)}
                disabled={uploadingImage2}
                className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-4 text-sm disabled:opacity-50 ${v2.front_image_path ? "border-success text-success" : "border-border text-muted-foreground"}`}
              >
                {uploadingImage2 ? <Loader2 className="h-4 w-4 animate-spin" /> : v2.front_image_path ? <Check className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                {v2.front_image_path ? "✓ Captured" : "Capture car front photo"}
              </button>
            </Field>
          </div>
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
