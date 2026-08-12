import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Clock3, ShieldAlert, Sparkles, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { ServicePhotoViewer } from "./ServicePhotoViewer";
import { cn } from "@/lib/utils";

type Photo = { stage: string; angle: string; storage_path: string; captured_at: string };
type DirtyReport = {
  reason: string | null; notes: string | null;
  photo_front: string | null; photo_rear: string | null;
  photo_left: string | null; photo_right: string | null;
  created_at: string;
} | null;
type RecentService = {
  service_id: string;
  booking_id: string;
  scheduled_date: string;
  completed_at: string;
  status: string;
  service_name: string | null;
  service_slug: string | null;
  partner_id: string | null;
  partner_name: string | null;
  vehicle_label: string | null;
  photos: Photo[];
  unavailable_reason: string | null;
  unavailable_notes: string | null;
  unavailable_photo: string | null;
  dirty_report: DirtyReport;
  complaint_window_ends_at: string;
  can_complain: boolean;
  has_complaint: boolean;
};

export function RecentServiceFeed({
  userId,
  vehicleId = null,
}: {
  userId: string | null;
  vehicleId?: string | null;
}) {
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const recentQ = useQuery({
    queryKey: ["my-recent-services", userId, vehicleId],
    enabled: !!userId,
    refetchInterval: 30000,
    queryFn: async (): Promise<RecentService[]> => {
      const { data, error } = await (supabase as any).rpc("list_my_recent_services", {
        p_days: 2,
        p_vehicle_id: vehicleId,
      });
      if (error) throw error;
      return (data ?? []) as RecentService[];
    },
  });

  // Full daily history: every scheduled day, whatever the outcome.
  const historyQ = useQuery({
    queryKey: ["my-service-history", userId, vehicleId],
    enabled: !!userId && showAll,
    queryFn: async (): Promise<RecentService[]> => {
      const { data, error } = await (supabase as any).rpc("list_my_service_history", {
        p_days: 60,
        p_vehicle_id: vehicleId,
      });
      if (error) throw error;
      return (data ?? []) as RecentService[];
    },
  });

  // Realtime: refresh when a service, photo or outcome report changes
  useEffect(() => {
    if (!userId) return;
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["my-recent-services", userId] });
      qc.invalidateQueries({ queryKey: ["my-service-history", userId] });
      qc.invalidateQueries({ queryKey: ["customer-latest-service-notice", userId] });
    };
    const ch = supabase
      .channel("customer-service-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "services" }, invalidate)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "service_photos" }, invalidate)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "dirty_vehicle_reports" }, invalidate)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "unavailability_reports" }, invalidate)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);

  // Listen for completion → toast notification
  const [, setSeenIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!recentQ.data) return;
    setSeenIds((prev) => {
      const fresh = recentQ.data!.filter(
        (s) => !prev.has(s.service_id) && Date.parse(s.completed_at) > Date.now() - 60_000,
      );
      if (fresh.length > 0) {
        fresh.forEach((s) =>
          toast.success(`${s.service_name ?? "Wash"} completed`, {
            description: `Tap My Plan to see photos. Report any issue within 2 hours.`,
          }),
        );
        return new Set([...prev, ...fresh.map((s) => s.service_id)]);
      }
      if (prev.size === 0 && recentQ.data!.length > 0) {
        return new Set(recentQ.data!.map((s) => s.service_id));
      }
      return prev;
    });
  }, [recentQ.data]);

  const list = showAll ? historyQ.data ?? [] : recentQ.data ?? [];

  if (recentQ.isLoading) {
    return <div className="mt-5 h-24 animate-pulse rounded-2xl bg-muted" />;
  }
  if (list.length === 0 && !showAll) return null;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["my-recent-services", userId] });
    qc.invalidateQueries({ queryKey: ["my-service-history", userId] });
  };

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[12px] font-semibold uppercase tracking-widest text-[#8A8A8A]">
          {showAll ? "Full History" : "Recent Service"}
        </h3>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-[13px] font-semibold text-[#FF6B00] active:opacity-60"
        >
          {showAll ? "Show Recent" : "View All"}
        </button>
      </div>
      <div className="mt-3 space-y-4">
        {showAll && historyQ.isLoading && <div className="h-24 animate-pulse rounded-[18px] bg-white border border-[#EEEEEE]" />}
        {showAll && !historyQ.isLoading && list.length === 0 && (
          <p className="rounded-[18px] border border-dashed border-[#EEEEEE] p-8 text-center text-[13px] font-medium text-[#8A8A8A]">
            No service records found.
          </p>
        )}
        {list.map((s) => <ServiceCard key={s.service_id} service={s} onSubmitted={invalidateAll} />)}
      </div>
    </div>
  );
}


function ServiceCard({ service, onSubmitted }: { service: RecentService; onSubmitted: () => void }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [initialPhotoIndex, setInitialPhotoIndex] = useState(0);

  const openViewer = (index: number) => {
    setInitialPhotoIndex(index);
    setViewerOpen(true);
  };

  const completed = new Date(service.completed_at);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    const handler = (e: any) => {
      if (e.detail?.serviceId === service.service_id) {
        setViewerOpen(true);
      }
    };
    window.addEventListener("uwOpenServicePhotos", handler);
    return () => {
      clearInterval(t);
      window.removeEventListener("uwOpenServicePhotos", handler);
    };
  }, [service.service_id]);
  const windowEnd = new Date(service.complaint_window_ends_at);
  const msLeft = windowEnd.getTime() - now;
  const minutesLeft = Math.max(0, Math.floor(msLeft / 60000));
  const canComplain = service.can_complain && msLeft > 0 && !service.has_complaint;

  const isUnavailable = service.status === "unavailable";
  const isMissed = service.status === "skipped";
  const isPending = service.status === "pending" || service.status === "in_progress";
  const hasDirty = !!service.dirty_report;

  const dirtyPhotos = [
    service.dirty_report?.photo_front,
    service.dirty_report?.photo_rear,
    service.dirty_report?.photo_left,
    service.dirty_report?.photo_right,
  ].filter((p): p is string => !!p);

  const getStatusDisplay = () => {
    if (isUnavailable) return { label: "Skipped", tone: "neutral" as const, icon: ShieldAlert };
    if (isMissed) return { label: "Missed", tone: "danger" as const, icon: AlertCircle };
    if (isPending) return { label: "Scheduled", tone: "brand" as const, icon: Clock3 };
    if (hasDirty) return { label: "Extra Dirty", tone: "warning" as const, icon: AlertCircle };
    return { label: "Completed", tone: "success" as const, icon: CheckCircle2 };
  };

  const status = getStatusDisplay();
  const StatusIcon = status.icon;

  // Clean human-friendly reasons
  const cleanReason = (raw: string | null) => {
    if (!raw) return null;
    const map: Record<string, string> = {
      car_not_parked: "Vehicle not found at location",
      gate_locked: "Access blocked (Gate/Building locked)",
      customer_unreachable: "Could not reach customer",
      vehicle_moved: "Vehicle was moved during service",
      heavy_rain: "Service paused due to heavy rain",
      dirty_vehicle: "Vehicle requires extra attention (Heavy dust)",
      heavy_dust: "Heavy dust found on vehicle",
    };
    return map[raw] ?? raw.replaceAll("_", " ").replace(/\.$/, "");
  };

  const reason = isUnavailable ? cleanReason(service.unavailable_reason ?? null) : hasDirty ? cleanReason(service.dirty_report?.reason ?? null) : null;

  return (
    <div className="overflow-hidden rounded-[18px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[20px] font-semibold text-[#1A1A1A] leading-tight">
              {status.label}
            </span>
            <div className={`h-2 w-2 rounded-full ${
              status.tone === "success" ? "bg-[#2E7D32]" : 
              status.tone === "danger" ? "bg-[#E53935]" :
              status.tone === "warning" ? "bg-[#FF6B00]" : "bg-[#FF6B00]"
            }`} />
          </div>
          
          <p className="mt-1 text-[15px] font-semibold text-[#1A1A1A]">
            {service.service_name ?? "Daily Shine"}
          </p>

          <p className="mt-0.5 text-[14px] font-normal text-[#8A8A8A]">
            {new Date(service.scheduled_date).toLocaleDateString("en-IN", { day: 'numeric', month: 'short' })}
            {!isPending && !isMissed && ` · ${completed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
            {` · ${service.vehicle_label}`}
          </p>

          {(reason || (isUnavailable && service.unavailable_notes)) && (
            <div className="mt-3 space-y-1">
              {reason && <p className="text-[13px] font-semibold text-[#1A1A1A]">{reason}</p>}
              {isUnavailable && (
                <p className="text-[13px] font-normal leading-relaxed text-[#8A8A8A]">
                  {service.unavailable_notes || "No wash was deducted from your plan."}
                </p>
              )}
              {hasDirty && (
                <p className="text-[13px] font-normal leading-relaxed text-[#8A8A8A]">
                  Partner reported the vehicle needed more attention than usual.
                </p>
              )}
            </div>
          )}
        </div>
        <div className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
          status.tone === "success" ? "bg-[#E8F5E9] text-[#2E7D32]" : 
          status.tone === "danger" ? "bg-[#FFEBEE] text-[#E53935]" :
          status.tone === "warning" ? "bg-[#FFF3E0] text-[#E65100]" : "bg-[#FFF1E8] text-[#FF6B00]"
        )}>
          <StatusIcon className="h-5 w-5" />
        </div>
      </div>

      {!isUnavailable && !isMissed && service.photos.length > 0 && (
        <PhotoStrip photos={service.photos} onPhotoClick={openViewer} />
      )}

      {(isUnavailable || hasDirty) && (service.unavailable_photo || dirtyPhotos.length > 0) && (
        <div className="mt-4 grid grid-cols-4 gap-2">
          {service.unavailable_photo && (
            <SignedPhoto 
              path={service.unavailable_photo} 
              stage="proof" 
              onClick={() => openViewer(0)} 
            />
          )}
          {dirtyPhotos.map((p, i) => (
            <SignedPhoto 
              key={p} 
              path={p} 
              stage="dirty" 
              onClick={() => openViewer(service.unavailable_photo ? i + 1 : i)} 
            />
          ))}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between border-t border-[#F5F5F5] pt-4">
        <div className="flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5 text-[#8A8A8A]" />
          <span className="text-[12px] font-medium text-[#8A8A8A]">
            {isMissed ? "Plan extended" : isPending ? "Scheduled" : isUnavailable ? "No wash deducted" : service.has_complaint ? "Issue reported" : msLeft > 0 ? `${minutesLeft}m to report issue` : "Window closed"}
          </span>
        </div>
        
        {!isUnavailable && !isMissed && !isPending && (
          <div className="flex items-center gap-4">
            {canComplain && (
              <button 
                onClick={() => setViewerOpen(true)}
                className="text-[13px] font-semibold text-[#FF6B00]"
              >
                Report Issue
              </button>
            )}
            <button 
              onClick={() => openViewer(0)}
              className="text-[13px] font-semibold text-[#1A1A1A]"
            >
              View Photos
            </button>
          </div>
        )}
              View Photos
            </button>
          </div>
        )}
      </div>

      <ServicePhotoViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        photos={
          isUnavailable || hasDirty
            ? [
                ...(service.unavailable_photo ? [{ stage: "proof", angle: "proof", storage_path: service.unavailable_photo, captured_at: service.completed_at }] : []),
                ...dirtyPhotos.map(p => ({ stage: "dirty", angle: "dirty", storage_path: p, captured_at: service.completed_at }))
              ]
            : service.photos
        }
        initialIndex={initialPhotoIndex}
        serviceName={service.service_name ?? "Daily Shine"}
        serviceDate={service.scheduled_date}
      />
    </div>
  );
}

function ComplaintButton({ service, canComplain, onSubmitted }: { service: RecentService; canComplain: boolean; onSubmitted: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>("quality");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("submit_service_complaint", {
        p_service_id: service.service_id, p_complaint_type: type, p_description: desc || null,
      });
      if (error) throw error;
      toast.success("Complaint submitted. Our team will follow up.");
      setOpen(false); setDesc(""); onSubmitted();
    } catch (e: any) {
      toast.error(e?.message || "Could not submit complaint");
    } finally { setSaving(false); }
  };

  return (
    <>
      <Button size="sm" variant={canComplain ? "outline" : "ghost"} disabled={!canComplain} className="h-7 gap-1 text-[11px]" onClick={() => setOpen(true)}>
        <ShieldAlert className="h-3.5 w-3.5" /> Report issue
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Report an issue</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg bg-primary/5 p-2 text-[11px] text-primary">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Complaints accepted within 2 hours of completion. Our team responds the same day.</span>
            </div>
            <div>
              <Label className="text-xs">What went wrong?</Label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
                <option value="quality">Wash quality not satisfactory</option>
                <option value="damage">Vehicle damage</option>
                <option value="missed_area">Area missed</option>
                <option value="behaviour">Partner behaviour</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Describe (optional)</Label>
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="Add a few details so we can resolve it" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PhotoStrip({ photos, onPhotoClick }: { photos: Photo[]; onPhotoClick: (index: number) => void }) {
  if (!photos.length) return null;
  return (
    <div className="mt-5 grid grid-cols-4 gap-2.5">
      {photos.slice(0, 3).map((p, i) => (
        <SignedPhoto 
          key={i} 
          path={p.storage_path} 
          stage={p.stage} 
          onClick={() => onPhotoClick(i)} 
        />
      ))}
      {photos.length > 3 && (
        <div className="relative cursor-pointer" onClick={() => onPhotoClick(3)}>
          <SignedPhoto 
            path={photos[3].storage_path} 
            stage={photos[3].stage} 
          />
          <div className="absolute inset-0 flex items-center justify-center rounded-[16px] bg-black/40 text-[18px] font-semibold text-white">
            +{photos.length - 3}
          </div>
        </div>
      )}
    </div>
  );
}

function SignedPhoto({ path, stage, onClick }: { path: string; stage: string; onClick?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage.from("service-photos").createSignedUrl(path, 600);
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    })();
    return () => { cancelled = true; };
  }, [path]);

  const label = stage === "before" ? "BEFORE" : stage === "after" ? "AFTER" : "SERVICE";

  return (
    <div 
      onClick={onClick}
      className={cn(
        "uw-pressable relative aspect-square overflow-hidden rounded-[16px] bg-[#F5F5F5]",
        onClick && "cursor-pointer"
      )}
    >
      {url ? (
        <img src={url} alt={stage} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-[#8A8A8A]" />
        </div>
      )}
      <div className="absolute bottom-1.5 left-1.5 rounded-full bg-black/30 px-2 py-0.5 text-[8px] font-bold tracking-widest text-white backdrop-blur-[2px]">
        {label}
      </div>
    </div>
  );
}
