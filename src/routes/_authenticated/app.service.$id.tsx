import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Camera, Check, ChevronDown, Loader2, Navigation, XCircle, AlertTriangle, Clock, User, Car, IdCard, MapPin, ZoomIn, Play, CarFront, PhoneOff, SkipForward, Pencil } from "lucide-react";
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
import { ServiceCelebration } from "@/components/partner/ServiceCelebration";


const AFTER_ANGLES = ["front", "rear", "left", "right"] as const;
type Angle = (typeof AFTER_ANGLES)[number];
const REPORT_ANGLES = ["front", "rear", "left", "right"] as const;

const UNAVAILABLE_REASONS = [
  { value: "vehicle_not_available", label: "Vehicle unavailable", icon: CarFront },
  { value: "customer_not_responding", label: "Customer not responding", icon: PhoneOff },
  { value: "customer_asked_to_skip", label: "Skip requested", icon: SkipForward },
  { value: "other", label: "Other (remarks required)", icon: Pencil },
] as const;

const DIRTY_REASONS = [
  "Heavy Mud",
  "Heavy Dust",
  "Bird Droppings",
  "Tree Sap",
  "Other",
];

const NOTE_CHIPS = [
  "Parking issue",
  "Customer unavailable",
  "Scratch found",
  "Extra dirty",
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
  const activeStepRef = useRef<HTMLDivElement | null>(null);

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

  const { data: routeProgress } = useQuery({
    queryKey: ["service-route-progress", id],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("services")
        .select("id,status,manual_sequence_no,sequence_no,eta_at,customers(full_name)")
        .eq("partner_id", u.user!.id)
        .eq("scheduled_date", today)
        .order("manual_sequence_no", { ascending: true, nullsFirst: false })
        .order("sequence_no", { ascending: true, nullsFirst: false })
        .order("eta_at", { ascending: true, nullsFirst: false });
      const rows = data ?? [];
      const total = rows.length;
      const completed = rows.filter((r: any) => r.status === "completed" || r.status === "unavailable").length;
      const idx = rows.findIndex((r: any) => r.id === id);
      const position = idx >= 0 ? idx + 1 : Math.min(completed + 1, total || 1);
      const nextRow = idx >= 0 ? rows.slice(idx + 1).find((r: any) => r.status === "pending" || r.status === "in_progress") : null;
      const nextName = (nextRow as any)?.customers?.full_name ?? null;
      return { total: total || 1, position, completed, nextName };
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
  const totalDone = (beforeDone ? 1 : 0) + afterDone.size;

  // Auto-scroll active step into view whenever progress changes.
  useEffect(() => {
    if (service?.status !== "in_progress") return;
    const el = activeStepRef.current;
    if (!el) return;
    const t = window.setTimeout(() => {
      try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { /* noop */ }
    }, 250);
    return () => window.clearTimeout(t);
  }, [totalDone, service?.status]);




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
  const [photoOpen, setPhotoOpen] = useState(false);

  const timeLabel = formatTime12(c?.service_required_before ?? c?.preferred_time);
  const status = service?.status ?? "pending";
  const statusStyle =
    status === "completed"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
      : status === "in_progress"
        ? "border-blue-500/40 bg-blue-500/10 text-blue-700"
        : status === "unavailable"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-primary/40 bg-primary/10 text-primary";
  const statusLabel = status === "in_progress" ? "In progress" : status === "completed" ? "Completed" : status === "unavailable" ? "Unavailable" : "Pending";

  const total = routeProgress?.total ?? 1;
  const position = routeProgress?.position ?? 1;
  const progressPct = Math.min(100, Math.round(((routeProgress?.completed ?? 0) / total) * 100));
  const remainingAfter = Math.max(0, total - position);

  return (
    <div className="mx-auto max-w-md px-5 pt-5 pb-32">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate({ to: "/app/live" })} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Route
        </button>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusStyle}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${status === "completed" ? "bg-emerald-500" : status === "in_progress" ? "bg-blue-500" : status === "unavailable" ? "bg-destructive" : "bg-primary"} ${status === "pending" || status === "in_progress" ? "animate-pulse" : ""}`} />
          {statusLabel}
        </span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">Service details</h1>
        {c?.area && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            <MapPin className="h-3 w-3" /> {c.area}
          </span>
        )}
      </div>

      {/* Route progress */}
      <div className="mt-3 rounded-2xl border border-border bg-card p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold">Stop {position} / {total}</span>
          <span className="text-muted-foreground">
            {remainingAfter === 0 ? "Last stop today" : `${remainingAfter} Remaining`}
          </span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
        <button
          type="button"
          onClick={() => setPhotoOpen(true)}
          className="relative block h-56 w-full overflow-hidden"
          aria-label="View vehicle photo full screen"
        >
          <VehicleImage path={v?.front_image_path} className="h-56 w-full" alt={`${v?.make ?? ""} ${v?.model ?? ""}`} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-3 pb-2 pt-8">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-white/95">
                <Camera className="h-3 w-3" /> Customer reference
              </span>
              <p className="text-[10px] leading-tight text-white/75">
                {(service as any)?.created_at ? `Uploaded ${new Date((service as any).created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "Uploaded by customer"}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              <ZoomIn className="h-3 w-3" /> Pinch to zoom
            </span>
          </div>
        </button>

        {/* Customer summary — name / vehicle / plate then meta */}
        <div className="p-5">
          <div className="flex items-start gap-3">
            <User className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold leading-tight tracking-tight">{c?.full_name ?? "—"}</p>
              {(v?.make || v?.model) && (
                <p className="mt-1 truncate text-sm font-medium text-foreground">{v?.make} {v?.model}</p>
              )}
              {v?.registration_number ? (
                <span className="mt-1.5 inline-block rounded-md border border-foreground/30 bg-yellow-50 px-2 py-0.5 font-mono text-[12px] font-bold tracking-wider text-foreground">
                  {v.registration_number}
                </span>
              ) : (
                <span className="mt-1.5 block text-xs text-muted-foreground">No plate on file</span>
              )}
            </div>
          </div>

          <ul className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
            <li className="flex items-center gap-3">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{timeLabel ? `Before ${timeLabel}` : "Flexible timing"}</span>
            </li>
            {c?.address_line && (
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 text-muted-foreground">{c.address_line}</span>
              </li>
            )}
          </ul>

          {/* Customer notes / instructions */}
          {(c?.notes || c?.special_instructions) && (
            <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Customer instructions</p>
              <p className="mt-1 whitespace-pre-line text-sm text-foreground">{c.special_instructions || c.notes}</p>
            </div>
          )}

          {/* Primary actions */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              variant="outline"
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
      </div>

      <VehiclePhotoViewer
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        photos={v?.front_image_path ? [{ path: v.front_image_path }] : []}
        customerName={c?.full_name}
        vehicleLabel={`${v?.make ?? ""} ${v?.model ?? ""}`.trim() || null}
        registration={v?.registration_number}
      />

      {service?.status === "pending" && (
        <div className="mt-5 space-y-3">
          {routeProgress?.nextName && (
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Next after this</p>
              <p className="mt-0.5 truncate text-sm font-medium">{routeProgress.nextName}</p>
            </div>
          )}
          <UnavailableSection serviceId={id} assignmentId={(service as any)?.assignment_id ?? null} photos={photos ?? []} refetch={refetchPhotos} onDone={refreshAfterReport} />
          {/* Sticky Start service button — sits above bottom nav */}
          <div className="fixed inset-x-0 bottom-16 z-40 pointer-events-none px-5">
            <div className="mx-auto max-w-md pointer-events-auto">
              <Button
                size="lg"
                className="h-14 w-full text-base font-semibold shadow-[0_14px_36px_-12px_hsl(var(--primary)/0.7)]"
                onClick={() => start.mutate()}
                disabled={start.isPending}
              >
                {start.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5 fill-current" />}
                {start.isPending ? "Starting…" : "Start service"}
              </Button>
              <p className="mt-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
                Average service · 5–7 min
              </p>
            </div>
          </div>
        </div>
      )}


      {(service?.status === "in_progress" || service?.status === "completed") && (() => {
        const photoRows = (photos ?? []) as ServicePhotoRow[];
        const stepDefs: Array<{ key: string; label: string; stage: "before" | "after"; angle: Angle | "front"; hint: string }> = [
          { key: "before", label: "Before", stage: "before", angle: "front", hint: "Whole car, before you start" },
          { key: "front", label: "Front view", stage: "after", angle: "front", hint: "Bonnet + headlights visible" },
          { key: "rear", label: "Rear view", stage: "after", angle: "rear", hint: "Boot + tail lights visible" },
          { key: "left", label: "Left side", stage: "after", angle: "left", hint: "Full left side, mirror included" },
          { key: "right", label: "Right side", stage: "after", angle: "right", hint: "Full right side, mirror included" },
        ];
        const stepStatus = stepDefs.map((s) => {
          if (s.stage === "before") return { ...s, done: beforeDone };
          return { ...s, done: afterDone.has(s.angle as Angle) };
        });
        const doneCount = stepStatus.filter((s) => s.done).length;
        const activeIdx = stepStatus.findIndex((s) => !s.done);
        const pctPhotos = Math.round((doneCount / stepStatus.length) * 100);
        const pathFor = (stage: string, angle: string) =>
          photoRows.find((p) => p.stage === stage && p.angle === angle)?.storage_path ?? null;
        const allDone = doneCount === stepStatus.length;

        return (
          <>
            {/* Service checklist header */}
            <div className="mt-6 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider">Service checklist</h2>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-foreground">
                {doneCount}/{stepStatus.length}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${allDone ? "bg-[color:var(--success)]" : "bg-primary"}`}
                style={{ width: `${pctPhotos}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {allDone ? "All photos captured — ready to complete" : `${stepStatus.length - doneCount} photo${stepStatus.length - doneCount === 1 ? "" : "s"} remaining · camera only`}
            </p>

            {/* Photo guidance tip */}
            {service.status === "in_progress" && !allDone && (
              <p className="mt-2 rounded-lg bg-muted/50 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
                💡 Capture clear, well-lit photos. Keep the full vehicle visible.
              </p>
            )}

            {/* Guided steps */}
            {service.status === "in_progress" && (
              <div className="mt-3 space-y-2.5">
                {stepStatus.map((s, i) => {
                  const isActive = i === activeIdx;
                  const isLocked = !s.done && !isActive;
                  const variant = s.done
                    ? "guided-done"
                    : isActive
                      ? "guided-active"
                      : "guided-locked";
                  return (
                    <div key={s.key} ref={isActive ? activeStepRef : undefined}>
                      <PhotoSlot
                        serviceId={id}
                        assignmentId={(service as any)?.assignment_id ?? null}
                        stage={s.stage}
                        angle={s.angle}
                        slotId={s.key === "before" ? "before" : s.angle}
                        done={s.done}
                        onUploaded={() => refetchPhotos()}
                        label={s.label}
                        variant={variant as any}
                        stepNumber={i + 1}
                        thumbPath={pathFor(s.stage, s.angle)}
                        hint={s.hint}
                        autoOpen={s.key === "before" && autoOpenBefore && !s.done}
                        onAutoOpenConsumed={() => setAutoOpenBefore(false)}
                        disabled={isLocked}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Completed view — grid summary of thumbnails */}
            {service.status === "completed" && (
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                {stepStatus.map((s, i) => (
                  <PhotoSlot
                    key={s.key}
                    serviceId={id}
                    assignmentId={(service as any)?.assignment_id ?? null}
                    stage={s.stage}
                    angle={s.angle}
                    slotId={s.key === "before" ? "before" : s.angle}
                    done={s.done}
                    onUploaded={() => refetchPhotos()}
                    label={s.label}
                    variant="guided-done"
                    stepNumber={i + 1}
                    thumbPath={pathFor(s.stage, s.angle)}
                    disabled
                  />
                ))}
              </div>
            )}

            {/* Timer + notes — bolder */}
            <Card className="mt-4 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Clock className="h-4 w-4" /> Service time
                  </span>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Average 5–7 min</p>
                </div>
                <span className="text-2xl font-extrabold tabular-nums tracking-tight">{elapsedLabel}</span>
              </div>
              {service.status === "in_progress" && (
                <>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {NOTE_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => {
                          setServiceNotes((current) => {
                            if (current.includes(chip)) return current;
                            return current ? `${current.trim()} · ${chip}` : chip;
                          });
                        }}
                        className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
                      >
                        + {chip}
                      </button>
                    ))}
                  </div>
                  <Textarea
                    placeholder="Add notes for the customer or admin…"
                    value={serviceNotes}
                    onChange={(e) => setServiceNotes(e.target.value)}
                    className="mt-2 min-h-[60px] text-sm"
                  />
                </>
              )}
            </Card>

            {/* Reports — inline sections (never modals) */}
            {service.status === "in_progress" && (
              <div className="mt-4 space-y-3">
                <UnavailableSection serviceId={id} assignmentId={(service as any)?.assignment_id ?? null} photos={photos ?? []} refetch={refetchPhotos} onDone={refreshAfterReport} />
                <DirtyVehicleSection serviceId={id} assignmentId={(service as any)?.assignment_id ?? null} photos={photos ?? []} refetch={refetchPhotos} onDone={refreshAfterReport} />
              </div>
            )}

            {/* Sticky Complete Service progress-button */}
            {service.status === "in_progress" && (
              <div className="fixed inset-x-0 bottom-16 z-40 pointer-events-none px-5">
                <div className="pointer-events-auto mx-auto max-w-md">
                  <div className="rounded-2xl border border-border bg-background/95 p-2.5 shadow-[0_18px_44px_-18px_rgba(0,0,0,0.35)] backdrop-blur">
                    {/* Pip progress row */}
                    <div className="mb-2 flex items-center justify-between gap-2 px-1">
                      <div className="flex items-center gap-1">
                        {stepStatus.map((s, i) => (
                          <span
                            key={s.key}
                            className={`h-2 w-6 rounded-full transition-colors ${
                              s.done
                                ? "bg-[color:var(--success)]"
                                : i === activeIdx
                                  ? "bg-primary/60 animate-pulse"
                                  : "bg-muted"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                        {allDone ? "✓ Ready" : `${doneCount} / ${stepStatus.length} photos`}
                      </span>
                    </div>
                    <Button
                      size="lg"
                      className={`h-14 w-full text-base font-semibold ${allDone ? "shadow-[0_14px_36px_-12px_hsl(var(--primary)/0.7)]" : ""}`}
                      disabled={complete.isPending}
                      onClick={() => {
                        if (allDone) {
                          complete.mutate();
                          return;
                        }
                        activeStepRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                    >
                      {complete.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {allDone
                        ? "✓ Complete service · ₹17"
                        : activeIdx >= 0
                          ? `Take ${stepStatus[activeIdx].label} photo`
                          : "Complete service"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}


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

function useServicePhotoSignedUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) { setUrl(null); return; }
    supabase.storage.from("service-photos").createSignedUrl(path, 60 * 60).then(({ data }) => {
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    });
    return () => { cancelled = true; };
  }, [path]);
  return url;
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
  variant = "default",
  stepNumber,
  thumbPath,
  hint,
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
  variant?: "default" | "guided-active" | "guided-done" | "guided-locked";
  stepNumber?: number;
  thumbPath?: string | null;
  hint?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const thumbUrl = useServicePhotoSignedUrl(variant === "guided-done" ? thumbPath : null);
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
      if (workflow === "service_photo") {
        toast.success(`✓ ${label} saved`, { duration: 1200 });
      }
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

  // Guided-done: compact green row with thumbnail + retake affordance
  if (variant === "guided-done") {
    return (
      <button
        type="button"
        onClick={openCamera}
        disabled={disabled || busy}
        className="group flex w-full items-center gap-3 rounded-2xl border border-[color:var(--success)]/40 bg-[color:var(--success)]/10 p-2.5 pr-4 text-left transition hover:bg-[color:var(--success)]/15"
      >
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-black/5">
          {thumbUrl ? (
            <img src={thumbUrl} alt={label} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center"><Camera className="h-5 w-5 text-muted-foreground" /></div>
          )}
          <span className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="h-4 w-4 text-white" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {stepNumber != null && (
              <span className="grid h-5 w-5 place-items-center rounded-full bg-[color:var(--success)] text-[10px] font-bold text-white">✓</span>
            )}
            <p className="truncate text-sm font-semibold capitalize text-[color:var(--success)]">{label}</p>
          </div>
          <p className="text-[10px] text-muted-foreground">Tap to retake</p>
        </div>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-[color:var(--success)]" />}
      </button>
    );
  }

  // Guided-active: large primary capture card, current step
  if (variant === "guided-active") {
    return (
      <button
        type="button"
        onClick={openCamera}
        disabled={disabled || busy}
        className="relative flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-primary bg-primary/5 px-4 py-8 text-center transition active:scale-[0.99] disabled:opacity-70"
      >
        {stepNumber != null && (
          <span className="absolute left-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-md">
            {stepNumber}
          </span>
        )}
        <div className="grid h-16 w-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
          {busy ? <Loader2 className="h-7 w-7 animate-spin" /> : <Camera className="h-7 w-7" />}
        </div>
        <p className="mt-1 text-base font-bold capitalize">
          {busy ? "Uploading…" : `Take ${label} photo`}
        </p>
        {hint && !busy && (
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        )}
      </button>
    );
  }

  // Guided-locked: muted collapsed row for future steps
  if (variant === "guided-locked") {
    return (
      <div className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-3 py-2.5 opacity-70">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border bg-background text-[11px] font-semibold text-muted-foreground">
          {stepNumber ?? "•"}
        </span>
        <p className="text-sm font-medium capitalize text-muted-foreground">{label}</p>
      </div>
    );
  }

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
          <XCircle className="h-4 w-4" /> Need help?
          {visibleCount > 0 && <span className="text-xs text-muted-foreground">· {capturedCount}/{UNAVAILABLE_REQUIRED} uploaded</span>}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {/* Body stays MOUNTED even when collapsed (CSS hidden) so the
          PhotoSlots survive Android process kill/remount cycles. */}
      <div className={expanded ? "border-t border-border p-4" : "hidden"}>
        <p className="mt-1 text-xs text-muted-foreground">Pick a reason and capture {UNAVAILABLE_REQUIRED} live proof photos.</p>
        <RadioGroup value={reason} onValueChange={setReason} className="mt-2 space-y-2">
          {UNAVAILABLE_REASONS.map((r) => {
            const Icon = r.icon;
            const selected = reason === r.value;
            return (
              <Label
                key={r.value}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition ${
                  selected ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <RadioGroupItem value={r.value} />
                <Icon className={`h-4 w-4 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                <span className="flex-1">{r.label}</span>
              </Label>
            );
          })}
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
          <AlertTriangle className="h-4 w-4" /> Vehicle needs attention
          {visibleCount > 0 && <span className="text-xs text-muted-foreground">· {capturedCount}/{DIRTY_ANGLES.length} uploaded</span>}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      <div className={expanded ? "border-t border-border p-4" : "hidden"}>
        <p className="mt-1 text-xs text-muted-foreground">Pick what you see and capture all 4 side photos.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DIRTY_REASONS.map((r) => {
            const selected = reason === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/40 text-muted-foreground hover:border-primary hover:text-primary"
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>
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

