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
import { ArrowLeft, Camera, Check, Loader2, MapPin, Navigation, XCircle, AlertTriangle, ParkingCircle } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { OfflineGuard } from "@/components/OfflineGuard";
import { MaskedCallButton } from "./app.live";
import { formatTime12 } from "@/lib/format";
import { VehicleImage } from "@/components/VehicleImage";

const AFTER_ANGLES = ["front", "rear", "left", "right"] as const;
type Angle = (typeof AFTER_ANGLES)[number];

const UNAVAILABLE_REASONS = [
  { value: "vehicle_not_available", label: "Vehicle not available" },
  { value: "parking_locked", label: "Locked vehicle / parking" },
  { value: "access_not_available", label: "No access" },
  { value: "customer_asked_to_skip", label: "Customer requested skip" },
  { value: "customer_not_responding", label: "Customer unreachable" },
] as const;

const DIRTY_REASONS = ["Heavy Mud", "Construction Dust", "Bird Droppings", "Needs Foam Wash", "Needs Pressure Wash", "Other"];
const COMPENSATION = 12;
const PARKING_REASONS = ["No Access", "Wall Side Blocked", "Narrow Parking", "Vehicle Too Close", "Other"];

export const Route = createFileRoute("/_authenticated/app/service/$id")({
  component: () => <OfflineGuard label="service verification"><ServiceDetail /></OfflineGuard>,
});

function ServiceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

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
        .select("id,sequence_no")
        .eq("partner_id", u.user!.id)
        .eq("scheduled_date", today)
        .in("status", ["pending", "in_progress"])
        .neq("id", id)
        .order("sequence_no", { ascending: true })
        .limit(1);
      return data?.[0]?.id ?? null;
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
      const pos = await getPosition();
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
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service", id] }),
  });

  // before = single photo (stored as stage='before', angle='front' to satisfy enum)
  const beforeDone = (photos ?? []).some((p) => p.stage === "before");
  const afterDone = new Set((photos ?? []).filter((p) => p.stage === "after").map((p) => p.angle as Angle));
  const allAfter = AFTER_ANGLES.every((a) => afterDone.has(a));

  const complete = useMutation({
    mutationFn: async () => {
      if (!beforeDone) throw new Error("Take the Before photo first");
      if (!allAfter) throw new Error("Capture all 4 After photos");
      const pos = await getPosition();
      const completedAt = new Date().toISOString();
      const { error } = await supabase
        .from("services")
        .update({
          status: "completed",
          completed_at: completedAt,
          complete_lat: pos?.lat ?? null,
          complete_lng: pos?.lng ?? null,
        })
        .eq("id", id);
      if (error) throw error;

      // store analytics
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
        }, { onConflict: "service_id" });
      }
    },
    onSuccess: () => {
      toast.success("Service complete · ₹17 earned");
      qc.invalidateQueries({ queryKey: ["service", id] });
      qc.invalidateQueries({ queryKey: ["next-pending-service", id] });
      qc.invalidateQueries({ queryKey: ["route-today"] });
      qc.invalidateQueries({ queryKey: ["earnings-v3"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const goNext = () => {
    if (nextServiceId) navigate({ to: "/app/service/$id", params: { id: nextServiceId } });
    else navigate({ to: "/app/live" });
  };

  const c = service?.customers as any;
  const v = service?.vehicles as any;

  const navUrl = c?.latitude
    ? `https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c?.address_line ?? ""} ${c?.area ?? ""} Lucknow`)}`;

  return (
    <div className="mx-auto max-w-md px-5 pt-5">
      <button onClick={() => navigate({ to: "/app/live" })} className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to route
      </button>

      <Card className="mt-4 overflow-hidden p-0">
        <VehicleImage path={v?.front_image_path} className="h-40 w-full" alt={`${v?.make ?? ""} ${v?.model ?? ""}`} />
        <div className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold">{c?.full_name}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{v?.make} {v?.model} · {v?.color}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{v?.registration_number}</p>
              <p className="mt-0.5 text-xs font-medium">Package: {v?.package_amount ? `₹${v.package_amount}` : "—"}</p>
            </div>
            <Badge variant="outline" className="capitalize">{service?.status?.replace("_", " ")}</Badge>
          </div>
          <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{c?.address_line}, {c?.area}</p>
            <p className="text-xs font-medium text-foreground">Required before {formatTime12(c?.service_required_before ?? c?.preferred_time)}</p>
          </div>
          {v?.parking_notes && <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs">🅿️ {v.parking_notes}</p>}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={navUrl} target="_blank" rel="noreferrer"><Navigation className="mr-1.5 h-4 w-4" /> Navigate</a>
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
            <DirtyVehicleDialog serviceId={id} onDone={goNext} />
            <ParkingIssueDialog serviceId={id} />
          </div>

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handle = async (file: File) => {
    setUploading(true);
    const { data: u } = await supabase.auth.getUser();
    const pos = await getPosition();
    const path = `${u.user!.id}/${serviceId}/${stage}-${angle}-${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from("service-photos")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) { toast.error(error.message); setUploading(false); return; }
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
    setUploading(false);
    if (e2) { toast.error(e2.message); return; }
    onUploaded();
  };

  return (
    <button
      onClick={() => inputRef.current?.click()}
      className={`flex ${wide ? "aspect-[3/1]" : "aspect-square"} flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-xs font-medium capitalize transition ${
        done
          ? "border-[color:var(--success)] bg-[color:var(--success)]/10 text-[color:var(--success)]"
          : "border-border text-muted-foreground hover:border-primary hover:text-primary"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])}
      />
      {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : done ? <Check className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
      {label}
    </button>
  );
}

function UnavailableDialog({ serviceId, onDone }: { serviceId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handlePhoto = async (file: File) => {
    setUploading(true);
    const { data: u } = await supabase.auth.getUser();
    const path = `${u.user!.id}/${serviceId}/unavailable-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("service-photos").upload(path, file, { upsert: true, contentType: file.type });
    setUploading(false);
    if (error) { toast.error(error.message); return; }
    setPhoto(path);
  };

  const submit = async () => {
    if (!reason) { toast.error("Pick a reason"); return; }
    if (!photo) { toast.error("Live photo is required"); return; }
    setSaving(true);
    const pos = await getPosition();
    const { data, error } = await supabase.rpc("submit_service_unavailable", {
      p_service_id: serviceId,
      p_reason: reason,
      p_notes: notes || "",
      p_photo: photo,
      p_lat: pos?.lat ?? 0,
      p_lng: pos?.lng ?? 0,
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Marked unavailable · ₹${(data as any)?.credited ?? 12} credited`);
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
        <RadioGroup value={reason} onValueChange={setReason} className="mt-2 space-y-2">
          {UNAVAILABLE_REASONS.map((r) => (
            <Label key={r.value} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm">
              <RadioGroupItem value={r.value} />
              {r.label}
            </Label>
          ))}
        </RadioGroup>

        <div className="mt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live evidence photo (required)</p>
          <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => e.target.files?.[0] && handlePhoto(e.target.files[0])} />
          <button
            onClick={() => inputRef.current?.click()}
            className={`flex aspect-[3/1] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-xs ${
              photo ? "border-[color:var(--success)] bg-[color:var(--success)]/10 text-[color:var(--success)]" : "border-border text-muted-foreground"
            }`}
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : photo ? <Check className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
            {photo ? "Photo captured" : "Tap to capture (camera only)"}
          </button>
        </div>

        <Textarea placeholder="Optional notes for support…" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-3" />
        <DialogFooter>
          <Button onClick={submit} disabled={saving || uploading || !photo || !reason}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit · ₹12
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function DirtyVehicleDialog({ serviceId }: { serviceId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const upload = async (angle: string, file: File) => {
    const { data: u } = await supabase.auth.getUser();
    const path = `${u.user!.id}/${serviceId}/dirty-${angle}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("service-photos").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { toast.error(error.message); return; }
    setPhotos((p) => ({ ...p, [angle]: path }));
  };

  const submit = async () => {
    if (!reason) return toast.error("Pick a reason");
    if (Object.keys(photos).length < 4) return toast.error("All 4 photos required");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("dirty_vehicle_reports").insert({
      service_id: serviceId, partner_id: u.user!.id, reason, notes: notes || null,
      photo_front: photos.front, photo_rear: photos.rear, photo_left: photos.left, photo_right: photos.right,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Dirty vehicle reported");
    setOpen(false);
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

function ParkingIssueDialog({ serviceId }: { serviceId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const upload = async (file: File) => {
    const { data: u } = await supabase.auth.getUser();
    const path = `${u.user!.id}/${serviceId}/parking-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("service-photos").upload(path, file, { upsert: true, contentType: file.type });
    if (error) return toast.error(error.message);
    setPhoto(path);
  };

  const submit = async () => {
    if (!reason) return toast.error("Pick a reason");
    if (!photo) return toast.error("Upload a proof photo");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("parking_reports").insert({
      service_id: serviceId, partner_id: u.user!.id, reason, notes: notes || null, photo_path: photo,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Parking issue reported");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><ParkingCircle className="mr-1.5 h-4 w-4" />Parking</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Parking issue</DialogTitle></DialogHeader>
        <RadioGroup value={reason} onValueChange={setReason} className="mt-2 space-y-1">
          {PARKING_REASONS.map((r) => (
            <Label key={r} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-2.5 text-sm">
              <RadioGroupItem value={r} />{r}
            </Label>
          ))}
        </RadioGroup>
        <ReportPhoto angle="Proof" done={!!photo} onPicked={upload} />
        <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-3" />
        <DialogFooter>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportPhoto({ angle, done, onPicked }: { angle: string; done: boolean; onPicked: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <button
      onClick={() => ref.current?.click()}
      className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-[11px] capitalize ${
        done ? "border-[color:var(--success)] bg-[color:var(--success)]/10 text-[color:var(--success)]" : "border-border text-muted-foreground"
      }`}
    >
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && onPicked(e.target.files[0])} />
      {done ? <Check className="h-4 w-4" /> : <Camera className="h-4 w-4" />}{angle}
    </button>
  );
}

async function getPosition(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 4000, maximumAge: 30000 },
    );
  });
}
