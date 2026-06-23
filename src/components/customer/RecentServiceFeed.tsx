import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Camera, CheckCircle2, Clock3, ShieldAlert, Sparkles, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

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

export function RecentServiceFeed({ userId, demo }: { userId: string | null; demo?: boolean }) {
  const qc = useQueryClient();
  const recentQ = useQuery({
    queryKey: ["my-recent-services", userId],
    enabled: !!userId && !demo,
    refetchInterval: 30000,
    queryFn: async (): Promise<RecentService[]> => {
      const { data, error } = await (supabase as any).rpc("list_my_recent_services", { p_days: 2 });
      if (error) throw error;
      return (data ?? []) as RecentService[];
    },
  });

  // Realtime: refresh when a service or photo changes for me
  useEffect(() => {
    if (!userId || demo) return;
    const ch = supabase
      .channel("customer-service-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "services" }, () => {
        qc.invalidateQueries({ queryKey: ["my-recent-services", userId] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "service_photos" }, () => {
        qc.invalidateQueries({ queryKey: ["my-recent-services", userId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, demo, qc]);

  // Listen for completion → toast notification
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!recentQ.data) return;
    const fresh = recentQ.data.filter((s) => !seenIds.has(s.service_id) && Date.parse(s.completed_at) > Date.now() - 60_000);
    if (fresh.length > 0) {
      fresh.forEach((s) => toast.success(`${s.service_name ?? "Wash"} completed by ${s.partner_name ?? "your partner"}`, {
        description: `Tap My Plan to see photos. Report any issue within 2 hours.`,
      }));
      setSeenIds(new Set([...seenIds, ...fresh.map((s) => s.service_id)]));
    } else if (seenIds.size === 0) {
      setSeenIds(new Set(recentQ.data.map((s) => s.service_id)));
    }
  }, [recentQ.data, seenIds]);

  const demoList: RecentService[] = useMemo(() => {
    const completed = new Date(Date.now() - 35 * 60 * 1000).toISOString();
    const earlier = new Date(Date.now() - 26 * 3600 * 1000).toISOString();
    const yesterday = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    return [
      {
        service_id: "demo-svc",
        booking_id: "demo-bk",
        scheduled_date: new Date().toISOString().slice(0, 10),
        completed_at: completed,
        status: "completed",
        service_name: "Daily Shine — Exterior",
        service_slug: "daily-shine",
        partner_id: null,
        partner_name: "Rahul (Demo Partner)",
        vehicle_label: "Hyundai Creta",
        photos: [],
        unavailable_reason: null, unavailable_notes: null, unavailable_photo: null,
        dirty_report: null,
        complaint_window_ends_at: new Date(Date.parse(completed) + 2 * 3600 * 1000).toISOString(),
        can_complain: true,
        has_complaint: false,
      },
      {
        service_id: "demo-dirty",
        booking_id: "demo-bk-2",
        scheduled_date: yesterday.slice(0, 10),
        completed_at: yesterday,
        status: "completed",
        service_name: "Daily Shine — Dusting",
        service_slug: "daily-shine-dusting",
        partner_id: null,
        partner_name: "Aman (Demo Partner)",
        vehicle_label: "Hyundai Creta",
        photos: [],
        unavailable_reason: null, unavailable_notes: null, unavailable_photo: null,
        dirty_report: {
          reason: "Heavy mud / dust",
          notes: "Car returned from a long drive — extra dirt on rims. Wiped clean.",
          photo_front: null, photo_rear: null, photo_left: null, photo_right: null,
          created_at: yesterday,
        },
        complaint_window_ends_at: new Date(Date.parse(yesterday) + 2 * 3600 * 1000).toISOString(),
        can_complain: false,
        has_complaint: false,
      },
      {
        service_id: "demo-unavail",
        booking_id: "demo-bk-3",
        scheduled_date: earlier.slice(0, 10),
        completed_at: earlier,
        status: "unavailable",
        service_name: "Daily Shine — Exterior",
        service_slug: "daily-shine",
        partner_id: null,
        partner_name: "Rahul (Demo Partner)",
        vehicle_label: "Hyundai Creta",
        photos: [],
        unavailable_reason: "car_not_parked",
        unavailable_notes: "Car was not at the usual parking spot.",
        unavailable_photo: null,
        dirty_report: null,
        complaint_window_ends_at: earlier,
        can_complain: false,
        has_complaint: false,
      },
    ];
  }, []);

  const list = demo ? demoList : (recentQ.data ?? []);

  if (!demo && recentQ.isLoading) {
    return <div className="mt-5 h-24 animate-pulse rounded-2xl bg-muted" />;
  }
  if (list.length === 0) return null;

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight">Recent service updates</h3>
        <span className="text-[10px] text-muted-foreground">Visible for 2 days</span>
      </div>
      <div className="mt-2 space-y-3">
        {list.map((s) => <ServiceCard key={s.service_id} service={s} demo={demo} onSubmitted={() => qc.invalidateQueries({ queryKey: ["my-recent-services", userId] })} />)}
      </div>
    </div>
  );
}

function ServiceCard({ service, demo, onSubmitted }: { service: RecentService; demo?: boolean; onSubmitted: () => void }) {
  const completed = new Date(service.completed_at);
  const windowEnd = new Date(service.complaint_window_ends_at);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const msLeft = windowEnd.getTime() - now;
  const minutesLeft = Math.max(0, Math.floor(msLeft / 60000));
  const canComplain = !demo ? service.can_complain && msLeft > 0 && !service.has_complaint : true;

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-start gap-3 p-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{service.service_name ?? "Service complete"}</p>
            {demo && <Badge variant="outline" className="h-5 text-[9px]">DEMO</Badge>}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            by {service.partner_name ?? "your partner"} · {service.vehicle_label}
          </p>
          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3" /> {completed.toLocaleDateString()} · {completed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        </div>
      </div>

      <PhotoStrip photos={service.photos} demo={demo} />

      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <div className="inline-flex items-center gap-1.5 text-[11px]">
          <Clock3 className="h-3.5 w-3.5 text-primary" />
          {service.has_complaint ? (
            <span className="text-muted-foreground">Complaint submitted</span>
          ) : msLeft > 0 ? (
            <span className="font-medium text-primary">Report issue · {minutesLeft} min left</span>
          ) : (
            <span className="text-muted-foreground">Complaint window closed</span>
          )}
        </div>
        <ComplaintButton service={service} canComplain={canComplain} demo={demo} onSubmitted={onSubmitted} />
      </div>
    </Card>
  );
}

function PhotoStrip({ photos, demo }: { photos: Photo[]; demo?: boolean }) {
  if (demo) {
    return (
      <div className="grid grid-cols-4 gap-1 bg-muted/40 px-4 py-2">
        {["Front", "Side", "Rear", "Interior"].map((l) => (
          <div key={l} className="grid aspect-square place-items-center rounded-md bg-gradient-to-br from-primary/15 to-accent text-[10px] text-muted-foreground">
            <Camera className="h-4 w-4 text-primary/70" />
          </div>
        ))}
      </div>
    );
  }
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
      <span className="absolute bottom-0.5 left-0.5 rounded bg-black/50 px-1 text-[8px] uppercase text-white">{stage}</span>
    </div>
  );
}

function ComplaintButton({ service, canComplain, demo, onSubmitted }: { service: RecentService; canComplain: boolean; demo?: boolean; onSubmitted: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>("quality");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (demo) { toast.success("Demo complaint noted (not saved)"); setOpen(false); return; }
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
