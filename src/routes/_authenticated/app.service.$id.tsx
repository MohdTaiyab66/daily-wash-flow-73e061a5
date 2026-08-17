import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Camera, Check, Loader2, Navigation, Clock, Sparkles, AlertTriangle, ShieldAlert,
} from "lucide-react";
import { OfflineGuard } from "@/components/OfflineGuard";
import { MaskedCallButton } from "./app.live";
import { formatTime12 } from "@/lib/format";
import { VehicleImage } from "@/components/VehicleImage";
import { openGoogleMapsDirections, validateExactGps } from "@/lib/gps";
import { ServiceCelebration } from "@/components/partner/ServiceCelebration";
import { PhotoSlot, getPosition, type ServicePhotoRow } from "@/components/partner/service/photo-slot";

const AFTER_ANGLES = ["front", "rear", "left", "right"] as const;
type Angle = (typeof AFTER_ANGLES)[number];

export const Route = createFileRoute("/_authenticated/app/service/$id")({
  component: () => <OfflineGuard label="service verification"><ServiceDetail /></OfflineGuard>,
});

function ServiceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedCondition, setSelectedCondition] = useState<"ready" | "dirty" | "unavailable" | null>(null);

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
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["service", id] }); },
  });

  const complete = useMutation({
    mutationFn: async () => {
      const pos = await getPosition();
      const { data, error } = await (supabase as any).rpc("partner_complete_service", {
        p_service_id: id,
        p_lat: pos?.lat ?? null,
        p_lng: pos?.lng ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { 
        qc.invalidateQueries({ queryKey: ["service", id] }); 
        qc.invalidateQueries({ queryKey: ["route-today"] });
    },
  });

  const status = service?.status ?? "pending";
  const done = status === "completed" || status === "unavailable";
  const c = service?.customers as any;
  const v = service?.vehicles as any;
  const beforeDone = (photos ?? []).some((p) => p.stage === "before");
  const afterAllDone = AFTER_ANGLES.every((a) => (photos ?? []).some((p) => p.stage === "after" && p.angle === a));

  if (!service) return <div className="p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="mx-auto max-w-md px-5 pt-4 pb-40">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate({ to: "/app/live" })} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Route
        </button>
        {status === "in_progress" && <span className="text-[10px] font-black text-[#FF6B00] uppercase tracking-widest flex items-center gap-1"><div className="h-2 w-2 bg-[#FF6B00] rounded-full animate-pulse" /> In Progress</span>}
      </div>

      {/* Customer Info */}
      <div className="mb-6">
        <h1 className="text-2xl font-black">{c?.full_name}</h1>
        <p className="font-medium text-neutral-600">{v?.make} {v?.model} • {v?.registration_number}</p>
      </div>

      {/* Actions */}
      {status === "pending" && (
        <Button size="lg" className="h-16 w-full rounded-[24px] bg-[#FF6B00] hover:bg-[#ff8c33] font-black text-lg" onClick={() => start.mutate()}>
          START SERVICE
        </Button>
      )}

      {status === "in_progress" && (
        <div className="space-y-4">
            {/* Condition Selection */}
            <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Vehicle Condition</h3>
            
            {(["ready", "dirty", "unavailable"] as const).map((cond) => (
                <button
                    key={cond}
                    onClick={() => setSelectedCondition(cond)}
                    className={cn(
                        "flex items-center gap-4 p-4 rounded-2xl border-2 w-full text-left transition",
                        selectedCondition === cond ? "border-[#FF6B00] bg-[#FF6B00]/5" : "border-neutral-100"
                    )}
                >
                    {cond === "ready" && <Sparkles className="h-6 w-6 text-emerald-500" />}
                    {cond === "dirty" && <AlertTriangle className="h-6 w-6 text-amber-500" />}
                    {cond === "unavailable" && <ShieldAlert className="h-6 w-6 text-red-500" />}
                    <span className="font-bold capitalize">{cond === "ready" ? "Ready to clean" : cond === "dirty" ? "Very dirty" : "Unavailable vehicle"}</span>
                    {selectedCondition === cond && <Check className="ml-auto h-5 w-5 text-[#FF6B00]" />}
                </button>
            ))}

            {/* In-progress Tasks */}
            {selectedCondition && (
                <div className="mt-6 pt-6 border-t border-neutral-100 space-y-4">
                     <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Before Photo</h3>
                     <PhotoSlot serviceId={id} stage="before" angle="full" label="Before photo" done={beforeDone} variant="hero" onUploaded={refetchPhotos} />
                     
                     {selectedCondition !== "unavailable" && (
                         <Button
                             size="lg"
                             className="h-16 w-full rounded-[24px] bg-black text-white font-black text-lg"
                             disabled={!beforeDone || !afterAllDone}
                             onClick={() => complete.mutate()}
                         >
                             COMPLETE SERVICE
                         </Button>
                     )}

                     {selectedCondition === "unavailable" && (
                         <Button size="lg" className="h-16 w-full rounded-[24px] bg-red-600 text-white font-black text-lg" onClick={() => complete.mutate()}>
                             MARK UNAVAILABLE
                         </Button>
                     )}
                </div>
            )}
        </div>
      )}
    </div>
  );
}
