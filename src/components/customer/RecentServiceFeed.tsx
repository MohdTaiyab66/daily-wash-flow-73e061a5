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
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight">
          {showAll ? "Service history" : "Recent service updates"}
        </h3>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-[10px] font-medium text-primary underline-offset-2 hover:underline"
        >
          {showAll ? "Show recent only" : "View full history"}
        </button>
      </div>
      <div className="mt-2 space-y-3">
        {showAll && historyQ.isLoading && <div className="h-24 animate-pulse rounded-2xl bg-muted" />}
        {showAll && !historyQ.isLoading && list.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No service days recorded yet.
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
  const windowEnd = new Date(service.complaint_window_ends_at);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
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
  const reasonLabel = (r: string | null | undefined) => {
    if (!r) return "Service skipped";
    const map: Record<string, string> = {
      car_not_parked: "Car not at parking",
      gate_locked: "Gate / building locked",
      customer_unreachable: "Customer unreachable",
      vehicle_moved: "Vehicle was moved",
      heavy_rain: "Heavy rain",
      other: "Other reason",
    };
    return map[r] ?? r.replaceAll("_", " ");
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-start gap-3 p-4">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
          isUnavailable ? "bg-warning/20 text-warning-foreground"
            : isMissed ? "bg-destructive/10 text-destructive"
            : isPending ? "bg-muted text-muted-foreground"
            : hasDirty ? "bg-orange-500/15 text-orange-600"
            : "bg-success/15 text-success"
        }`}>
          {isUnavailable ? <ShieldAlert className="h-5 w-5" />
            : isMissed ? <AlertCircle className="h-5 w-5" />
            : isPending ? <Clock3 className="h-5 w-5" />
            : hasDirty ? <AlertCircle className="h-5 w-5" />
            : <CheckCircle2 className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">
              {isUnavailable
                ? `Skipped · ${service.service_name ?? "Service"}`
                : isMissed
                  ? `Missed by Urban Wash · ${service.service_name ?? "Service"}`
                  : isPending
                    ? `Scheduled · ${service.service_name ?? "Service"}`
                    : service.service_name ?? "Service complete"}
            </p>
            {hasDirty && !isUnavailable && <Badge className="h-5 bg-orange-500/15 text-[9px] text-orange-700">Dirty car reported</Badge>}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {service.vehicle_label}{service.partner_name ? ` · ${service.partner_name}` : ""}
          </p>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              {isPending || isMissed
                ? new Date(service.scheduled_date).toLocaleDateString()
                : `${completed.toLocaleDateString()} · ${completed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
            </span>
          </div>
          {isMissed && (
            <div className="mt-2 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
              <span className="font-medium">We could not service your vehicle.</span> Your plan has been extended by a day.
            </div>
          )}
          {isUnavailable && (
            <div className="mt-2 rounded-lg bg-warning/15 px-2.5 py-1.5 text-[11px] text-warning-foreground">
              <span className="font-medium">{reasonLabel(service.unavailable_reason)}.</span>
              {service.unavailable_notes ? <> {service.unavailable_notes}</> : null}
              <div className="mt-0.5">No wash was deducted from your plan.</div>
            </div>
          )}
          {hasDirty && (
            <div className="mt-2 rounded-lg bg-orange-500/10 px-2.5 py-1.5 text-[11px] text-orange-700">
              <span className="font-medium">{service.dirty_report?.reason ?? "Extra dirt noted"}.</span>
              {service.dirty_report?.notes ? <> {service.dirty_report.notes}</> : null}
            </div>
          )}
        </div>
      </div>

      {!isUnavailable && !isMissed && <PhotoStrip photos={service.photos} />}
      {(isUnavailable || hasDirty) && (
        <div className="grid grid-cols-4 gap-1 bg-muted/40 px-4 py-2">
          {service.unavailable_photo && <SignedPhoto path={service.unavailable_photo} stage="proof" />}
          {dirtyPhotos.map((p) => <SignedPhoto key={p} path={p} stage="dirty" />)}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <div className="inline-flex items-center gap-1.5 text-[11px]">
          <Clock3 className="h-3.5 w-3.5 text-primary" />
          {isMissed ? (
            <span className="text-muted-foreground">Plan extended — no wash deducted</span>
          ) : isPending ? (
            <span className="text-muted-foreground">Scheduled</span>
          ) : isUnavailable ? (
            <span className="text-muted-foreground">No charge — marked unavailable</span>
          ) : service.has_complaint ? (
            <span className="text-muted-foreground">Complaint submitted</span>
          ) : msLeft > 0 ? (
            <span className="font-medium text-primary">Report issue · {minutesLeft} min left</span>
          ) : (
            <span className="text-muted-foreground">Complaint window closed</span>
          )}
        </div>
        {!isUnavailable && !isMissed && !isPending && (
          <ComplaintButton service={service} canComplain={canComplain} onSubmitted={onSubmitted} />
        )}

      </div>
    </Card>
  );
}


function PhotoStrip({ photos }: { photos: Photo[] }) {
  if (!photos.length) return null;
  return (
    <div className="grid grid-cols-4 gap-1 bg-muted/40 px-4 py-2">
      {photos.slice(0, 8).map((p, i) => <SignedPhoto key={i} path={p.storage_path} stage={p.stage} />)}
    </div>
  );
}

function SignedPhoto({ path, stage }: { path: string; stage: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage.from("service-photos").createSignedUrl(path, 600);
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    })();
    return () => { cancelled = true; };
  }, [path]);
  return (
    <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
      {url ? <img src={url} alt={stage} className="h-full w-full object-cover" loading="lazy" /> : <div className="h-full w-full animate-pulse bg-muted" />}
      <span className="absolute bottom-0.5 left-0.5 rounded bg-foreground/60 px-1 text-[8px] uppercase text-background">{stage}</span>
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
