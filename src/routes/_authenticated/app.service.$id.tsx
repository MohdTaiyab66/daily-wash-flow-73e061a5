import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Camera, Check, ChevronDown, Loader2, Navigation, XCircle, AlertTriangle, Clock, User, Car, IdCard, MapPin, ZoomIn, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { OfflineGuard } from "@/components/OfflineGuard";
import { MaskedCallButton } from "./app.live";
import { formatTime12 } from "@/lib/format";
import { VehiclePhotoViewer } from "@/components/VehiclePhotoViewer";
import { VehicleImage } from "@/components/VehicleImage";
import { openGoogleMapsDirections, validateExactGps } from "@/lib/gps";
import { CAMERA_UNAVAILABLE_MESSAGE, captureFromCamera, consumeRestoredCameraCapture } from "@/lib/camera";
import { getCurrentGps } from "@/lib/native";
import { evidenceError, logApkEvidence } from "@/lib/apkEvidence";
import { deleteQueuedPhoto, loadQueuedPhoto, saveQueuedPhoto } from "@/lib/photo-upload-queue";


const AFTER_ANGLES = ["front", "rear", "left", "right"] as const;
type Angle = (typeof AFTER_ANGLES)[number];
const REPORT_ANGLES = ["front", "rear", "left", "right"] as const;

const UNAVAILABLE_REASONS = [
  { value: "vehicle_not_available", label: "Vehicle not available" },
  { value: "customer_not_responding", label: "Customer not responding" },
  { value: "customer_asked_to_skip", label: "Customer requested skip" },
  { value: "other", label: "Other (remarks required)" },
] as const;

const DIRTY_REASONS = [
  "Heavy Mud",
  "Heavy Dust",
  "Bird Droppings",
  "Other",
];
const COMPENSATION = 12;
const UNAVAILABLE_SLOTS = ["proof_1", "proof_2", "proof_3", "proof_4"] as const;

function workflowEventName(workflow: "service_photo" | "dirty_vehicle" | "unavailable_vehicle", phase: "camera_attempt" | "camera_result" | "photo_upload_result") {
  if (workflow === "service_photo") return `service_photo_${phase}`;
  if (workflow === "dirty_vehicle") return `dirty_${phase}`;
  return `unavailable_${phase}`;
}


export const Route = createFileRoute("/_authenticated/app/service/$id")({
  component: () => <OfflineGuard label="service verification"><ServiceDetail /></OfflineGuard>,
});

function ServiceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [serviceNotes, setServiceNotes] = useState("");
  const [nowTick, setNowTick] = useState(Date.now());
  const [autoOpenBefore, setAutoOpenBefore] = useState(false);

  useEffect(() => {
    const iv = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(iv);
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
      const { data } = await supabase.from("service_photos").select("angle,stage,storage_path").eq("service_id", id);
      return data ?? [];
    },
  });

  const start = useMutation({
    mutationFn: async () => {
      const t0 = Date.now();
      const pos = await getPosition();
      await logApkEvidence({
        eventType: "service_start_attempt",
        serviceId: id,
        assignmentId: (service as any)?.assignment_id ?? null,
        gps: pos,
        payload: { previous_status: service?.status ?? null },
      });
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
      if (error) {
        await logApkEvidence({ eventType: "service_start_result", serviceId: id, assignmentId: (service as any)?.assignment_id ?? null, gps: pos, status: "error", payload: evidenceError(error) });
        throw error;
      }
      console.log(`[SVC ${id}] START ok · Δ${Date.now()-t0}ms`);
      await logApkEvidence({
        eventType: "service_start_result",
        serviceId: id,
        assignmentId: (service as any)?.assignment_id ?? null,
        gps: pos,
        status: "success",
        payload: { elapsed_ms: Date.now() - t0, next_status: "in_progress" },
      });
    },
    onSuccess: () => {
      setAutoOpenBefore(true);
      qc.invalidateQueries({ queryKey: ["service", id] });
    },
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
      await logApkEvidence({
        eventType: "service_complete_attempt",
        serviceId: id,
        assignmentId: (service as any)?.assignment_id ?? null,
        gps: pos,
        payload: { before_done: beforeDone, after_done_count: afterDone.size, missing_after: missingAfter },
      });
      console.log(`[SVC ${id}] COMPLETE request @ ${completedAt} · gps=${pos ? `${pos.lat.toFixed(5)},${pos.lng.toFixed(5)}` : "MISSING"} · photos=${(photos ?? []).length}/5 (before=${beforeDone ? "yes" : "no"}, after=${afterDone.size}/4)`);
      const { data, error } = await (supabase as any).rpc("partner_complete_service", {
        p_service_id: id,
        p_lat: pos?.lat ?? null,
        p_lng: pos?.lng ?? null,
        p_notes: serviceNotes.trim() || null,
      });
      if (error) {
        console.error(`[SVC ${id}] COMPLETE fail · code=${(error as any).code} · ${(error as any).message}`);
        await logApkEvidence({ eventType: "service_complete_result", serviceId: id, assignmentId: (service as any)?.assignment_id ?? null, gps: pos, status: "error", payload: evidenceError(error) });
        const code = (error as any).code ?? "";
        const msg = (error as any).message ?? "Could not complete service";
        if (code === "P04PHOTO") throw new Error("Some required photos are missing. Please re-check Before + 4 After angles.");
        if (code === "P04GPS") throw new Error(msg);
        throw new Error(msg);
      }
      console.log(`[SVC ${id}] COMPLETE ok · Δ${Date.now()-t0}ms · payload=`, data);
      await logApkEvidence({
        eventType: "service_complete_result",
        serviceId: id,
        assignmentId: (service as any)?.assignment_id ?? null,
        gps: pos,
        status: "success",
        payload: { elapsed_ms: Date.now() - t0, rpc: data },
      });

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
      window.setTimeout(() => {
        void logApkEvidence({
          eventType: "route_auto_advance_after_completion",
          serviceId: id,
          assignmentId: (service as any)?.assignment_id ?? null,
          status: "success",
          payload: { next_service_id: nextServiceId ?? null, rpc: data },
        });
        void goNext();
      }, 900);
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

  const refreshAfterReport = () => {
    void qc.invalidateQueries({ queryKey: ["service", id] });
    void qc.invalidateQueries({ queryKey: ["next-pending-service", id] });
    void qc.invalidateQueries({ queryKey: ["route-today"] });
    void qc.invalidateQueries({ queryKey: ["active-assignment-summary"] });
    void qc.invalidateQueries({ queryKey: ["today-services-mini"] });
    void qc.invalidateQueries({ queryKey: ["earnings-v3"] });
    void qc.invalidateQueries({ queryKey: ["wallet-balance"] });
    window.setTimeout(() => void goNext(), 900);
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

  const hasNavigation = destLat != null && destLng != null;

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
              <p className="text-sm font-medium leading-tight">{c?.full_name}</p>
              <p className="mt-1 text-lg font-semibold leading-tight">{v?.make} {v?.model}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{v?.registration_number}</p>
              <div className="mt-3 space-y-0.5">
                <p className="text-xs text-muted-foreground">{formatTime12(c?.service_required_before ?? c?.preferred_time) || "Flexible"}</p>
              </div>
            </div>
            <Badge variant="outline" className="capitalize shrink-0">{service?.status?.replace("_", " ")}</Badge>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!hasNavigation}
              onClick={async () => {
                await logApkEvidence({
                  eventType: "navigation_open_attempt",
                  serviceId: id,
                  assignmentId: (service as any)?.assignment_id ?? null,
                  status: hasNavigation ? "info" : "blocked",
                  payload: { destination_lat: destLat, destination_lng: destLng, destination_source: destinationSource },
                });
                const opened = await openGoogleMapsDirections(destLat, destLng);
                await logApkEvidence({
                  eventType: "navigation_open_result",
                  serviceId: id,
                  assignmentId: (service as any)?.assignment_id ?? null,
                  status: opened ? "success" : "error",
                  payload: { opened, destination_lat: destLat, destination_lng: destLng },
                });
              }}
            >
              <Navigation className="mr-1.5 h-4 w-4" /> {hasNavigation ? "Navigate" : "No GPS"}
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
          <UnavailableSection serviceId={id} assignmentId={(service as any)?.assignment_id ?? null} photos={photos ?? []} refetch={refetchPhotos} onDone={refreshAfterReport} />
        </div>
      )}

      {(service?.status === "in_progress" || service?.status === "completed") && (
        <>
          {/* Before — single photo */}
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Before service</h2>
          <p className="mt-1 text-xs text-muted-foreground">One photo. Camera only.</p>
          <div className="mt-3">
            <PhotoSlot
              serviceId={id}
              assignmentId={(service as any)?.assignment_id ?? null}
              stage="before"
              angle="front"
              slotId="before"
              done={beforeDone}
              onUploaded={() => refetchPhotos()}
              label="Before photo"
              wide
              autoOpen={autoOpenBefore && !beforeDone}
              onAutoOpenConsumed={() => setAutoOpenBefore(false)}
            />
          </div>

          {/* After — 4 photos */}
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">After service</h2>
          <p className="mt-1 text-xs text-muted-foreground">4 angles. Camera only.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {AFTER_ANGLES.map((a) => (
              <PhotoSlot key={a} serviceId={id} assignmentId={(service as any)?.assignment_id ?? null} stage="after" angle={a} slotId={a} done={afterDone.has(a)} onUploaded={() => refetchPhotos()} label={a} />
            ))}
          </div>

          {/* Reports — inline sections (never modals) so PhotoSlots remain mounted
              across Android process kills, matching Before/After lifecycle. */}
          {service.status === "in_progress" && (
            <div className="mt-5 space-y-3">
              <UnavailableSection serviceId={id} assignmentId={(service as any)?.assignment_id ?? null} photos={photos ?? []} refetch={refetchPhotos} onDone={refreshAfterReport} />
              <DirtyVehicleSection serviceId={id} assignmentId={(service as any)?.assignment_id ?? null} photos={photos ?? []} refetch={refetchPhotos} onDone={refreshAfterReport} />
            </div>
          )}

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
  serviceId,
  assignmentId,
  workflow = "service_photo",
  stage,
  angle,
  slotId,
  done,
  onUploaded,
  onLocalCaptured,
  initialPath,
  label,
  wide,
  autoOpen,
  onAutoOpenConsumed,
  disabled,
}: {
  serviceId: string;
  assignmentId?: string | null;
  workflow?: "service_photo" | "dirty_vehicle" | "unavailable_vehicle";
  stage: "before" | "after" | "unavailable" | "dirty";
  angle: string;
  slotId?: string;
  done: boolean;
  onUploaded: (path?: string) => void;
  onLocalCaptured?: (path: string) => void;
  initialPath?: string | null;
  label: string;
  wide?: boolean;
  autoOpen?: boolean;
  onAutoOpenConsumed?: () => void;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [queuedPath, setQueuedPath] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try { return window.localStorage.getItem(`uw_photo_path:${serviceId}:${slotId ?? `${stage}_${angle}`}`); } catch { return null; }
  });
  const retryingRef = useRef(false);
  const slot = slotId ?? `${stage}_${angle}`;
  const queueKey = `${serviceId}:${slot}`;
  const pathKey = `uw_photo_path:${serviceId}:${slot}`;
  const busy = capturing || uploading;
  const visuallyDone = done || Boolean(initialPath) || Boolean(queuedPath);
  const tag =
    workflow === "unavailable_vehicle"
      ? "[SVC][UNAVAILABLE]"
      : workflow === "dirty_vehicle"
        ? "[SVC][DIRTY]"
        : "[SVC][PHOTO]";
  const errTag = `${tag}[ERROR]`;

  useEffect(() => {
    console.log(`${tag} PhotoSlot mounted · svc=${serviceId} · slot=${slot} · stage=${stage} · angle=${angle}`);
  }, [tag, serviceId, stage, angle, slot]);

  // Unified upload pipeline — identical for Before, After, Unavailable, and Dirty.
  // The only difference between workflows is the stage value written to service_photos
  // and the submit RPC called by the parent dialog. Camera, storage upload, DB write,
  // and slot-completion logic are identical.
  const uploadCapturedFile = async (file: File, startedAt = Date.now(), existingPath?: string | null) => {
    if (retryingRef.current) return;
    retryingRef.current = true;
    setUploading(true);
    console.log(`${tag} Upload started · svc=${serviceId} · slot=${slot} · size=${file.size}b`);
    let path = existingPath ?? queuedPath;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      let userId = sessionData.session?.user.id ?? null;
      if (!userId) {
        const { data: u } = await supabase.auth.getUser();
        userId = u.user?.id ?? null;
      }
      if (!userId) throw new Error("Please sign in again");
      path = path || `${userId}/${serviceId}/${stage}-${angle}-${Date.now()}.jpg`;
      setQueuedPath(path);
      try { window.localStorage.setItem(pathKey, path); } catch { /* keep going */ }
      onLocalCaptured?.(path);
      await saveQueuedPhoto(queueKey, file);

      const pos = await getPosition();

      let lastError: unknown = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("Offline");
          const { error } = await supabase.storage
            .from("service-photos")
            .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
          if (error) throw error;
          const { error: e2 } = await supabase
            .from("service_photos")
            .upsert(
              {
                service_id: serviceId,
                partner_id: userId,
                stage: stage as any,
                angle: angle as any,
                storage_path: path,
                lat: pos?.lat ?? null,
                lng: pos?.lng ?? null,
              },
              { onConflict: "service_id,stage,angle" },
            );
          if (e2) throw e2;
          lastError = null;
          break;
        } catch (attemptError) {
          lastError = attemptError;
          if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, attempt * 700));
        }
      }
      if (lastError) throw lastError;
      console.log(`${tag} Upload finished · svc=${serviceId} · slot=${slot} · path=${path} · gps=${pos ? `${pos.lat.toFixed(5)},${pos.lng.toFixed(5)}` : "MISSING"} · Δ${Date.now()-startedAt}ms`);
      await logApkEvidence({
        eventType: workflowEventName(workflow, "photo_upload_result"),
        serviceId,
        assignmentId,
        gps: pos,
        status: "success",
        payload: { stage, angle, slot, path, elapsed_ms: Date.now() - startedAt },
      });
      await deleteQueuedPhoto(queueKey);
      try { window.localStorage.removeItem(pathKey); } catch { /* noop */ }
      setQueuedPath(null);
      onUploaded(path);
      console.log(`${tag} Photo attached (${slot}) · svc=${serviceId}`);
    } catch (err) {
      await logApkEvidence({
        eventType: workflowEventName(workflow, "photo_upload_result"),
        serviceId,
        assignmentId,
        status: "error",
        payload: { slot, angle, ...evidenceError(err) },
      });
      console.error(`${errTag} Upload failed · slot=${slot} · ${(err as any)?.message ?? err}`);
      toast.error(typeof navigator !== "undefined" && navigator.onLine === false ? "Photo saved offline. It will retry automatically." : ((err as any)?.message ?? "Photo saved locally. Upload will retry."));
    } finally {
      setUploading(false);
      retryingRef.current = false;
    }
  };

  const openCamera = async () => {
    if (disabled || busy) return;
    const t0 = Date.now();
    console.log(`${tag} Capture requested (${slot}) · svc=${serviceId}`);
    setCapturing(true);
    let file: File | null = null;
    try {
      file = await captureFromCamera({ serviceId, assignmentId, workflow, stage: stage === "unavailable" || stage === "dirty" ? "report" : stage, angle, slot });
    } catch (err) {
      console.error(`${errTag} Camera failed · slot=${slot} · ${(err as any)?.message ?? err}`);
      toast.error(CAMERA_UNAVAILABLE_MESSAGE);
      return;
    } finally {
      setCapturing(false);
    }
    console.log(`${tag} Camera returned · svc=${serviceId} · slot=${slot} · file=${file ? `${file.size}b` : "null"}`);
    void logApkEvidence({
      eventType: workflowEventName(workflow, "camera_attempt"),
      serviceId,
      assignmentId,
      payload: { stage, angle, slot },
    });
    if (!file) {
      console.warn(`${errTag} Camera returned no file (cancelled/blocked) · slot=${slot}`);
      await logApkEvidence({ eventType: workflowEventName(workflow, "camera_result"), serviceId, assignmentId, status: "blocked", payload: { stage, angle, slot, cancelled: true } });
      toast.error(CAMERA_UNAVAILABLE_MESSAGE);
      return;
    }
    await logApkEvidence({ eventType: workflowEventName(workflow, "camera_result"), serviceId, assignmentId, status: "success", payload: { stage, angle, slot, size: file.size, type: file.type } });
    await uploadCapturedFile(file, t0);
  };

  useEffect(() => {
    if (done) {
      void deleteQueuedPhoto(queueKey);
      try { window.localStorage.removeItem(pathKey); } catch { /* noop */ }
      setQueuedPath(null);
      return;
    }
    let cancelled = false;
    const retryQueued = async () => {
      if (cancelled || retryingRef.current) return;
      let path: string | null = queuedPath;
      if (!path) {
        try { path = window.localStorage.getItem(pathKey); } catch { path = null; }
      }
      if (!path) return;
      const file = await loadQueuedPhoto(queueKey);
      if (cancelled || !file) return;
      await uploadCapturedFile(file, Date.now(), path);
    };
    void retryQueued();
    window.addEventListener("online", retryQueued);
    return () => {
      cancelled = true;
      window.removeEventListener("online", retryQueued);
    };
  }, [done, queueKey, pathKey, queuedPath]);

  useEffect(() => {
    if (done || busy) return;
    let cancelled = false;
    void (async () => {
      const restored = await consumeRestoredCameraCapture({ slot });
      if (cancelled || !restored) return;
      void logApkEvidence({ eventType: workflowEventName(workflow, "camera_result"), serviceId, assignmentId, status: "success", payload: { stage, angle, slot, restored: true, size: restored.size, type: restored.type } });
      void uploadCapturedFile(restored);
    })();
    return () => { cancelled = true; };
  }, [done, busy, slot, workflow, serviceId, assignmentId, stage, angle]);

  useEffect(() => {
    if (!autoOpen || done || busy) return;
    onAutoOpenConsumed?.();
    const timer = window.setTimeout(() => void openCamera(), 250);
    return () => window.clearTimeout(timer);
  }, [autoOpen, done, busy]);

  return (
    <button
      onClick={openCamera}
      disabled={disabled || busy}
      className={`flex ${wide ? "aspect-[3/1]" : "aspect-square"} flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-xs font-medium capitalize transition ${
        visuallyDone
          ? "border-[color:var(--success)] bg-[color:var(--success)]/10 text-[color:var(--success)]"
          : "border-border text-muted-foreground hover:border-primary hover:text-primary"
      }`}
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : visuallyDone ? <Check className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
      {busy ? "Uploading…" : visuallyDone ? "✓ Captured" : label}
    </button>
  );
}



// ------------------------------------------------------------------
// UnavailableDialog + DirtyVehicleDialog share the exact same capture
// pipeline as Before/After: they render <PhotoSlot />, which writes to
// service_photos + storage. Slot completion is derived from the shared
// `photos` prop (fetched by the parent). No custom capture handlers,
// no custom upload helpers, no local photo arrays. Only the RPC differs.
// ------------------------------------------------------------------

type ServicePhotoRow = { angle: string; stage: string; storage_path: string };

const UNAVAILABLE_ANGLES = ["front", "rear"] as const;
const UNAVAILABLE_REQUIRED = 2;
const DIRTY_ANGLES = ["front", "rear", "left", "right"] as const;

function pickPhotoPaths(photos: ServicePhotoRow[], stage: string, angles: readonly string[]): string[] {
  return angles
    .map((a) => photos.find((p) => p.stage === stage && p.angle === a)?.storage_path)
    .filter((p): p is string => Boolean(p));
}

function reportDraftKey(serviceId: string, workflow: "dirty" | "unavailable") {
  return `uw_report_draft:${workflow}:${serviceId}`;
}

function readReportDraft(serviceId: string, workflow: "dirty" | "unavailable") {
  if (typeof window === "undefined") return { reason: "", notes: "", paths: {} as Record<string, string> };
  try {
    const raw = window.localStorage.getItem(reportDraftKey(serviceId, workflow));
    if (!raw) return { reason: "", notes: "", paths: {} as Record<string, string> };
    const parsed = JSON.parse(raw) as { reason?: string; notes?: string; paths?: Record<string, string> };
    return { reason: parsed.reason ?? "", notes: parsed.notes ?? "", paths: parsed.paths ?? {} };
  } catch {
    return { reason: "", notes: "", paths: {} as Record<string, string> };
  }
}

function writeReportDraft(serviceId: string, workflow: "dirty" | "unavailable", draft: { reason: string; notes: string; paths: Record<string, string> }) {
  if (typeof window === "undefined") return;
  try {
    if (!draft.reason && !draft.notes && Object.keys(draft.paths).length === 0) {
      window.localStorage.removeItem(reportDraftKey(serviceId, workflow));
      return;
    }
    window.localStorage.setItem(reportDraftKey(serviceId, workflow), JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch { /* noop */ }
}

function clearReportDraft(serviceId: string, workflow: "dirty" | "unavailable") {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(reportDraftKey(serviceId, workflow)); } catch { /* noop */ }
}

function submitQueueKey(serviceId: string, workflow: "dirty" | "unavailable") {
  return `uw_report_submit_queued:${workflow}:${serviceId}`;
}

function readSubmitQueued(serviceId: string, workflow: "dirty" | "unavailable") {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(submitQueueKey(serviceId, workflow)) === "1"; } catch { return false; }
}

function writeSubmitQueued(serviceId: string, workflow: "dirty" | "unavailable", queued: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (queued) window.localStorage.setItem(submitQueueKey(serviceId, workflow), "1");
    else window.localStorage.removeItem(submitQueueKey(serviceId, workflow));
  } catch { /* noop */ }
}

// ------------------------------------------------------------------
// Inline sections (NOT modals). Rendered directly into the service
// screen so their PhotoSlots remain mounted for the entire in_progress
// lifecycle — identical to Before/After. When Android kills the
// WebView while the native camera is foreground and the app cold-
// remounts, the same PhotoSlot re-mounts on this page and its
// consumeRestoredCameraCapture effect attaches the restored photo,
// with zero special dialog-reopen plumbing.
//
// The expand/collapse toggle uses `hidden` (CSS display:none) rather
// than conditional rendering, so PhotoSlots stay in the tree even when
// the panel is visually collapsed.
// ------------------------------------------------------------------

function UnavailableSection({
  serviceId,
  assignmentId,
  photos,
  refetch,
  onDone,
}: {
  serviceId: string;
  assignmentId?: string | null;
  photos: ServicePhotoRow[];
  refetch: () => void;
  onDone: () => void;
}) {
  const initialDraftRef = useRef(readReportDraft(serviceId, "unavailable"));
  const [expanded, setExpanded] = useState(() => Boolean(initialDraftRef.current.reason || initialDraftRef.current.notes || Object.keys(initialDraftRef.current.paths).length));
  const [reason, setReason] = useState<string>(() => initialDraftRef.current.reason);
  const [notes, setNotes] = useState(() => initialDraftRef.current.notes);
  const [draftPaths, setDraftPaths] = useState<Record<string, string>>(() => initialDraftRef.current.paths);
  const [saving, setSaving] = useState(false);
  const [submitQueued, setSubmitQueued] = useState(() => readSubmitQueued(serviceId, "unavailable"));
  const submitInFlightRef = useRef(false);
  const qc = useQueryClient();

  const needsRemarks = reason === "other";
  const capturedPaths = pickPhotoPaths(photos, "unavailable", UNAVAILABLE_ANGLES);
  const capturedCount = capturedPaths.length;
  const visibleCount = new Set([...capturedPaths, ...Object.values(draftPaths)]).size;
  const canSubmit = !!reason && capturedCount >= UNAVAILABLE_REQUIRED && (!needsRemarks || notes.trim().length > 0);

  useEffect(() => {
    writeReportDraft(serviceId, "unavailable", { reason, notes, paths: draftPaths });
  }, [serviceId, reason, notes, draftPaths]);

  // Auto-expand as soon as a captured photo lands (covers the case where
  // Android killed the WebView during camera and remounted this page —
  // the restored capture writes a row via PhotoSlot's mount effect, and
  // we re-open the panel so the partner sees the ✓ + Submit button).
  useEffect(() => {
    if (visibleCount > 0 && !expanded) setExpanded(true);
  }, [visibleCount, expanded]);

  // debug flow-version instrumentation removed for trial release


  useEffect(() => {
    if (canSubmit) console.log(`[SVC][UNAVAILABLE] Submit enabled · svc=${serviceId} · photos=${capturedCount}/${UNAVAILABLE_REQUIRED}`);
  }, [serviceId, canSubmit, capturedCount]);

  const submit = async () => {
    if (submitInFlightRef.current) return;
    if (!reason) return toast.error("Pick a reason");
    if (capturedPaths.length < UNAVAILABLE_REQUIRED) {
      writeSubmitQueued(serviceId, "unavailable", true);
      setSubmitQueued(true);
      return toast.message("Report queued. It will submit after photos finish uploading.");
    }
    if (needsRemarks && !notes.trim()) return toast.error("Remarks are required for 'Other'");
    console.log(`[SVC][UNAVAILABLE] Submit pressed · svc=${serviceId} · photos=${capturedPaths.length} · reason=${reason}`);
    submitInFlightRef.current = true;
    setSaving(true);
    let pos: { lat: number; lng: number } | null = null;
    const rpcStart = Date.now();
    try {
      pos = await getPosition();
      await logApkEvidence({
        eventType: "unavailable_submit_attempt",
        serviceId,
        assignmentId,
        gps: pos,
        payload: { reason, photo_count: capturedPaths.length, has_notes: Boolean(notes.trim()) },
      });
      console.log(`[SVC][UNAVAILABLE] RPC started · submit_service_unavailable · svc=${serviceId}`);
      const { data, error } = await supabase.rpc("submit_service_unavailable", {
        p_service_id: serviceId,
        p_reason: reason,
        p_notes: notes || "",
        p_photos: capturedPaths,
        p_lat: pos?.lat ?? null,
        p_lng: pos?.lng ?? null,
      } as any);
      if (error) throw error;
      const r: any = data ?? {};
      console.log(`[SVC][UNAVAILABLE] RPC completed · svc=${serviceId} · Δ${Date.now()-rpcStart}ms · response=`, data);
      if (r.report_id) console.log(`[SVC][UNAVAILABLE] Report created: ${r.report_id} · svc=${serviceId}`);
      if (r.wallet_entry_id) console.log(`[SVC][UNAVAILABLE] Wallet entry: ${r.wallet_entry_id} · svc=${serviceId}`);
      await logApkEvidence({
        eventType: "unavailable_submit_result",
        serviceId,
        assignmentId,
        gps: pos,
        status: "success",
        payload: { rpc: data },
      });
      const creditedAmount = Number(r.credit_amount ?? COMPENSATION);
      console.log(`[SVC][UNAVAILABLE] Wallet updated (+₹${creditedAmount}) · svc=${serviceId}`);
      toast.success(`Marked unavailable · ₹${creditedAmount} credited`);
      qc.setQueryData(["service", serviceId], (current: any) => current ? { ...current, status: "unavailable", unavailable_reason: reason, unavailable_notes: notes || null } : current);
      qc.invalidateQueries({ queryKey: ["service", serviceId] });
      qc.invalidateQueries({ queryKey: ["service-photos", serviceId] });
      qc.invalidateQueries({ queryKey: ["route-today"] });
      qc.invalidateQueries({ queryKey: ["active-assignment-summary"] });
      qc.invalidateQueries({ queryKey: ["today-services-mini"] });
      qc.invalidateQueries({ queryKey: ["earnings-v3"] });
      qc.invalidateQueries({ queryKey: ["wallet-balance"] });
      console.log(`[SVC][UNAVAILABLE] Route advanced · queries invalidated · svc=${serviceId}`);
      setReason("");
      setNotes("");
      setDraftPaths({});
      clearReportDraft(serviceId, "unavailable");
      writeSubmitQueued(serviceId, "unavailable", false);
      setSubmitQueued(false);
      onDone();
    } catch (error: any) {
      await logApkEvidence({ eventType: "unavailable_submit_result", serviceId, assignmentId, gps: pos, status: "error", payload: evidenceError(error) });
      console.error(`[SVC][UNAVAILABLE][ERROR] Submit failed · svc=${serviceId} · ${error?.message ?? error}`);
      toast.error(error?.message ?? "Could not submit unavailable report");
    } finally {
      submitInFlightRef.current = false;
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!submitQueued || saving || !canSubmit) return;
    void submit();
  }, [submitQueued, saving, canSubmit]);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => {
          const next = !expanded;
          if (next) console.log(`[SVC][UNAVAILABLE] Section opened · svc=${serviceId}`);
          setExpanded(next);
        }}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <XCircle className="h-4 w-4" /> Mark unavailable
          {visibleCount > 0 && <span className="text-xs text-muted-foreground">· {capturedCount}/{UNAVAILABLE_REQUIRED} uploaded</span>}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {/* Body stays MOUNTED even when collapsed (CSS hidden) so the
          PhotoSlots survive Android process kill/remount cycles. */}
      <div className={expanded ? "border-t border-border p-4" : "hidden"}>
        <p className="mt-1 text-xs text-muted-foreground">Pick a reason and capture {UNAVAILABLE_REQUIRED} live proof photos.</p>
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
            Live evidence photos ({capturedCount}/{UNAVAILABLE_REQUIRED} uploaded)
          </p>
          <div className="grid grid-cols-2 gap-2">
            {UNAVAILABLE_ANGLES.map((angle, index) => {
              const done = photos.some((p) => p.stage === "unavailable" && p.angle === angle);
              return (
                <PhotoSlot
                  key={angle}
                  serviceId={serviceId}
                  assignmentId={assignmentId}
                  workflow="unavailable_vehicle"
                  stage="unavailable"
                  angle={angle}
                  slotId={`unavailable_${angle}`}
                  done={done}
                  initialPath={draftPaths[angle]}
                  onLocalCaptured={(path) => setDraftPaths((current) => ({ ...current, [angle]: path }))}
                  onUploaded={() => {
                    refetch();
                  }}
                  label={`Photo ${index + 1}`}
                  disabled={saving}
                />
              );
            })}
          </div>
        </div>

        <Textarea
          placeholder={needsRemarks ? "Remarks (required for Other)…" : "Optional notes for support…"}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-3"
        />
        <Button className="mt-3 w-full" onClick={submit} disabled={saving || !reason || (needsRemarks && !notes.trim())}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {submitQueued && !canSubmit ? "Queued until uploads finish" : `Submit · ₹${COMPENSATION}`}
        </Button>
      </div>
    </Card>
  );
}

function DirtyVehicleSection({
  serviceId,
  assignmentId,
  photos,
  refetch,
  onDone,
}: {
  serviceId: string;
  assignmentId?: string | null;
  photos: ServicePhotoRow[];
  refetch: () => void;
  onDone?: () => void;
}) {
  const initialDraftRef = useRef(readReportDraft(serviceId, "dirty"));
  const [expanded, setExpanded] = useState(() => Boolean(initialDraftRef.current.reason || initialDraftRef.current.notes || Object.keys(initialDraftRef.current.paths).length));
  const [reason, setReason] = useState(() => initialDraftRef.current.reason);
  const [notes, setNotes] = useState(() => initialDraftRef.current.notes);
  const [draftPaths, setDraftPaths] = useState<Record<string, string>>(() => initialDraftRef.current.paths);
  const [saving, setSaving] = useState(false);
  const [submitQueued, setSubmitQueued] = useState(() => readSubmitQueued(serviceId, "dirty"));
  const submitInFlightRef = useRef(false);
  const qc = useQueryClient();

  const capturedPaths = pickPhotoPaths(photos, "dirty", DIRTY_ANGLES);
  const capturedCount = capturedPaths.length;
  const visibleCount = new Set([...capturedPaths, ...Object.values(draftPaths)]).size;
  const allDone = capturedCount === DIRTY_ANGLES.length;
  const dirtyCanSubmit = !!reason && allDone && !(reason === "Other" && !notes.trim());

  useEffect(() => {
    writeReportDraft(serviceId, "dirty", { reason, notes, paths: draftPaths });
  }, [serviceId, reason, notes, draftPaths]);

  useEffect(() => {
    if (visibleCount > 0 && !expanded) setExpanded(true);
  }, [visibleCount, expanded]);

  // debug flow-version instrumentation removed for trial release


  useEffect(() => {
    if (dirtyCanSubmit) console.log(`[SVC][DIRTY] Submit enabled · svc=${serviceId} · photos=${capturedCount}/${DIRTY_ANGLES.length}`);
  }, [serviceId, dirtyCanSubmit, capturedCount]);

  const submit = async () => {
    if (submitInFlightRef.current) return;
    if (!reason) return toast.error("Pick a reason");
    if (reason === "Other" && !notes.trim()) return toast.error("Remarks are required for 'Other'");
    if (!allDone) {
      writeSubmitQueued(serviceId, "dirty", true);
      setSubmitQueued(true);
      return toast.message("Report queued. It will submit after photos finish uploading.");
    }
    console.log(`[SVC][DIRTY] Submit pressed · svc=${serviceId} · photos=4 · reason=${reason}`);
    submitInFlightRef.current = true;
    setSaving(true);
    let pos: { lat: number; lng: number } | null = null;
    const rpcStart = Date.now();
    try {
      pos = await getPosition();
      await logApkEvidence({
        eventType: "dirty_submit_attempt",
        serviceId,
        assignmentId,
        gps: pos,
        payload: { reason, photo_count: capturedPaths.length, has_notes: Boolean(notes.trim()) },
      });
      console.log(`[SVC][DIRTY] RPC started · submit_service_unavailable(dirty_vehicle) · svc=${serviceId}`);
      const { data, error: e2 } = await supabase.rpc("submit_service_unavailable", {
        p_service_id: serviceId,
        p_reason: "dirty_vehicle",
        p_notes: `${reason}${notes ? ` · ${notes}` : ""}`,
        p_photos: capturedPaths,
        p_lat: pos?.lat ?? null,
        p_lng: pos?.lng ?? null,
      } as any);
      if (e2) throw e2;
      const r: any = data ?? {};
      console.log(`[SVC][DIRTY] RPC completed · svc=${serviceId} · Δ${Date.now()-rpcStart}ms · response=`, data);
      if (r.report_id) console.log(`[SVC][DIRTY] Report created: ${r.report_id} · svc=${serviceId}`);
      if (r.wallet_entry_id) console.log(`[SVC][DIRTY] Wallet entry: ${r.wallet_entry_id} · svc=${serviceId}`);
      await logApkEvidence({
        eventType: "dirty_submit_result",
        serviceId,
        assignmentId,
        gps: pos,
        status: "success",
        payload: { rpc: data },
      });
      const creditedAmount = Number(r.credit_amount ?? COMPENSATION);
      console.log(`[SVC][DIRTY] Wallet updated (+₹${creditedAmount}) · svc=${serviceId}`);
      toast.success(`Dirty vehicle reported · ₹${creditedAmount} credited`);
      qc.setQueryData(["service", serviceId], (current: any) => current ? { ...current, status: "unavailable", unavailable_reason: "dirty_vehicle", unavailable_notes: `${reason}${notes ? ` · ${notes}` : ""}` } : current);
      qc.invalidateQueries({ queryKey: ["service", serviceId] });
      qc.invalidateQueries({ queryKey: ["service-photos", serviceId] });
      qc.invalidateQueries({ queryKey: ["route-today"] });
      qc.invalidateQueries({ queryKey: ["active-assignment-summary"] });
      qc.invalidateQueries({ queryKey: ["today-services-mini"] });
      qc.invalidateQueries({ queryKey: ["earnings-v3"] });
      qc.invalidateQueries({ queryKey: ["wallet-balance"] });
      console.log(`[SVC][DIRTY] Route advanced · queries invalidated · svc=${serviceId}`);
      setReason("");
      setNotes("");
      setDraftPaths({});
      clearReportDraft(serviceId, "dirty");
      writeSubmitQueued(serviceId, "dirty", false);
      setSubmitQueued(false);
      void onDone?.();
    } catch (error: any) {
      await logApkEvidence({ eventType: "dirty_submit_result", serviceId, assignmentId, gps: pos, status: "error", payload: evidenceError(error) });
      console.error(`[SVC][DIRTY][ERROR] Submit failed · svc=${serviceId} · ${error?.message ?? error}`);
      toast.error(error?.message ?? "Could not submit dirty vehicle report");
    } finally {
      submitInFlightRef.current = false;
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!submitQueued || saving || !dirtyCanSubmit) return;
    void submit();
  }, [submitQueued, saving, dirtyCanSubmit]);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => {
          const next = !expanded;
          if (next) console.log(`[SVC][DIRTY] Section opened · svc=${serviceId}`);
          setExpanded(next);
        }}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4" /> Report dirty vehicle
          {visibleCount > 0 && <span className="text-xs text-muted-foreground">· {capturedCount}/{DIRTY_ANGLES.length} uploaded</span>}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      <div className={expanded ? "border-t border-border p-4" : "hidden"}>
        <RadioGroup value={reason} onValueChange={setReason} className="mt-1 space-y-1">
          {DIRTY_REASONS.map((r) => (
            <Label key={r} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-2.5 text-sm">
              <RadioGroupItem value={r} />{r}
            </Label>
          ))}
        </RadioGroup>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {DIRTY_ANGLES.map((angle) => {
            const done = photos.some((p) => p.stage === "dirty" && p.angle === angle);
            return (
              <PhotoSlot
                key={angle}
                serviceId={serviceId}
                assignmentId={assignmentId}
                workflow="dirty_vehicle"
                stage="dirty"
                angle={angle}
                slotId={`dirty_${angle}`}
                done={done}
                initialPath={draftPaths[angle]}
                onLocalCaptured={(path) => setDraftPaths((current) => ({ ...current, [angle]: path }))}
                onUploaded={() => {
                  refetch();
                }}
                label={angle}
                disabled={saving}
              />
            );
          })}
        </div>
        <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-3" />
        <Button className="mt-3 w-full" onClick={submit} disabled={saving || !reason || (reason === "Other" && !notes.trim())}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{submitQueued && !dirtyCanSubmit ? "Queued until uploads finish" : "Submit report"}
        </Button>
      </div>
    </Card>
  );
}



async function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return getCurrentGps({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}

