import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Camera, Check, Loader2, MapPin, Navigation, XCircle, AlertTriangle, Clock, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { OfflineGuard } from "@/components/OfflineGuard";
import { MaskedCallButton } from "./app.live";
import { formatTime12, maskPhone } from "@/lib/format";
import { VehicleImage } from "@/components/VehicleImage";
import { googleMapsDirectionsUrl, gpsLabel, openGoogleMapsDirections, validateExactGps } from "@/lib/gps";
import { captureFromCamera } from "@/lib/camera";
import { getCurrentGps } from "@/lib/native";


const AFTER_ANGLES = ["front", "rear", "left", "right"] as const;
type Angle = (typeof AFTER_ANGLES)[number];

const UNAVAILABLE_REASONS = [
  { value: "vehicle_not_available", label: "Vehicle not available" },
  { value: "customer_not_responding", label: "Customer not responding" },
  { value: "vehicle_taken_out", label: "Vehicle taken out" },
  { value: "keys_not_available", label: "Keys not available" },
  { value: "customer_asked_to_skip", label: "Customer requested skip" },
  { value: "security_guard_denied", label: "Security guard denied entry" },
  { value: "other", label: "Other (remarks required)" },
] as const;

const DIRTY_REASONS = [
  "Heavy Mud",
  "Heavy Dust",
  "Bird Droppings",
  "Tree Sap",
  "Cement",
  "Interior Extremely Dirty",
  "Other",
];
const COMPENSATION = 12;


export const Route = createFileRoute("/_authenticated/app/service/$id")({
  component: () => <OfflineGuard label="service verification"><ServiceDetail /></OfflineGuard>,
});

function ServiceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [serviceNotes, setServiceNotes] = useState("");
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { data: service } = useQuery({
    queryKey: ["service", id],
    queryFn: async () => {
      const { data } = await supabase.from("services").select("*, customers(*), vehicles(*)").eq("id", id).maybeSingle();
      return data;
    },
  });

  const { data: nextServiceId } = useQuery({
    queryKey: ["next-pending-service", id],
    enabled: service?.status === "completed" || service?.status === "unavailable",
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("services")
        .select("id,destination_lat,destination_lng,customers(latitude,longitude,service_required_before,preferred_time)")
        .eq("partner_id", u.user!.id)
        .eq("scheduled_date", today)
        .in("status", ["pending", "in_progress"])
        .neq("id", id);
      const { pickNextStop } = await import("@/lib/route-optimize");
      const c = (service as any)?.customers;
      const currentGps = validateExactGps((service as any)?.destination_lat, (service as any)?.destination_lng);
      const from = currentGps ? { lat: currentGps.latitude, lng: currentGps.longitude } : null;
      const candidates = (data ?? []).map((s: any) => {
        const gps = validateExactGps(s.destination_lat, s.destination_lng);
        return {
          id: s.id,
          lat: gps?.latitude ?? null,
          lng: gps?.longitude ?? null,
          deadline: s.customers?.service_required_before ?? s.customers?.preferred_time ?? null,
        };
      });
      return pickNextStop(candidates, from)?.id ?? null;
    },
  });

  const { data: photos, refetch: refetchPhotos } = useQuery({
    queryKey: ["service-photos", id],
    queryFn: async () => {
      const { data } = await supabase.from("service_photos").select("angle,stage").eq("service_id", id);
      return data ?? [];
    },
  });

  const start = useMutation({
    mutationFn: async () => {
      const t0 = Date.now();
      const pos = await getPosition();
      console.log(`[SVC ${id}] START @ ${new Date(t0).toISOString()} · gps=${pos ? `${pos.lat.toFixed(5)},${pos.lng.toFixed(5)}` : "MISSING"}`);
      const { error } = await supabase
        .from("services")
        .update({
          status: "in_progress",
          started_at: new Date().toISOString(),
          start_lat: pos?.lat ?? null,
          start_lng: pos?.lng ?? null,
        })
        .eq("id", id);
      if (error) throw error;
      console.log(`[SVC ${id}] START ok · Δ${Date.now()-t0}ms`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service", id] }),
  });

  // before = single photo (stored as stage='before', angle='front' to satisfy enum)
  const beforeDone = (photos ?? []).some((p) => p.stage === "before");
  const afterDone = new Set((photos ?? []).filter((p) => p.stage === "after").map((p) => p.angle as Angle));
  const allAfter = AFTER_ANGLES.every((a) => afterDone.has(a));

  const complete = useMutation({
    mutationFn: async () => {
      const t0 = Date.now();
      const missingAfter = AFTER_ANGLES.filter((a) => !afterDone.has(a));
      if (!beforeDone) throw new Error("Take the Before photo first");
      if (missingAfter.length) throw new Error(`Missing After photos: ${missingAfter.join(", ")}`);
      const pos = await getPosition();
      const completedAt = new Date().toISOString();
      console.log(`[SVC ${id}] COMPLETE request @ ${completedAt} · gps=${pos ? `${pos.lat.toFixed(5)},${pos.lng.toFixed(5)}` : "MISSING"} · photos=${(photos ?? []).length}/5 (before=${beforeDone ? "yes" : "no"}, after=${afterDone.size}/4)`);
      const { data, error } = await (supabase as any).rpc("partner_complete_service", {
        p_service_id: id,
        p_lat: pos?.lat ?? null,
        p_lng: pos?.lng ?? null,
        p_notes: serviceNotes.trim() || null,
      });
      if (error) {
        console.error(`[SVC ${id}] COMPLETE fail · code=${(error as any).code} · ${(error as any).message}`);
        const code = (error as any).code ?? "";
        const msg = (error as any).message ?? "Could not complete service";
        if (code === "P04PHOTO") throw new Error("Some required photos are missing. Please re-check Before + 4 After angles.");
        if (code === "P04GPS") throw new Error(msg);
        throw new Error(msg);
      }
      console.log(`[SVC ${id}] COMPLETE ok · Δ${Date.now()-t0}ms · payload=`, data);

      // Service analytics (best-effort, ignore failures)
      if (service?.started_at) {
        const total = Math.max(0, Math.floor((Date.parse(completedAt) - Date.parse(service.started_at)) / 1000));
        const { data: u } = await supabase.auth.getUser();
        await supabase.from("service_analytics").upsert({
          service_id: id,
          partner_id: u.user!.id,
          area: (service.customers as any)?.area ?? null,
          total_seconds: total,
          cleaning_seconds: total,
          travel_seconds: 0,
        }, { onConflict: "service_id" }).then(() => null, () => null);
      }
      return data;
    },
    onSuccess: (data: any) => {
      if (data?.already) {
        toast.message("Service was already completed");
      } else {
        const bal = data?.wallet_balance != null ? ` · wallet ₹${Number(data.wallet_balance).toFixed(0)}` : "";
        toast.success(`Complete · ₹${data?.amount ?? 17} earned${bal}`, {
          description: `Customer ${data?.customer_notified ? "✓" : "✗"} · Admin ${data?.admin_notified ? "✓" : "✗"} · ${data?.photo_count ?? 0} photos · GPS ${data?.gps_flag ?? "n/a"}${data?.distance_m != null ? ` (${data.distance_m}m)` : ""}`,
          duration: 6000,
        });
      }
      qc.invalidateQueries({ queryKey: ["service", id] });
      qc.invalidateQueries({ queryKey: ["next-pending-service", id] });
      qc.invalidateQueries({ queryKey: ["route-today"] });
      qc.invalidateQueries({ queryKey: ["earnings-v3"] });
      qc.invalidateQueries({ queryKey: ["wallet-balance"] });
    },
    onError: (e: any) => toast.error(e.message),
  });


  const goNext = async () => {
    if (nextServiceId) {
      navigate({ to: "/app/service/$id", params: { id: nextServiceId } });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const { data: u } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("services")
      .select("id,sequence_no,manual_sequence_no,eta_at,time_slot")
      .eq("partner_id", u.user!.id)
      .eq("scheduled_date", today)
      .in("status", ["pending", "in_progress"])
      .neq("id", id)
      .order("manual_sequence_no", { ascending: true, nullsFirst: false })
      .order("sequence_no", { ascending: true, nullsFirst: false })
      .order("eta_at", { ascending: true, nullsFirst: false })
      .limit(1);
    const fallbackNext = data?.[0]?.id ?? null;
    if (fallbackNext) navigate({ to: "/app/service/$id", params: { id: fallbackNext } });
    else navigate({ to: "/app/live" });
  };

  const c = service?.customers as any;
  const v = service?.vehicles as any;
  const exactDestination = validateExactGps((service as any)?.destination_lat, (service as any)?.destination_lng);
  const destLat = exactDestination?.latitude ?? null;
  const destLng = exactDestination?.longitude ?? null;
  const destinationSource = exactDestination ? ((service as any)?.destination_source ?? "customer") : "missing";
  const elapsedSeconds = service?.started_at
    ? Math.max(0, Math.floor((nowTick - Date.parse(service.started_at)) / 1000))
    : 0;
  const elapsedLabel = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

  const navUrl = googleMapsDirectionsUrl(destLat, destLng);
  const gpsExact = Boolean(navUrl);

  return (
    <div className="mx-auto max-w-md px-5 pt-5">
      <button onClick={() => navigate({ to: "/app/live" })} className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to route
      </button>

      <Card className="mt-4 overflow-hidden p-0">
        <VehicleImage path={v?.front_image_path} className="h-56 w-full" alt={`${v?.make ?? ""} ${v?.model ?? ""}`} />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-tight">{v?.make} {v?.model}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{v?.registration_number} · {v?.color ?? "—"}</p>
              <div className="mt-3 space-y-0.5">
                <p className="text-sm font-medium">{c?.full_name}</p>
                <p className="text-xs text-muted-foreground">📞 {maskPhone(c?.phone)}</p>
              </div>
            </div>
            <Badge variant="outline" className="capitalize shrink-0">{service?.status?.replace("_", " ")}</Badge>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3 text-[11px]">
            <div><p className="text-muted-foreground">Area</p><p className="font-medium text-foreground">{c?.area ?? "—"}</p></div>
            <div><p className="text-muted-foreground">Scheduled</p><p className="font-medium text-foreground">Before {formatTime12(c?.service_required_before ?? c?.preferred_time) || "—"}</p></div>
            <div><p className="text-muted-foreground">Package</p><p className="font-medium text-foreground">Daily Shine</p></div>
            <div><p className="text-muted-foreground">Today's service</p><p className="font-medium text-foreground">Exterior Cleaning</p></div>
          </div>
          <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{c?.address_line}, {c?.area}</p>
            <p className={`flex items-center gap-1.5 ${gpsExact ? "" : "text-amber-600"}`}>
              <Navigation className="h-3.5 w-3.5" />
              {gpsExact ? `GPS: ${gpsLabel(destLat, destLng)} · ${destinationSource}` : "⚠️ Location unavailable — exact GPS required"}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" disabled={!navUrl} onClick={() => void openGoogleMapsDirections(destLat, destLng)}>
              <Navigation className="mr-1.5 h-4 w-4" /> {navUrl ? "Navigate" : "No GPS"}
            </Button>
            <MaskedCallButton serviceId={id} />
          </div>
        </div>
      </Card>

      {service?.status === "pending" && (
        <div className="mt-4 grid grid-cols-1 gap-3">
          <Button size="lg" onClick={() => start.mutate()} disabled={start.isPending}>
            {start.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Start service
          </Button>
          <UnavailableDialog serviceId={id} onDone={goNext} />
        </div>
      )}

      {(service?.status === "in_progress" || service?.status === "completed") && (
        <>
          {/* Before — single photo */}
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Before service</h2>
          <p className="mt-1 text-xs text-muted-foreground">One photo. Camera only.</p>
          <div className="mt-3">
            <PhotoSlot serviceId={id} stage="before" angle="front" done={beforeDone} onUploaded={() => refetchPhotos()} label="Before photo" wide />
          </div>

          {/* After — 4 photos */}
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">After service</h2>
          <p className="mt-1 text-xs text-muted-foreground">4 angles. Camera only.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {AFTER_ANGLES.map((a) => (
              <PhotoSlot key={a} serviceId={id} stage="after" angle={a} done={afterDone.has(a)} onUploaded={() => refetchPhotos()} label={a} />
            ))}
          </div>

          {/* Reports */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            {service.status === "in_progress" && <UnavailableDialog serviceId={id} onDone={goNext} />}
            <DirtyVehicleDialog serviceId={id} onDone={goNext} />
          </div>

          <Card className="mt-5 p-4">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span className="inline-flex items-center gap-2"><Clock className="h-4 w-4" /> Service timer</span>
              <span className="tabular-nums">{elapsedLabel}</span>
            </div>
            <Textarea
              placeholder="Add service notes for admin/customer record…"
              value={serviceNotes}
              onChange={(e) => setServiceNotes(e.target.value)}
              className="mt-3"
            />
          </Card>


          {service.status === "in_progress" && (
            <Button size="lg" className="mt-5 w-full" disabled={!beforeDone || !allAfter || complete.isPending} onClick={() => complete.mutate()}>
              {complete.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {beforeDone && allAfter
                ? "Mark complete · earn ₹17"
                : `${(beforeDone ? 1 : 0) + afterDone.size}/5 photos uploaded`}
            </Button>
          )}
        </>
      )}

      {(service?.status === "completed" || service?.status === "unavailable") && (
        <div className="mt-5 space-y-3">
          <Card className="border-[color:var(--success)]/40 bg-[color:var(--success)]/5 p-4 text-center">
            <Check className="mx-auto h-6 w-6 text-[color:var(--success)]" />
            <p className="mt-1.5 text-sm font-semibold">
              {service?.status === "completed" ? "Service complete · ₹17 earned" : `Marked unavailable · ₹${COMPENSATION} credited`}
            </p>
          </Card>
          <Button size="lg" className="w-full" onClick={goNext}>
            {nextServiceId ? "Next service →" : "All done · back to route"}
          </Button>
          <Button size="lg" variant="outline" className="w-full" onClick={() => navigate({ to: "/app/live" })}>
            Back to today's route
          </Button>
        </div>
      )}
      <div className="h-8" />
    </div>
  );
}

function PhotoSlot({
  serviceId, stage, angle, done, onUploaded, label, wide,
}: { serviceId: string; stage: "before" | "after"; angle: string; done: boolean; onUploaded: () => void; label: string; wide?: boolean }) {
  const [uploading, setUploading] = useState(false);

  const openCamera = async () => {
    const t0 = Date.now();
    console.log(`[SVC ${serviceId}] PHOTO capture start · ${stage}/${angle}`);
    const file = await captureFromCamera();
    if (!file) { console.log(`[SVC ${serviceId}] PHOTO cancelled · ${stage}/${angle}`); return; }
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const pos = await getPosition();
      const path = `${u.user!.id}/${serviceId}/${stage}-${angle}-${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("service-photos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) { console.error(`[SVC ${serviceId}] PHOTO storage fail · ${stage}/${angle} · ${error.message}`); toast.error(error.message); return; }
      const { error: e2 } = await supabase
        .from("service_photos")
        .upsert(
          {
            service_id: serviceId,
            partner_id: u.user!.id,
            stage: stage as any,
            angle: angle as any,
            storage_path: path,
            lat: pos?.lat ?? null,
            lng: pos?.lng ?? null,
          },
          { onConflict: "service_id,stage,angle" },
        );
      if (e2) { console.error(`[SVC ${serviceId}] PHOTO row fail · ${e2.message}`); toast.error(e2.message); return; }
      console.log(`[SVC ${serviceId}] PHOTO ok · ${stage}/${angle} · gps=${pos ? `${pos.lat.toFixed(5)},${pos.lng.toFixed(5)}` : "MISSING"} · size=${file.size}b · Δ${Date.now()-t0}ms`);
      onUploaded();
    } finally {
      setUploading(false);
    }
  };

  return (
    <button
      onClick={openCamera}
      disabled={uploading}
      className={`flex ${wide ? "aspect-[3/1]" : "aspect-square"} flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-xs font-medium capitalize transition ${
        done
          ? "border-[color:var(--success)] bg-[color:var(--success)]/10 text-[color:var(--success)]"
          : "border-border text-muted-foreground hover:border-primary hover:text-primary"
      }`}
    >
      {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : done ? <Check className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
      {label}
    </button>
  );
}


function UnavailableDialog({ serviceId, onDone }: { serviceId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const MIN_PHOTOS = 2;
  const MAX_PHOTOS = 4;
  const needsRemarks = reason === "other";
  const canSubmit =
    !!reason &&
    photos.length >= MIN_PHOTOS &&
    (!needsRemarks || notes.trim().length > 0);

  const capturePhoto = async () => {
    if (photos.length >= MAX_PHOTOS) return;
    const file = await captureFromCamera();
    if (!file) return;
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const path = `${u.user!.id}/${serviceId}/unavailable-${photos.length + 1}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("service-photos").upload(path, file, { upsert: true, contentType: file.type });
      if (error) { toast.error(error.message); return; }
      setPhotos((p) => [...p, path]);
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (idx: number) => setPhotos((p) => p.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!reason) return toast.error("Pick a reason");
    if (photos.length < MIN_PHOTOS) return toast.error(`Capture at least ${MIN_PHOTOS} photos`);
    if (needsRemarks && !notes.trim()) return toast.error("Remarks are required for 'Other'");
    setSaving(true);
    const pos = await getPosition();
    const { data, error } = await supabase.rpc("submit_service_unavailable", {
      p_service_id: serviceId,
      p_reason: reason,
      p_notes: notes || "",
      p_photos: photos,
      p_lat: pos?.lat ?? 0,
      p_lng: pos?.lng ?? 0,
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    console.log(`[SVC ${serviceId}] UNAVAILABLE submit_service_unavailable response`, data);
    toast.success(`Marked unavailable · ₹${(data as any)?.credited ?? 12} credited`);
    qc.invalidateQueries({ queryKey: ["service", serviceId] });
    qc.invalidateQueries({ queryKey: ["route-today"] });
    qc.invalidateQueries({ queryKey: ["earnings-v3"] });
    qc.invalidateQueries({ queryKey: ["wallet-balance"] });
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg">
          <XCircle className="mr-2 h-4 w-4" /> Mark unavailable
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Vehicle unavailable</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Pick a reason and capture at least {MIN_PHOTOS} live proof photos.</p>
        <RadioGroup value={reason} onValueChange={setReason} className="mt-2 space-y-2">
          {UNAVAILABLE_REASONS.map((r) => (
            <Label key={r.value} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm">
              <RadioGroupItem value={r.value} />
              {r.label}
            </Label>
          ))}
        </RadioGroup>

        <div className="mt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Live evidence photos ({photos.length}/{MIN_PHOTOS} required)
          </p>
          <div className="grid grid-cols-2 gap-2">
            {photos.map((_, i) => (
              <div key={i} className="relative flex aspect-square items-center justify-center rounded-xl border-2 border-[color:var(--success)] bg-[color:var(--success)]/10 text-[color:var(--success)]">
                <Check className="h-5 w-5" />
                <span className="ml-1 text-xs">Photo {i + 1}</span>
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-muted-foreground"
                  aria-label={`Remove photo ${i + 1}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={capturePhoto}
                disabled={uploading}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-xs text-muted-foreground hover:border-primary hover:text-primary"
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                {photos.length === 0 ? "Capture" : "Add another"}
              </button>
            )}
          </div>
        </div>

        <Textarea
          placeholder={needsRemarks ? "Remarks (required for Other)…" : "Optional notes for support…"}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-3"
        />
        <DialogFooter>
          <Button onClick={submit} disabled={saving || uploading || !canSubmit}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit · ₹{COMPENSATION}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function DirtyVehicleDialog({ serviceId, onDone }: { serviceId: string; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const upload = async (angle: string, file: File) => {
    const { data: u } = await supabase.auth.getUser();
    const path = `${u.user!.id}/${serviceId}/dirty-${angle}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("service-photos").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { toast.error(error.message); return; }
    setPhotos((p) => ({ ...p, [angle]: path }));
  };

  const submit = async () => {
    if (!reason) return toast.error("Pick a reason");
    if (reason === "Other" && !notes.trim()) return toast.error("Remarks are required for 'Other'");
    if (Object.keys(photos).length < 4) return toast.error("All 4 photos required");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const pos = await getPosition();
    const { data: svc, error: svcError } = await supabase
      .from("services")
      .select("customer_id")
      .eq("id", serviceId)
      .maybeSingle();
    if (svcError || !svc?.customer_id) {
      setSaving(false);
      return toast.error(svcError?.message || "Could not load customer for this service");
    }
    const { error: e1 } = await supabase.from("dirty_vehicle_reports").insert({
      service_id: serviceId, partner_id: u.user!.id, customer_id: svc.customer_id, reason, notes: notes || null,
      photo_front: photos.front, photo_rear: photos.rear, photo_left: photos.left, photo_right: photos.right,
      lat: pos?.lat ?? null, lng: pos?.lng ?? null, captured_at: new Date().toISOString(), recommendation: "premium_or_included_wash",
    });
    if (e1) { setSaving(false); return toast.error(e1.message); }
    // Mark service as unavailable + credit ₹12 (vehicle too dirty to clean)
    const { data, error: e2 } = await supabase.rpc("submit_service_unavailable", {
      p_service_id: serviceId,
      p_reason: "dirty_vehicle",
      p_notes: `${reason}${notes ? ` · ${notes}` : ""}`,
      p_photos: [photos.front, photos.rear, photos.left, photos.right],
      p_lat: pos?.lat ?? 0,
      p_lng: pos?.lng ?? 0,
    } as any);
    setSaving(false);
    if (e2) return toast.error(e2.message);
    console.log(`[SVC ${serviceId}] DIRTY submit_service_unavailable response`, data);
    toast.success(`Dirty vehicle reported · ₹${(data as any)?.credited ?? COMPENSATION} credited`);
    qc.invalidateQueries({ queryKey: ["service", serviceId] });
    qc.invalidateQueries({ queryKey: ["route-today"] });
    qc.invalidateQueries({ queryKey: ["earnings-v3"] });
    setOpen(false);
    void onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><AlertTriangle className="mr-1.5 h-4 w-4" />Dirty vehicle</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Report dirty vehicle</DialogTitle></DialogHeader>
        <RadioGroup value={reason} onValueChange={setReason} className="mt-2 space-y-1">
          {DIRTY_REASONS.map((r) => (
            <Label key={r} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-2.5 text-sm">
              <RadioGroupItem value={r} />{r}
            </Label>
          ))}
        </RadioGroup>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {["front", "rear", "left", "right"].map((a) => (
            <ReportPhoto key={a} angle={a} done={!!photos[a]} onPicked={(f) => upload(a, f)} />
          ))}
        </div>
        <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-3" />
        <DialogFooter>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}




function ReportPhoto({ angle, done, onPicked }: { angle: string; done: boolean; onPicked: (f: File) => void }) {
  const trigger = async () => {
    const f = await captureFromCamera();
    if (f) onPicked(f);
  };
  return (
    <button
      onClick={trigger}
      className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-[11px] capitalize ${
        done ? "border-[color:var(--success)] bg-[color:var(--success)]/10 text-[color:var(--success)]" : "border-border text-muted-foreground"
      }`}
    >
      {done ? <Check className="h-4 w-4" /> : <Camera className="h-4 w-4" />}{angle}
    </button>
  );
}



async function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return getCurrentGps({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}
