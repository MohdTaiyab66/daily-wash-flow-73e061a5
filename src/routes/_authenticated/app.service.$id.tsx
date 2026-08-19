import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Camera, Check, Loader2, Navigation, Clock, Sparkles, AlertTriangle, ShieldAlert, MapPin, Phone
} from "lucide-react";
import { OfflineGuard } from "@/components/OfflineGuard";
import { MaskedCallButton } from "./app.live";
import { formatTime12 } from "@/lib/format";
import { openGoogleMapsDirections } from "@/lib/gps";
import { ServiceCelebration } from "@/components/partner/ServiceCelebration";
import { PhotoSlot, getPosition, type ServicePhotoRow } from "@/components/partner/service/photo-slot";
import { Textarea } from "@/components/ui/textarea";

const AFTER_ANGLES = ["front", "rear", "left", "right"] as const;

export const Route = createFileRoute("/_authenticated/app/service/$id")({
  component: () => <OfflineGuard label="service verification"><ServiceDetail /></OfflineGuard>,
});

function ServiceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedCondition, setSelectedCondition] = useState<"ready" | "unavailable" | "dirty" | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string>("vehicle_not_available");
  const [notes, setNotes] = useState("");
  const [celebration, setCelebration] = useState<any>(null);

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

  const { data: routeProgress } = useQuery({
    queryKey: ["service-route-progress", id],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("services")
        .select("id,status,customers(full_name)")
        .eq("partner_id", u.user!.id)
        .eq("scheduled_date", today);
      const rows = data ?? [];
      const total = rows.length;
      const completed = rows.filter((r: any) => r.status === "completed" || r.status === "unavailable").length;
      return { total, completed };
    },
  });

  const start = useMutation({
    mutationFn: async () => {
      const pos = await getPosition();
      const { error } = await supabase.from("services").update({
        status: "in_progress",
        started_at: new Date().toISOString(),
        start_lat: pos?.lat ?? null,
        start_lng: pos?.lng ?? null,
      }).eq("id", id);
      if (error) throw error;
      
      import("@/lib/push/immediate.functions").then(m => {
        m.flushNotificationPush().catch(e => console.error("[immediate-push] start flush failed", e));
      });
    },
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ["service", id] });
      qc.invalidateQueries({ queryKey: ["route-today"] });
      qc.invalidateQueries({ queryKey: ["today-assignment"] });
    },
  });

  const complete = useMutation({
    mutationFn: async () => {
      const pos = await getPosition();
      const { data, error } = await (supabase as any).rpc("partner_complete_service", {
        p_service_id: id,
        p_lat: pos?.lat ?? null,
        p_lng: pos?.lng ?? null,
        p_notes: notes.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // FORCE IMMEDIATE REFETCH OF ALL AUTHORITATIVE DATA
      qc.invalidateQueries({ queryKey: ["service", id] });
      qc.invalidateQueries({ queryKey: ["route-today"] });
      qc.invalidateQueries({ queryKey: ["today-assignment"] });
      qc.invalidateQueries({ queryKey: ["earnings-v3"] });
      qc.invalidateQueries({ queryKey: ["today-assignment-for-earnings"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["service-history"] });
      qc.invalidateQueries({ queryKey: ["service-summary"] });
      
      // We must wait for the invalidation to trigger or use the returned data
      // to avoid showing stale progress in the celebration modal.
      setCelebration({
        amount: Number(data?.amount ?? 17),
        completed: (routeProgress?.completed ?? 0) + 1,
        total: routeProgress?.total ?? 1,
      });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const markUnavailable = useMutation({
    mutationFn: async () => {
      const pos = await getPosition();
      const capturedPaths = (photos ?? [])
        .filter(p => p.stage === "unavailable")
        .map(p => p.storage_path);
        
      const { data, error } = await supabase.rpc("submit_service_unavailable", {
        p_service_id: id,
        p_reason: unavailableReason,
        p_notes: notes.trim() || "Vehicle unavailable",
        p_photos: capturedPaths,
        p_lat: pos?.lat ?? null,
        p_lng: pos?.lng ?? null,
      } as any);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service", id] });
      qc.invalidateQueries({ queryKey: ["route-today"] });
      qc.invalidateQueries({ queryKey: ["today-assignment"] });
      qc.invalidateQueries({ queryKey: ["earnings-v3"] });
      qc.invalidateQueries({ queryKey: ["today-assignment-for-earnings"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["service-history"] });
      qc.invalidateQueries({ queryKey: ["service-summary"] });
      toast.success("Marked as unavailable");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const markDirty = useMutation({
    mutationFn: async () => {
      const pos = await getPosition();
      const dirtyPhotos = (photos ?? [])
        .filter(p => p.stage === "dirty")
        .map(p => p.storage_path);

      const { data, error } = await supabase.rpc("submit_service_unavailable", {
        p_service_id: id,
        p_reason: "dirty_vehicle",
        p_notes: notes.trim() || "Dirty vehicle reported",
        p_photos: dirtyPhotos,
        p_lat: pos?.lat ?? null,
        p_lng: pos?.lng ?? null,
      } as any);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service", id] });
      qc.invalidateQueries({ queryKey: ["route-today"] });
      qc.invalidateQueries({ queryKey: ["today-assignment"] });
      qc.invalidateQueries({ queryKey: ["earnings-v3"] });
      qc.invalidateQueries({ queryKey: ["today-assignment-for-earnings"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["service-history"] });
      qc.invalidateQueries({ queryKey: ["service-summary"] });
      toast.success("Dirty vehicle reported");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const goNext = () => navigate({ to: "/app/live" });

  const status = service?.status ?? "pending";
  const done = status === "completed" || status === "unavailable";
  const c = service?.customers as any;
  const v = service?.vehicles as any;
  const beforeDone = (photos ?? []).some((p) => p.stage === "before");
  const afterDone = (photos ?? []).filter((p) => p.stage === "after");
  const afterAllDone = AFTER_ANGLES.every((a) => afterDone.some((p) => p.angle === a));
  const unavailableDone = (photos ?? []).some(p => p.stage === "unavailable");
  const dirtyDone = (photos ?? []).filter(p => p.stage === "dirty").length >= 4;

  useEffect(() => {
    if (service?.unavailable_reason === "dirty_vehicle") setSelectedCondition("dirty");
    else if (status === "unavailable") setSelectedCondition("unavailable");
    else if (status === "in_progress" && !selectedCondition) setSelectedCondition("ready");
  }, [status, service?.unavailable_reason, selectedCondition]);

  if (!service) return <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-[#FF6B00]" /></div>;

  if (done) {
    return (
        <div className="mx-auto max-w-md px-5 pt-12 pb-40 text-center space-y-6">
            <div className="mx-auto h-20 w-20 flex items-center justify-center rounded-full bg-emerald-100">
                <Check className="h-10 w-10 text-emerald-600" />
            </div>
            <h1 className="text-3xl font-black">
                {status === "completed" ? "Service Done!" : "Marked Unavailable"}
            </h1>
            <p className="text-muted-foreground">The daily route has been updated.</p>
            <Button size="lg" className="h-14 w-full rounded-2xl bg-black text-white font-bold" onClick={goNext}>
                Back to Daily Route
            </Button>
        </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-5 pt-4 pb-40">
      {celebration && (
        <ServiceCelebration
          open
          amount={celebration.amount}
          completed={celebration.completed}
          total={celebration.total}
          onDone={() => { setCelebration(null); goNext(); }}
        />
      )}

      {/* Navigation & Status */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate({ to: "/app/live" })} className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500">
          <ArrowLeft className="h-4 w-4" /> Route
        </button>
        {status === "in_progress" && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-[#FF6B00]/10 rounded-full">
                <div className="h-2 w-2 bg-[#FF6B00] rounded-full animate-pulse" />
                <span className="text-[10px] font-black text-[#FF6B00] uppercase tracking-widest">In Progress</span>
            </div>
        )}
      </div>

      {/* Customer Header - Simplified */}
      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-tight text-neutral-900 leading-tight">{c?.full_name}</h1>
        <div className="flex items-center gap-2 mt-1">
            <span className="text-sm font-bold text-neutral-500">{v?.make} {v?.model}</span>
            <span className="h-1 w-1 rounded-full bg-neutral-300" />
            <span className="text-sm font-mono font-bold text-neutral-400">{v?.registration_number}</span>
        </div>
        
        <div className="flex gap-2 mt-4">
            <Button 
              variant="outline" 
              className="flex-1 h-12 rounded-2xl border-neutral-200 font-bold gap-2 text-neutral-900 bg-white" 
              onClick={() => openGoogleMapsDirections(service.destination_lat, service.destination_lng)}
            >
                <Navigation className="h-4 w-4 text-[#FF6B00]" /> Navigate
            </Button>
            <div className="flex-1">
                <MaskedCallButton serviceId={id} full size="lg" />
            </div>
        </div>
      </div>

      {/* Initial View: UPCOMING */}
      {status === "pending" && (
        <div className="space-y-6">
            <div className="bg-neutral-50 rounded-3xl p-5 border border-neutral-100 space-y-4">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 text-neutral-500">
                        <Clock className="h-4 w-4" />
                        <span className="text-sm font-bold">{formatTime12(c?.service_required_before ?? c?.preferred_time)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-neutral-500">
                        <MapPin className="h-4 w-4" />
                        <span className="text-sm font-bold">{c?.area}</span>
                    </div>
                </div>
                {c?.address_line && <p className="text-sm text-neutral-500 leading-snug">{c.address_line}</p>}
            </div>
            <Button 
                size="lg" 
                className="h-16 w-full rounded-[24px] bg-[#FF6B00] hover:bg-[#ff8c33] font-black text-lg shadow-xl shadow-orange-500/20 active:scale-[0.98] transition-all" 
                onClick={() => start.mutate()}
                disabled={start.isPending}
            >
                {start.isPending ? <Loader2 className="animate-spin mr-2" /> : "START SERVICE"}
            </Button>
        </div>
      )}

      {/* Active View: IN PROGRESS */}
      {status === "in_progress" && (
        <div className="space-y-6">
            {/* Condition Selection */}
            <div className="space-y-3">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 ml-1">Vehicle Condition</h3>
                <div className="grid grid-cols-1 gap-2.5">
                    <button
                        onClick={() => setSelectedCondition("ready")}
                        className={cn(
                            "flex items-center gap-4 p-4 rounded-[20px] border-2 w-full text-left transition-all active:scale-[0.98]",
                            selectedCondition === "ready" ? "border-[#FF6B00] bg-[#FF6B00]/5 shadow-sm" : "border-neutral-100 bg-white"
                        )}
                    >
                        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", selectedCondition === "ready" ? "bg-[#FF6B00] text-white" : "bg-neutral-100 text-neutral-400")}>
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                            <p className="font-bold text-neutral-900">Ready to clean</p>
                            {selectedCondition === "ready" && <p className="text-[10px] font-bold text-[#FF6B00] uppercase">✓ Selected</p>}
                        </div>
                    </button>

                    <button
                        onClick={() => setSelectedCondition("dirty")}
                        className={cn(
                            "flex items-center gap-4 p-4 rounded-[20px] border-2 w-full text-left transition-all active:scale-[0.98]",
                            selectedCondition === "dirty" ? "border-amber-500 bg-amber-50 shadow-sm" : "border-neutral-100 bg-white"
                        )}
                    >
                        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", selectedCondition === "dirty" ? "bg-amber-500 text-white" : "bg-neutral-100 text-neutral-400")}>
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                            <p className="font-bold text-neutral-900">Very dirty</p>
                            {selectedCondition === "dirty" && <p className="text-[10px] font-bold text-amber-500 uppercase">✓ Selected</p>}
                        </div>
                    </button>

                    <button
                        onClick={() => setSelectedCondition("unavailable")}
                        className={cn(
                            "flex items-center gap-4 p-4 rounded-[20px] border-2 w-full text-left transition-all active:scale-[0.98]",
                            selectedCondition === "unavailable" ? "border-red-500 bg-red-50 shadow-sm" : "border-neutral-100 bg-white"
                        )}
                    >
                        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", selectedCondition === "unavailable" ? "bg-red-500 text-white" : "bg-neutral-100 text-neutral-400")}>
                            <ShieldAlert className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                            <p className="font-bold text-neutral-900">Unavailable vehicle</p>
                            {selectedCondition === "unavailable" && <p className="text-[10px] font-bold text-red-500 uppercase">✓ Selected</p>}
                        </div>
                    </button>
                </div>
            </div>

            {selectedCondition && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-6 pt-2">
                     {/* Before Photo Section */}
                     {selectedCondition === "ready" && (
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 ml-1">Before Photo</h3>
                            <PhotoSlot 
                                serviceId={id} 
                                stage="before" 
                                angle="full" 
                                label={beforeDone ? "✓ Before Photo Added" : "Add Before Photo"}
                                done={beforeDone} 
                                variant="hero" 
                                hint="Whole car visible"
                                onUploaded={() => refetchPhotos()} 
                            />
                        </div>
                     )}

                     {/* Dirty Vehicle Flow */}
                     {selectedCondition === "dirty" && (
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 ml-1">Dirty Vehicle Photos (4 Required)</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {AFTER_ANGLES.map((angle) => {
                                        const isDone = (photos ?? []).some((p) => p.stage === "dirty" && p.angle === angle);
                                        return (
                                            <PhotoSlot 
                                                key={angle}
                                                serviceId={id} 
                                                stage="dirty" 
                                                angle={angle} 
                                                label={angle} 
                                                done={isDone} 
                                                onUploaded={() => refetchPhotos()}
                                                thumbPath={photos?.find(p => p.stage === 'dirty' && p.angle === angle)?.storage_path}
                                                variant={isDone ? "guided-done" : "default"}
                                            />
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="space-y-4">
                                 <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 ml-1">Reason / Note</h3>
                                 <Textarea 
                                    placeholder="What makes the vehicle very dirty? (e.g. thick mud, bird droppings)" 
                                    className="min-h-[100px] rounded-[20px] border-neutral-200 bg-neutral-50 focus:bg-white transition-colors"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                 />
                            </div>

                            <Button 
                                size="lg" 
                                className="h-16 w-full rounded-[24px] bg-amber-600 hover:bg-amber-700 text-white font-black text-lg shadow-xl shadow-amber-500/10 active:scale-[0.98] transition-all" 
                                onClick={() => markDirty.mutate()}
                                disabled={markDirty.isPending || !dirtyDone}
                            >
                                {markDirty.isPending ? <Loader2 className="animate-spin mr-2" /> : "REPORT DIRTY VEHICLE"}
                            </Button>
                        </div>
                     )}
                     
                     {/* Unavailable Flow */}
                     {selectedCondition === "unavailable" && (
                         <div className="space-y-5">
                             <div className="space-y-4">
                                 <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 ml-1">Evidence Photo</h3>
                                 <PhotoSlot 
                                    serviceId={id} 
                                    stage="unavailable" 
                                    angle="front" 
                                    label={unavailableDone ? "✓ Evidence Photo Added" : "Add Evidence Photo"}
                                    done={unavailableDone} 
                                    variant="hero" 
                                    hint="Proof for unavailability"
                                    onUploaded={() => refetchPhotos()} 
                                 />
                             </div>
                             
                             <div className="space-y-4">
                                 <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 ml-1">Unavailability Reason</h3>
                                 <select 
                                    className="w-full h-12 rounded-[20px] border-2 border-neutral-100 bg-neutral-50 px-4 font-bold text-neutral-900 focus:border-red-500 transition-colors"
                                    value={unavailableReason}
                                    onChange={(e) => setUnavailableReason(e.target.value)}
                                 >
                                    <option value="vehicle_not_available">Vehicle not available</option>
                                    <option value="parking_locked">Parking locked</option>
                                    <option value="customer_asked_to_skip">Customer asked to skip</option>
                                    <option value="access_not_available">Access not available</option>
                                    <option value="customer_not_responding">Customer not responding</option>
                                    <option value="vehicle_taken_out">Vehicle taken out</option>
                                    <option value="keys_not_available">Keys not available</option>
                                    <option value="security_guard_denied">Security guard denied</option>
                                    <option value="other">Other</option>
                                 </select>
                             </div>

                             <div className="space-y-4">
                                 <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 ml-1">Additional Remarks</h3>
                                 <Textarea 
                                    placeholder={unavailableReason === 'other' ? "Please explain why (Required)..." : "Optional notes..."} 
                                    className="min-h-[100px] rounded-[20px] border-neutral-200 bg-neutral-50 focus:bg-white transition-colors"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                 />
                             </div>

                             <Button 
                                size="lg" 
                                className="h-16 w-full rounded-[24px] bg-red-600 hover:bg-red-700 text-white font-black text-lg shadow-xl shadow-red-500/10 active:scale-[0.98] transition-all" 
                                onClick={() => markUnavailable.mutate()}
                                disabled={markUnavailable.isPending || !unavailableDone || (unavailableReason === 'other' && !notes.trim())}
                             >
                                {markUnavailable.isPending ? <Loader2 className="animate-spin mr-2" /> : "MARK UNAVAILABLE"}
                             </Button>
                         </div>
                     )}

                      {/* Completion for Ready */}
                     {selectedCondition === "ready" && beforeDone && (
                        <div className="space-y-6 pt-2">
                            <div className="space-y-4">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 ml-1">After Photos (Required)</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {AFTER_ANGLES.map((angle) => {
                                        const isDone = afterDone.some((p) => p.angle === angle);
                                        return (
                                            <PhotoSlot 
                                                key={angle}
                                                serviceId={id} 
                                                stage="after" 
                                                angle={angle} 
                                                label={angle} 
                                                done={isDone} 
                                                onUploaded={() => refetchPhotos()}
                                                thumbPath={photos?.find(p => p.stage === 'after' && p.angle === angle)?.storage_path}
                                                variant={isDone ? "guided-done" : "default"}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                            
                            <Button 
                                size="lg" 
                                className={cn(
                                    "h-16 w-full rounded-[24px] font-black text-lg active:scale-[0.98] transition-all",
                                    afterAllDone 
                                        ? "bg-[#FF6B00] hover:bg-[#ff8c33] text-white shadow-xl shadow-orange-500/20" 
                                        : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                                )}
                                onClick={() => afterAllDone && complete.mutate()}
                                disabled={complete.isPending || !afterAllDone}
                            >
                                {complete.isPending ? <Loader2 className="animate-spin mr-2" /> : "COMPLETE SERVICE"}
                            </Button>
                        </div>
                     )}
                </div>
            )}
        </div>
      )}
      
      {/* Bottom Safe Area Padding for Android */}
      <div className="h-10 safe-bottom" />
    </div>
  );
}
