import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Camera, Check, ChevronDown, Loader2, Navigation, Clock, MapPin,
  ZoomIn, Play, MoreHorizontal, LifeBuoy, Phone, ShieldAlert, Sparkles, AlertTriangle, XCircle,
} from "lucide-react";
import { OfflineGuard } from "@/components/OfflineGuard";
import { MaskedCallButton } from "./app.live";
import { formatTime12 } from "@/lib/format";
import { VehiclePhotoViewer } from "@/components/VehiclePhotoViewer";
import { VehicleImage } from "@/components/VehicleImage";
import { openGoogleMapsDirections, validateExactGps } from "@/lib/gps";

import { ServiceCelebration } from "@/components/partner/ServiceCelebration";
import { PhotoSlot, getPosition, type ServicePhotoRow } from "@/components/partner/service/photo-slot";
import { GuidedReport } from "@/components/partner/service/GuidedReport";

const AFTER_ANGLES = ["front", "rear", "left", "right"] as const;
type Angle = (typeof AFTER_ANGLES)[number];
const COMPENSATION = 12;
const SUPPORT_TEL = "+911800000000";
const CANCEL_GRACE_SECONDS = 120;

const NOT_FOUND_REASONS = [
  { value: "vehicle_not_available", label: "Vehicle is not here" },
  { value: "customer_not_responding", label: "Customer not answering" },
  { value: "customer_asked_to_skip", label: "Customer asked to skip" },
  { value: "parking_locked", label: "Parking is locked" },
  { value: "access_not_available", label: "Wrong location / no entry" },
  { value: "other", label: "Something else" },
];

const DIRTY_REASONS = [
  { value: "Heavy Mud", label: "Heavy mud" },
  { value: "Heavy Dust", label: "Heavy dust" },
  { value: "Bird Droppings", label: "Bird droppings" },
  { value: "Tree Sap", label: "Tree sap" },
  { value: "Construction Dirt", label: "Construction dirt" },
  { value: "Other", label: "Something else" },
];

const ATTENTION_REASONS = [
  { value: "Damage", label: "Damage on the car" },
  { value: "Broken Glass", label: "Broken glass" },
  { value: "Scratch", label: "Scratch" },
  { value: "Flat Tyre", label: "Flat tyre" },
  { value: "Accident", label: "Accident" },
  { value: "Other", label: "Something else" },
];

type Step =
  | "arrival" | "found" | "notfound" | "condition" | "dirty" | "attention"
  | "before" | "ready" | "cleaning" | "after" | "summary";

const stepKey = (id: string) => `uw_svc_step:${id}`;
const notesKey = (id: string) => `uw_svc_notes:${id}`;

function readStep(id: string): Step | null {
  if (typeof window === "undefined") return null;
  try { return (window.localStorage.getItem(stepKey(id)) as Step) || null; } catch { return null; }
}
function writeStep(id: string, step: Step) {
  try { window.localStorage.setItem(stepKey(id), step); } catch { /* noop */ }
}

export const Route = createFileRoute("/_authenticated/app/service/$id")({
  component: () => <OfflineGuard label="service verification"><ServiceDetail /></OfflineGuard>,
});

function ServiceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [nowTick, setNowTick] = useState(Date.now());
  const [photoOpen, setPhotoOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [askCancelReason, setAskCancelReason] = useState(false);
  const [serviceNotes, setServiceNotes] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return window.localStorage.getItem(notesKey(id)) ?? ""; } catch { return ""; }
  });
  const [step, setStepState] = useState<Step>(() => readStep(id) ?? "arrival");
  const [celebration, setCelebration] = useState<null | {
    amount: number; completed: number; total: number; walletBalance?: number | null; nextName?: string | null;
  }>(null);

  const setStep = (next: Step) => { writeStep(id, next); setStepState(next); };

  useEffect(() => { try { window.localStorage.setItem(notesKey(id), serviceNotes); } catch { /* noop */ } }, [id, serviceNotes]);
  useEffect(() => { const iv = window.setInterval(() => setNowTick(Date.now()), 1000); return () => window.clearInterval(iv); }, []);

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
      const { data } = await supabase.from("service_photos").select("angle,stage,storage_path").eq("service_id", id);
      return (data ?? []) as ServicePhotoRow[];
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
        .select("id,status,manual_sequence_no,sequence_no,eta_at,customers(full_name,area)")
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
      return {
        total: total || 1,
        position,
        completed,
        nextName: (nextRow as any)?.customers?.full_name ?? null,
        nextArea: (nextRow as any)?.customers?.area ?? null,
      };
    },
  });

  const photoRows = photos ?? [];
  const beforeDone = photoRows.some((p) => p.stage === "before");
  const afterDone = new Set(photoRows.filter((p) => p.stage === "after").map((p) => p.angle as Angle));
  const afterAllDone = AFTER_ANGLES.every((a) => afterDone.has(a));
  const status = service?.status ?? "pending";

  // ---- Resume: reconcile the saved step with the real server state ----
  useEffect(() => {
    if (!service) return;
    if (status === "completed" || status === "unavailable") return;
    if (status === "in_progress") {
      if (afterAllDone) { if (step !== "summary") setStep("summary"); return; }
      if (step !== "after" && step !== "cleaning") setStep("cleaning");
      return;
    }
    // pending
    if (step === "cleaning" || step === "after" || step === "summary") {
      setStep(beforeDone ? "ready" : "before");
    } else if (step === "before" && beforeDone) {
      setStep("ready");
    }
  }, [service, status, afterAllDone, beforeDone]);

  const start = useMutation({
    mutationFn: async () => {
      const pos = await getPosition();
      const ts_action = Date.now();
      console.log(`[PUSH-LATENCY:01] EVENT_CREATED ts=${ts_action}`);
      
      const { error } = await supabase.from("services").update({
        status: "in_progress",
        started_at: new Date().toISOString(),
        start_lat: pos?.lat ?? null,
        start_lng: pos?.lng ?? null,
      }).eq("id", id);
      if (error) throw error;
      
      console.log(`[PUSH-LATENCY:02] NOTIFICATION_CREATED ts=${Date.now()}`);
      import("@/lib/push/immediate.functions").then(m => {
        // [CUSTOMER-PROD-E2E:01-08] Trigger customer notification for service start
        m.flushNotificationPush().catch(e => console.error("[immediate-push] start flush failed", e));
      });
    },


    onSuccess: () => { setStep("cleaning"); qc.invalidateQueries({ queryKey: ["service", id] }); },
    onError: (e: any) => toast.error(e.message ?? "Could not start"),
  });

  const cancelStart = useMutation({
    mutationFn: async (reason: string | null) => {
      const { error } = await supabase.from("services")
        .update({ status: "pending", started_at: null, start_lat: null, start_lng: null })
        .eq("id", id);
      if (error) throw error;
      
    },
    onSuccess: () => {
      toast.success("Service start cancelled");
      setAskCancelReason(false);
      setCancelReason("");
      setStep("ready");
      qc.invalidateQueries({ queryKey: ["service", id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not cancel"),
  });

  const complete = useMutation({
    mutationFn: async () => {
      const ts_action = Date.now();
      console.log(`[PUSH-LATENCY:01] EVENT_CREATED ts=${ts_action}`);
      console.log(`[CUSTOMER-E2E:01-COMPLETE] PARTNER_HANDLER_STARTED service_id=${id}`);

      
      if (!beforeDone) throw new Error("Take the before photo first");
      if (!afterAllDone) throw new Error("Take all 4 after photos first");
      const pos = await getPosition();
      const completedAt = new Date().toISOString();
      
      const { data, error } = await (supabase as any).rpc("partner_complete_service", {
        p_service_id: id,
        p_lat: pos?.lat ?? null,
        p_lng: pos?.lng ?? null,
        p_notes: serviceNotes.trim() || null,
      });
      if (error) {
        console.error("[CUSTOMER-E2E:COMPLETE:ERR] RPC_ERROR", error);
        const code = (error as any).code ?? "";
        if (code === "P04PHOTO") throw new Error("Some photos are missing. Please take them again.");
        throw new Error((error as any).message ?? "Could not complete service");
      }
      
      console.log(`[PUSH-LATENCY:02] NOTIFICATION_CREATED ts=${Date.now()}`);
      console.log(`[CUSTOMER-E2E:02-COMPLETE] SERVICE_RPC_SUCCESS service_id=${id} status=completed`);

      console.log(`[CUSTOMER-E2E:03-CUSTOMER] CUSTOMER_RESOLVED customer_id=${(service as any)?.customers?.id} user_id=${(service as any)?.customers?.user_id}`);
      
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
      try { window.localStorage.removeItem(stepKey(id)); window.localStorage.removeItem(notesKey(id)); } catch { /* noop */ }
      
      
      console.log("[CUSTOMER-E2E:06-FLUSH] FLUSH_STARTED (Direct Completion Path)");
      import("@/lib/push/immediate.functions").then(m => {
        // Direct Send (Proven Path)
        m.sendDirectCompletionPush({
          data: {
            customerId: (service as any).customers.id,
            serviceId: id,
            type: "service_completed",
            title: "Daily Shine completed",
            body: "Your Daily Shine service has been completed. Tap My Plan to view your service photos."
          }
        }).then(res => {
          console.log(`[CUSTOMER-COMPLETE-PUSH:05] DIRECT_SEND_FINISHED result:`, res);
        }).catch(e => console.error("[CUSTOMER-COMPLETE-PUSH:ERR] direct send failed", e));

        // Background queue flush (still run it for production row cleanup)
        m.flushNotificationPush().catch(e => console.error("[CUSTOMER-E2E:07-FLUSH:ERR] flush failed", e));
      });

      if (data?.already) { void goNext(); return; }
      setCelebration({
        amount: Number(data?.amount ?? 17),
        completed: (routeProgress?.completed ?? 0) + 1,
        total: routeProgress?.total ?? 1,
        walletBalance: data?.wallet_balance ?? null,
        nextName: routeProgress?.nextName ?? null,
      });
    },
    onError: (e: any) => {
      console.error("[CUSTOMER-E2E:COMPLETE:ERR] mutation failed", e);
      toast.error(e.message);
    },
  });

  const goNext = async () => {
    if (nextServiceId) { navigate({ to: "/app/service/$id", params: { id: nextServiceId } }); return; }
    const today = new Date().toISOString().slice(0, 10);
    const { data: u } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("services")
      .select("id,sequence_no,manual_sequence_no,eta_at")
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

  const afterReport = () => {
    try { window.localStorage.removeItem(stepKey(id)); } catch { /* noop */ }
    void qc.invalidateQueries({ queryKey: ["service", id] });
    void qc.invalidateQueries({ queryKey: ["route-today"] });
    void qc.invalidateQueries({ queryKey: ["today-assignment"] });
    void qc.invalidateQueries({ queryKey: ["earnings-v3"] });
    void qc.invalidateQueries({ queryKey: ["wallet-balance"] });
    window.setTimeout(() => void goNext(), 900);
  };

  const c = service?.customers as any;
  const v = service?.vehicles as any;
  const exactDestination = validateExactGps((service as any)?.destination_lat, (service as any)?.destination_lng);
  const destLat = exactDestination?.latitude ?? null;
  const destLng = exactDestination?.longitude ?? null;
  const hasNavigation = destLat != null && destLng != null;
  const timeLabel = formatTime12(c?.service_required_before ?? c?.preferred_time);
  const elapsedSeconds = service?.started_at ? Math.max(0, Math.floor((nowTick - Date.parse(service.started_at)) / 1000)) : 0;
  const elapsedLabel = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
  const withinGrace = elapsedSeconds <= CANCEL_GRACE_SECONDS;

  const total = routeProgress?.total ?? 1;
  const position = routeProgress?.position ?? 1;
  const routePct = Math.min(100, Math.round((position / total) * 100));

  const done = status === "completed" || status === "unavailable";

  return (
    <div className="mx-auto max-w-md px-5 pt-4 pb-40">
      {celebration && (
        <ServiceCelebration
          open
          amount={celebration.amount}
          completed={celebration.completed}
          total={celebration.total}
          walletBalance={celebration.walletBalance ?? null}
          nextCustomerName={celebration.nextName ?? null}
          onDone={() => { setCelebration(null); void goNext(); }}
        />
      )}

      {/* Header + route progress */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate({ to: "/app/live" })} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Route
        </button>
        {c?.area && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <MapPin className="h-3 w-3" /> {c.area}
          </span>
        )}
      </div>
      <div className="mt-3 rounded-2xl border border-border bg-card p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Today's route</p>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${routePct}%` }} />
        </div>
        <p className="mt-2 text-sm font-semibold">Customer {position} of {total}</p>
      </div>

      {/* ---------------- DONE ---------------- */}
      {done && (
        <div className="mt-6 space-y-4 text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[color:var(--success)]/15">
            <Check className="h-10 w-10 text-[color:var(--success)]" />
          </div>
          <h1 className="text-2xl font-bold">
            {status === "completed" ? "Service completed" : "Marked as not done"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {status === "completed" ? "₹17 added to your wallet" : `₹${COMPENSATION} credited for your time`}
          </p>
          {routeProgress?.nextName && (
            <div className="rounded-2xl border border-border bg-card p-4 text-left">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Next stop</p>
              <p className="mt-1 text-lg font-bold">{routeProgress.nextName}</p>
              {routeProgress.nextArea && <p className="text-sm text-muted-foreground">{routeProgress.nextArea}</p>}
            </div>
          )}
          <Button size="lg" className="h-14 w-full text-base font-semibold" onClick={goNext}>
            {nextServiceId || routeProgress?.nextName ? "Go to next customer" : "Back to today's route"}
          </Button>
        </div>
      )}

      {/* ---------------- STEP 1 · ARRIVAL ---------------- */}
      {!done && step === "arrival" && (
        <>
          <CustomerCard
            service={service} c={c} v={v} timeLabel={timeLabel}
            hasNavigation={hasNavigation} destLat={destLat} destLng={destLng}
            serviceId={id} onOpenPhoto={() => setPhotoOpen(true)}
          />
          <MoreMenu open={moreOpen} onToggle={() => setMoreOpen((o) => !o)} onNeedHelp={() => { setMoreOpen(false); setStep("notfound"); }} onReportIssue={() => { setMoreOpen(false); setStep("condition"); }} />
          <StickyBar>
            <Button size="lg" className="h-16 w-full text-lg font-bold" onClick={() => setStep("found")}>
              I have reached
            </Button>
          </StickyBar>
        </>
      )}

      {/* ---------------- STEP 2 · FIND VEHICLE ---------------- */}
      {!done && step === "found" && (
        <Question
          title="Did you find the vehicle?"
          onBack={() => setStep("arrival")}
          options={[
            { label: "Yes, I found it", tone: "primary", onClick: () => setStep("condition") },
            { label: "No, I did not", tone: "danger", onClick: () => setStep("notfound") },
          ]}
        />
      )}

      {/* ---------------- NOT FOUND ---------------- */}
      {!done && step === "notfound" && (
        <div className="mt-6">
          <GuidedReport
            serviceId={id}
            assignmentId={(service as any)?.assignment_id ?? null}
            kind="unavailable"
            title="Why could you not do it?"
            reasons={NOT_FOUND_REASONS}
            angles={["front", "rear"]}
            photos={photoRows}
            refetch={() => void refetchPhotos()}
            compensation={COMPENSATION}
            onSubmitted={afterReport}
            onBack={() => setStep("found")}
          />
        </div>
      )}

      {/* ---------------- CONDITION ---------------- */}
      {!done && step === "condition" && (
        <Question
          title="How is the vehicle?"
          onBack={() => setStep("found")}
          options={[
            { label: "Ready to clean", icon: <Sparkles className="h-6 w-6" />, tone: "primary", onClick: () => setStep("before") },
            { label: "Very dirty", icon: <AlertTriangle className="h-6 w-6" />, tone: "warn", onClick: () => setStep("dirty") },
            { label: "Needs admin attention", icon: <ShieldAlert className="h-6 w-6" />, tone: "danger", onClick: () => setStep("attention") },
          ]}
        />
      )}

      {!done && (step === "dirty" || step === "attention") && (
        <div className="mt-6">
          <GuidedReport
            serviceId={id}
            assignmentId={(service as any)?.assignment_id ?? null}
            kind="dirty"
            title={step === "dirty" ? "What makes it dirty?" : "What is the problem?"}
            reasons={step === "dirty" ? DIRTY_REASONS : ATTENTION_REASONS}
            angles={["front", "rear", "left", "right"]}
            photos={photoRows}
            refetch={() => void refetchPhotos()}
            compensation={COMPENSATION}
            onSubmitted={afterReport}
            onBack={() => setStep("condition")}
            onContinueAnyway={() => setStep("before")}
            continueLabel="I can still clean it"
          />
        </div>
      )}

      {/* ---------------- STEP 3 · BEFORE PHOTO ---------------- */}
      {!done && step === "before" && (
        <div className="mt-6 space-y-5">
          <button type="button" onClick={() => setStep("condition")} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Before photo</p>
          <h2 className="text-2xl font-bold leading-tight">Take a photo of the full car</h2>
          <PhotoSlot
            serviceId={id}
            assignmentId={(service as any)?.assignment_id ?? null}
            stage="before"
            angle="front"
            slotId="before"
            done={beforeDone}
            label="Before"
            variant="hero"
            hint="Whole car, before you start"
            onUploaded={() => { void refetchPhotos(); setStep("ready"); }}
          />
        </div>
      )}

      {/* ---------------- STEP 4 · START SERVICE ---------------- */}
      {!done && step === "ready" && (
        <>
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-2 rounded-2xl border border-[color:var(--success)]/40 bg-[color:var(--success)]/10 p-4">
              <Check className="h-5 w-5 text-[color:var(--success)]" />
              <p className="text-sm font-semibold">Before photo saved</p>
            </div>
            <h2 className="text-2xl font-bold leading-tight">Ready to start cleaning?</h2>
            <button type="button" onClick={() => setStep("before")} className="text-sm font-medium text-muted-foreground underline">
              Take before photo again
            </button>
          </div>
          <StickyBar>
            <Button size="lg" className="h-16 w-full text-lg font-bold" disabled={start.isPending} onClick={() => start.mutate()}>
              {start.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5 fill-current" />}
              Start service
            </Button>
          </StickyBar>
        </>
      )}

      {/* ---------------- STEP 5 · IN PROGRESS ---------------- */}
      {!done && step === "cleaning" && (
        <>
          <div className="mt-8 space-y-4 text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Cleaning in progress</p>
            <p className="text-6xl font-extrabold tabular-nums tracking-tight">{elapsedLabel}</p>
            <p className="text-sm text-muted-foreground">Average time 5–7 minutes</p>
          </div>
          {withinGrace && (
            <div className="mt-8 text-center">
              <button type="button" onClick={() => cancelStart.mutate(null)} className="text-sm font-medium text-muted-foreground underline" disabled={cancelStart.isPending}>
                Started by mistake? Cancel
              </button>
            </div>
          )}
          {!withinGrace && (
            <div className="mt-8">
              {!askCancelReason ? (
                <button type="button" onClick={() => setAskCancelReason(true)} className="mx-auto block text-sm font-medium text-muted-foreground underline">
                  Cancel service start
                </button>
              ) : (
                <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
                  <p className="text-sm font-semibold">Why are you cancelling?</p>
                  <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Write the reason" className="min-h-[80px] rounded-xl text-base" />
                  <Button variant="destructive" className="h-12 w-full" disabled={!cancelReason.trim() || cancelStart.isPending} onClick={() => cancelStart.mutate(cancelReason.trim())}>
                    {cancelStart.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Cancel service start
                  </Button>
                  <button type="button" onClick={() => setAskCancelReason(false)} className="block w-full text-center text-sm text-muted-foreground underline">
                    Keep cleaning
                  </button>
                </div>
              )}
            </div>
          )}
          <StickyBar>
            <Button size="lg" className="h-16 w-full text-lg font-bold" onClick={() => setStep("after")}>
              Finish cleaning
            </Button>
          </StickyBar>
        </>
      )}

      {/* ---------------- STEP 6 · AFTER PHOTOS ---------------- */}
      {!done && step === "after" && (() => {
        const labels: Record<Angle, string> = { front: "front", rear: "back", left: "left side", right: "right side" };
        const nextAngle = AFTER_ANGLES.find((a) => !afterDone.has(a));
        if (!nextAngle) {
          return (
            <div className="mt-8 space-y-4 text-center">
              <Check className="mx-auto h-10 w-10 text-[color:var(--success)]" />
              <p className="text-lg font-semibold">All photos taken</p>
              <Button size="lg" className="h-16 w-full text-lg font-bold" onClick={() => setStep("summary")}>Continue</Button>
            </div>
          );
        }
        const idx = AFTER_ANGLES.indexOf(nextAngle) + 1;
        return (
          <div className="mt-6 space-y-5">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Photo {idx} of {AFTER_ANGLES.length}</p>
            <h2 className="text-2xl font-bold leading-tight">Take {labels[nextAngle]} photo</h2>
            <PhotoSlot
              key={nextAngle}
              serviceId={id}
              assignmentId={(service as any)?.assignment_id ?? null}
              stage="after"
              angle={nextAngle}
              slotId={nextAngle}
              done={false}
              label={labels[nextAngle]}
              variant="hero"
              hint="Keep the full car in the frame"
              onUploaded={() => void refetchPhotos()}
            />
            <div className="flex items-center gap-2">
              {AFTER_ANGLES.map((a) => (
                <span key={a} className={`h-2 flex-1 rounded-full ${afterDone.has(a) ? "bg-[color:var(--success)]" : "bg-muted"}`} />
              ))}
            </div>
          </div>
        );
      })()}

      {/* ---------------- STEP 7 · SUMMARY ---------------- */}
      {!done && step === "summary" && (
        <>
          <div className="mt-6 space-y-4">
            <h2 className="text-2xl font-bold leading-tight">Check and finish</h2>
            <div className="space-y-2 rounded-2xl border border-border bg-card p-4 text-base">
              <Row icon={<Clock className="h-4 w-4" />} label="Cleaning time" value={elapsedLabel} />
              <Row icon={<Camera className="h-4 w-4" />} label="Photos uploaded" value={`${(beforeDone ? 1 : 0) + afterDone.size} of 5`} />
            </div>
            <Textarea
              placeholder="Note for the customer or office (optional)"
              value={serviceNotes}
              onChange={(e) => setServiceNotes(e.target.value)}
              className="min-h-[90px] rounded-2xl text-base"
            />
            <button type="button" onClick={() => setStep("after")} className="text-sm font-medium text-muted-foreground underline">
              Take a photo again
            </button>
          </div>
          <StickyBar>
            <Button
              size="lg"
              className="h-16 w-full text-lg font-bold"
              disabled={complete.isPending || !beforeDone || !afterAllDone}
              onClick={() => complete.mutate()}
            >
              {complete.isPending && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
              Complete service
            </Button>
          </StickyBar>
        </>
      )}

      <VehiclePhotoViewer
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        photos={v?.front_image_path ? [{ path: v.front_image_path }] : []}
        customerName={c?.full_name}
        vehicleLabel={`${v?.make ?? ""} ${v?.model ?? ""}`.trim() || null}
        registration={v?.registration_number}
      />
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 text-muted-foreground">{icon}{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}

function StickyBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-16 z-40 pointer-events-none px-5">
      <div className="pointer-events-auto mx-auto max-w-md">{children}</div>
    </div>
  );
}

function Question({
  title,
  options,
  onBack,
}: {
  title: string;
  onBack?: () => void;
  options: Array<{ label: string; onClick: () => void; tone?: "primary" | "warn" | "danger"; icon?: React.ReactNode }>;
}) {
  return (
    <div className="mt-6 space-y-5">
      {onBack && (
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      )}
      <h2 className="text-3xl font-bold leading-tight">{title}</h2>
      <div className="space-y-3">
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={o.onClick}
            className={`flex min-h-[72px] w-full items-center gap-4 rounded-2xl border-2 px-5 text-left text-lg font-bold transition active:scale-[0.99] ${
              o.tone === "danger"
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : o.tone === "warn"
                  ? "border-amber-500/50 bg-amber-500/5 text-amber-700"
                  : "border-primary bg-primary/5 text-foreground"
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MoreMenu({
  open, onToggle, onNeedHelp, onReportIssue,
}: { open: boolean; onToggle: () => void; onNeedHelp: () => void; onReportIssue: () => void }) {
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between p-4 text-left">
        <span className="inline-flex items-center gap-2 text-sm font-semibold"><MoreHorizontal className="h-4 w-4" /> More</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="divide-y divide-border border-t border-border">
          <button type="button" onClick={onNeedHelp} className="flex w-full items-center gap-3 p-4 text-left text-sm font-medium">
            <XCircle className="h-4 w-4 text-muted-foreground" /> I cannot do this service
          </button>
          <button type="button" onClick={onReportIssue} className="flex w-full items-center gap-3 p-4 text-left text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" /> Report a problem with the car
          </button>
          <a href={`tel:${SUPPORT_TEL}`} className="flex w-full items-center gap-3 p-4 text-left text-sm font-medium">
            <LifeBuoy className="h-4 w-4 text-muted-foreground" /> Call partner support
          </a>
          <a href={`tel:${SUPPORT_TEL}`} className="flex w-full items-center gap-3 p-4 text-left text-sm font-medium">
            <Phone className="h-4 w-4 text-muted-foreground" /> Emergency contact
          </a>
        </div>
      )}
    </div>
  );
}

function CustomerCard({
  service, c, v, timeLabel, hasNavigation, destLat, destLng, serviceId, onOpenPhoto,
}: {
  service: any; c: any; v: any; timeLabel: string | null;
  hasNavigation: boolean; destLat: number | null; destLng: number | null;
  serviceId: string; onOpenPhoto: () => void;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-3xl border border-border bg-card">
      <button type="button" onClick={onOpenPhoto} className="relative block h-52 w-full overflow-hidden" aria-label="View vehicle photo">
        <VehicleImage path={v?.front_image_path} className="h-52 w-full" alt={`${v?.make ?? ""} ${v?.model ?? ""}`} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-3 pb-2 pt-8">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-white/95">
            <Camera className="h-3 w-3" /> Customer photo
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
            <ZoomIn className="h-3 w-3" /> Zoom
          </span>
        </div>
      </button>
      <div className="p-5">
        <p className="truncate text-2xl font-bold leading-tight">{c?.full_name ?? "—"}</p>
        {(v?.make || v?.model) && <p className="mt-1 truncate text-base font-medium">{v?.make} {v?.model}</p>}
        {v?.registration_number && (
          <span className="mt-2 inline-block rounded-md border border-foreground/30 bg-yellow-50 px-2 py-0.5 font-mono text-sm font-bold tracking-wider text-foreground">
            {v.registration_number}
          </span>
        )}
        <ul className="mt-4 space-y-2 border-t border-border pt-3 text-base">
          <li className="flex items-center gap-3">
            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{timeLabel ? `Before ${timeLabel}` : "Any time today"}</span>
          </li>
          {c?.address_line && (
            <li className="flex items-start gap-3">
              <MapPin className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 text-muted-foreground">{c.address_line}</span>
            </li>
          )}
        </ul>
        {(c?.special_instructions || c?.notes) && (
          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="whitespace-pre-line text-sm">{c.special_instructions || c.notes}</p>
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-14 text-base"
            disabled={!hasNavigation}
            onClick={async () => {
              await openGoogleMapsDirections(destLat, destLng);
            }}
          >
            <Navigation className="mr-1.5 h-5 w-5" /> {hasNavigation ? "Navigate" : "No GPS"}
          </Button>
          <MaskedCallButton serviceId={serviceId} />
        </div>
      </div>
    </div>
  );
}
