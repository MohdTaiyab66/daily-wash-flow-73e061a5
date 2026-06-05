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
import { ArrowLeft, Camera, Check, Loader2, Phone, MapPin, Navigation, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const ANGLES = ["front", "rear", "left", "right"] as const;
type Angle = (typeof ANGLES)[number];
type Stage = "before" | "after";

const REASONS = [
  { value: "vehicle_not_available", label: "Vehicle not available" },
  { value: "parking_locked", label: "Locked vehicle / parking" },
  { value: "access_not_available", label: "No access" },
  { value: "customer_asked_to_skip", label: "Customer requested skip" },
  { value: "customer_not_responding", label: "Customer unreachable" },
] as const;

export const Route = createFileRoute("/_authenticated/app/service/$id")({
  component: ServiceDetail,
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

  const beforeDone = new Set((photos ?? []).filter((p) => p.stage === "before").map((p) => p.angle as Angle));
  const afterDone = new Set((photos ?? []).filter((p) => p.stage === "after").map((p) => p.angle as Angle));
  const allBefore = ANGLES.every((a) => beforeDone.has(a));
  const allAfter = ANGLES.every((a) => afterDone.has(a));

  const complete = useMutation({
    mutationFn: async () => {
      if (!allBefore || !allAfter) throw new Error("Capture all 8 photos first (4 before + 4 after)");
      const pos = await getPosition();
      const { error } = await supabase
        .from("services")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          complete_lat: pos?.lat ?? null,
          complete_lng: pos?.lng ?? null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Service complete · ₹17 earned");
      navigate({ to: "/app" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const c = service?.customers as any;
  const v = service?.vehicles as any;

  const navUrl = c?.latitude
    ? `https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c?.address_line ?? ""} ${c?.area ?? ""} Lucknow`)}`;

  return (
    <div className="mx-auto max-w-md px-5 pt-5">
      <button onClick={() => navigate({ to: "/app" })} className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to route
      </button>

      <Card className="mt-4 p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold">{c?.full_name}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{v?.make} {v?.model} · {v?.color}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{v?.registration_number}</p>
          </div>
          <Badge variant="outline" className="capitalize">{service?.status?.replace("_", " ")}</Badge>
        </div>
        <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{c?.address_line}, {c?.area}</p>
          <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />+91 {c?.phone} · Preferred {c?.preferred_time}</p>
        </div>
        {v?.parking_notes && <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs">🅿️ {v.parking_notes}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={navUrl} target="_blank" rel="noreferrer"><Navigation className="mr-1.5 h-4 w-4" /> Navigate</a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`tel:+91${c?.phone}`}><Phone className="mr-1.5 h-4 w-4" /> Call</a>
          </Button>
        </div>
      </Card>

      {service?.status === "pending" && (
        <div className="mt-4 grid grid-cols-1 gap-3">
          <Button size="lg" onClick={() => start.mutate()} disabled={start.isPending}>
            {start.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Start service
          </Button>
          <UnavailableDialog serviceId={id} onDone={() => navigate({ to: "/app" })} />
        </div>
      )}

      {(service?.status === "in_progress" || service?.status === "completed") && (
        <>
          <PhotoSection title="Before service" stage="before" serviceId={id} done={beforeDone} onUploaded={() => refetchPhotos()} />
          <PhotoSection title="After service" stage="after" serviceId={id} done={afterDone} onUploaded={() => refetchPhotos()} />

          {service.status === "in_progress" && (
            <Button size="lg" className="mt-5 w-full" disabled={!allBefore || !allAfter || complete.isPending} onClick={() => complete.mutate()}>
              {complete.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {allBefore && allAfter
                ? "Mark complete · earn ₹17"
                : `${beforeDone.size + afterDone.size}/8 photos uploaded`}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function PhotoSection({
  title, stage, serviceId, done, onUploaded,
}: { title: string; stage: Stage; serviceId: string; done: Set<Angle>; onUploaded: () => void }) {
  return (
    <>
      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">Camera only. 4 angles required.</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {ANGLES.map((a) => (
          <PhotoSlot key={a} angle={a} stage={stage} serviceId={serviceId} done={done.has(a)} onUploaded={onUploaded} />
        ))}
      </div>
    </>
  );
}

function PhotoSlot({
  angle, stage, serviceId, done, onUploaded,
}: { angle: Angle; stage: Stage; serviceId: string; done: boolean; onUploaded: () => void }) {
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
          stage,
          angle,
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
      className={`flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-xs font-medium capitalize transition ${
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
      {angle}
    </button>
  );
}

function UnavailableDialog({ serviceId, onDone }: { serviceId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!reason) { toast.error("Pick a reason"); return; }
    setSaving(true);
    const { error } = await supabase
      .from("services")
      .update({
        status: "unavailable",
        unavailable_reason: reason as any,
        unavailable_notes: notes || null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", serviceId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Marked unavailable");
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
      <DialogContent>
        <DialogHeader><DialogTitle>Vehicle unavailable</DialogTitle></DialogHeader>
        <RadioGroup value={reason} onValueChange={setReason} className="mt-2 space-y-2">
          {REASONS.map((r) => (
            <Label key={r.value} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm">
              <RadioGroupItem value={r.value} />
              {r.label}
            </Label>
          ))}
        </RadioGroup>
        <Textarea
          placeholder="Optional notes for support…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-3"
        />
        <DialogFooter>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
