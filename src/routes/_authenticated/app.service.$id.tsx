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
import { ArrowLeft, Camera, Check, Loader2, Navigation, XCircle, AlertTriangle, Clock, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { OfflineGuard } from "@/components/OfflineGuard";
import { MaskedCallButton } from "./app.live";
import { formatTime12 } from "@/lib/format";
import { VehicleImage } from "@/components/VehicleImage";
import { openGoogleMapsDirections, validateExactGps } from "@/lib/gps";
import { CAMERA_UNAVAILABLE_MESSAGE, captureFromCamera, consumeRestoredCameraCapture } from "@/lib/camera";
import { getCurrentGps } from "@/lib/native";
import { evidenceError, logApkEvidence } from "@/lib/apkEvidence";


const AFTER_ANGLES = ["front", "rear", "left", "right"] as const;
type Angle = (typeof AFTER_ANGLES)[number];
const REPORT_ANGLES = ["front", "rear", "left", "right"] as const;

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
          <UnavailableDialog serviceId={id} assignmentId={(service as any)?.assignment_id ?? null} onDone={refreshAfterReport} />
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

          {/* Reports */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            {service.status === "in_progress" && <UnavailableDialog serviceId={id} assignmentId={(service as any)?.assignment_id ?? null} onDone={refreshAfterReport} />}
            {service.status === "in_progress" && <DirtyVehicleDialog serviceId={id} assignmentId={(service as any)?.assignment_id ?? null} onDone={refreshAfterReport} />}
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
  serviceId,
  assignmentId,
  workflow = "service_photo",
  stage,
  angle,
  slotId,
  done,
  onUploaded,
  label,
  wide,
  autoOpen,
  onAutoOpenConsumed,
  disabled,
}: {
  serviceId: string;
  assignmentId?: string | null;
  workflow?: "service_photo" | "dirty_vehicle" | "unavailable_vehicle";
  stage: "before" | "after" | "report";
  angle: string;
  slotId?: string;
  done: boolean;
  onUploaded: (path?: string) => void;
  label: string;
  wide?: boolean;
  autoOpen?: boolean;
  onAutoOpenConsumed?: () => void;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const slot = slotId ?? `${stage}_${angle}`;
  const busy = capturing || uploading;

  const uploadCapturedFile = async (file: File, startedAt = Date.now()) => {
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Please sign in again");

      if (workflow !== "service_photo") {
        const path = await uploadEvidencePhotoPath({ userId: u.user.id, serviceId, prefix: `${workflow}-${slot}`, file });
        console.log(`[SVC ${serviceId}] REPORT PHOTO ok · ${workflow}/${slot} · size=${file.size}b · Δ${Date.now()-startedAt}ms`);
        await logApkEvidence({
          eventType: workflowEventName(workflow, "photo_upload_result"),
          serviceId,
          assignmentId,
          status: "success",
          payload: { slot, angle, path, elapsed_ms: Date.now() - startedAt, size: file.size, type: file.type },
        });
        onUploaded(path);
        return;
      }

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
      console.log(`[SVC ${serviceId}] PHOTO ok · ${stage}/${angle} · gps=${pos ? `${pos.lat.toFixed(5)},${pos.lng.toFixed(5)}` : "MISSING"} · size=${file.size}b · Δ${Date.now()-startedAt}ms`);
      await logApkEvidence({ eventType: "service_photo_upload_result", serviceId, assignmentId, gps: pos, status: "success", payload: { stage, angle, slot, path, elapsed_ms: Date.now() - startedAt } });
      onUploaded(path);
    } catch (err) {
      if (workflow !== "service_photo") {
        await logApkEvidence({ eventType: workflowEventName(workflow, "photo_upload_result"), serviceId, assignmentId, status: "error", payload: { slot, angle, ...evidenceError(err) } });
      }
      toast.error((err as any)?.message ?? "Could not save photo");
    } finally {
      setUploading(false);
    }
  };

  const openCamera = async () => {
    if (disabled || busy) return;
    const t0 = Date.now();
    console.log(`[SVC ${serviceId}] PHOTO capture start · ${workflow}/${slot}`);
    const capturePromise = captureFromCamera({ serviceId, assignmentId, workflow, stage, angle, slot });
    setCapturing(true);
    const file = await capturePromise.finally(() => setCapturing(false));
    void logApkEvidence({
      eventType: workflowEventName(workflow, "camera_attempt"),
      serviceId,
      assignmentId,
      payload: { stage, angle, slot },
    });
    if (!file) {
      console.log(`[SVC ${serviceId}] PHOTO cancelled · ${workflow}/${slot}`);
      await logApkEvidence({ eventType: workflowEventName(workflow, "camera_result"), serviceId, assignmentId, status: "blocked", payload: { stage, angle, slot, cancelled: true } });
      toast.error(CAMERA_UNAVAILABLE_MESSAGE);
      return;
    }
    await logApkEvidence({ eventType: workflowEventName(workflow, "camera_result"), serviceId, assignmentId, status: "success", payload: { stage, angle, slot, size: file.size, type: file.type } });
    await uploadCapturedFile(file, t0);
  };

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
        done
          ? "border-[color:var(--success)] bg-[color:var(--success)]/10 text-[color:var(--success)]"
          : "border-border text-muted-foreground hover:border-primary hover:text-primary"
      }`}
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : done ? <Check className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
      {done ? "✓ Captured" : label}
    </button>
  );
}



function UnavailableDialog({ serviceId, assignmentId, onDone }: { serviceId: string; assignmentId?: string | null; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const MIN_PHOTOS = 2;
  const needsRemarks = reason === "other";
  const capturedCount = UNAVAILABLE_SLOTS.filter((slot) => Boolean(photos[slot])).length;
  const canSubmit =
    !!reason &&
    capturedCount >= MIN_PHOTOS &&
    (!needsRemarks || notes.trim().length > 0);

  const storePhoto = (slot: string, path?: string) => {
    if (!path) return;
    setPhotos((previous) => ({ ...previous, [slot]: path }));
  };

  const removePhoto = (slot: string) => setPhotos((previous) => {
    const next = { ...previous };
    delete next[slot];
    return next;
  });

  const submit = async () => {
    if (!reason) return toast.error("Pick a reason");
    const photoList = UNAVAILABLE_SLOTS.map((slot) => photos[slot]).filter(Boolean);
    if (photoList.length < MIN_PHOTOS) return toast.error(`Capture at least ${MIN_PHOTOS} photos`);
    if (needsRemarks && !notes.trim()) return toast.error("Remarks are required for 'Other'");
    setSaving(true);
    let pos: { lat: number; lng: number } | null = null;
    try {
      pos = await getPosition();
      await logApkEvidence({
        eventType: "unavailable_submit_attempt",
        serviceId,
        assignmentId,
        gps: pos,
        payload: { reason, photo_count: photoList.length, has_notes: Boolean(notes.trim()) },
      });
      const { data, error } = await supabase.rpc("submit_service_unavailable", {
        p_service_id: serviceId,
        p_reason: reason,
        p_notes: notes || "",
        p_photos: photoList,
        p_lat: pos?.lat ?? null,
        p_lng: pos?.lng ?? null,
      } as any);
      if (error) throw error;
      console.log(`[SVC ${serviceId}] UNAVAILABLE submit_service_unavailable response`, data);
      await logApkEvidence({
        eventType: "unavailable_submit_result",
        serviceId,
        assignmentId,
        gps: pos,
        status: "success",
        payload: { rpc: data },
      });
      toast.success(`Marked unavailable · ₹${(data as any)?.credited ?? 12} credited`);
      qc.invalidateQueries({ queryKey: ["service", serviceId] });
      qc.invalidateQueries({ queryKey: ["route-today"] });
      qc.invalidateQueries({ queryKey: ["active-assignment-summary"] });
      qc.invalidateQueries({ queryKey: ["today-services-mini"] });
      qc.invalidateQueries({ queryKey: ["earnings-v3"] });
      qc.invalidateQueries({ queryKey: ["wallet-balance"] });
      setReason("");
      setNotes("");
      setPhotos({});
      setOpen(false);
      onDone();
    } catch (error: any) {
      await logApkEvidence({ eventType: "unavailable_submit_result", serviceId, assignmentId, gps: pos, status: "error", payload: evidenceError(error) });
      toast.error(error?.message ?? "Could not submit unavailable report");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && saving) return;
        setOpen(value);
      }}
    >
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
            Live evidence photos ({capturedCount}/{MIN_PHOTOS} required)
          </p>
          <div className="grid grid-cols-2 gap-2">
            {UNAVAILABLE_SLOTS.map((slot, index) => (
              <div key={slot} className="relative">
                <PhotoSlot
                  serviceId={serviceId}
                  assignmentId={assignmentId}
                  workflow="unavailable_vehicle"
                  stage="report"
                  angle={slot}
                  slotId={slot}
                  done={Boolean(photos[slot])}
                  onUploaded={(path) => storePhoto(slot, path)}
                  label={`Photo ${index + 1}`}
                  disabled={saving}
                />
                {photos[slot] && (
                  <button
                    type="button"
                    onClick={() => removePhoto(slot)}
                    className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-muted-foreground"
                    aria-label={`Remove photo ${index + 1}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <Textarea
          placeholder={needsRemarks ? "Remarks (required for Other)…" : "Optional notes for support…"}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-3"
        />
        <DialogFooter>
          <Button onClick={submit} disabled={saving || !canSubmit}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit · ₹{COMPENSATION}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



function DirtyVehicleDialog({ serviceId, assignmentId, onDone }: { serviceId: string; assignmentId?: string | null; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const dirtyCanSubmit =
    !!reason &&
    REPORT_ANGLES.every((slot) => Boolean(photos[slot])) &&
    !(reason === "Other" && !notes.trim());

  const storePhoto = (slot: string, path?: string) => {
    if (!path) return;
    setPhotos((previous) => ({ ...previous, [slot]: path }));
  };

  const submit = async () => {
    if (!reason) return toast.error("Pick a reason");
    if (reason === "Other" && !notes.trim()) return toast.error("Remarks are required for 'Other'");
    if (!photos.front || !photos.rear || !photos.left || !photos.right) return toast.error("All 4 photos required");
    setSaving(true);
    let pos: { lat: number; lng: number } | null = null;
    try {
      pos = await getPosition();
      await logApkEvidence({
        eventType: "dirty_submit_attempt",
        serviceId,
        assignmentId,
        gps: pos,
        payload: { reason, photo_count: REPORT_ANGLES.filter((slot) => Boolean(photos[slot])).length, has_notes: Boolean(notes.trim()) },
      });
      const { data, error: e2 } = await supabase.rpc("submit_service_unavailable", {
        p_service_id: serviceId,
        p_reason: "dirty_vehicle",
        p_notes: `${reason}${notes ? ` · ${notes}` : ""}`,
        p_photos: [photos.front, photos.rear, photos.left, photos.right],
        p_lat: pos?.lat ?? null,
        p_lng: pos?.lng ?? null,
      } as any);
      if (e2) throw e2;
      console.log(`[SVC ${serviceId}] DIRTY submit_service_unavailable response`, data);
      await logApkEvidence({
        eventType: "dirty_submit_result",
        serviceId,
        assignmentId,
        gps: pos,
        status: "success",
        payload: { rpc: data },
      });
      toast.success(`Dirty vehicle reported · ₹${(data as any)?.credited ?? COMPENSATION} credited`);
      qc.invalidateQueries({ queryKey: ["service", serviceId] });
      qc.invalidateQueries({ queryKey: ["route-today"] });
      qc.invalidateQueries({ queryKey: ["active-assignment-summary"] });
      qc.invalidateQueries({ queryKey: ["today-services-mini"] });
      qc.invalidateQueries({ queryKey: ["earnings-v3"] });
      qc.invalidateQueries({ queryKey: ["wallet-balance"] });
      setReason("");
      setNotes("");
      setPhotos({});
      setOpen(false);
      void onDone?.();
    } catch (error: any) {
      await logApkEvidence({ eventType: "dirty_submit_result", serviceId, assignmentId, gps: pos, status: "error", payload: evidenceError(error) });
      toast.error(error?.message ?? "Could not submit dirty vehicle report");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && saving) return;
        setOpen(value);
      }}
    >
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
          {REPORT_ANGLES.map((slot) => (
            <PhotoSlot
              key={slot}
              serviceId={serviceId}
              assignmentId={assignmentId}
              workflow="dirty_vehicle"
              stage="report"
              angle={slot}
              slotId={slot}
              done={Boolean(photos[slot])}
              onUploaded={(path) => storePhoto(slot, path)}
              label={slot}
              disabled={saving}
            />
          ))}
        </div>
        <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-3" />
        <DialogFooter>
          <Button onClick={submit} disabled={saving || !dirtyCanSubmit}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


async function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return getCurrentGps({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}

async function uploadEvidencePhotoPath({ userId, serviceId, prefix, file }: { userId: string; serviceId: string; prefix: string; file: File }) {
  const path = `${userId}/${serviceId}/${prefix}-${Date.now()}.jpg`;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { error } = await supabase.storage.from("service-photos").upload(path, file, { upsert: true, contentType: file.type });
    if (!error) return path;
    lastError = error;
    await new Promise((resolve) => window.setTimeout(resolve, attempt * 350));
  }
  throw lastError;
}
