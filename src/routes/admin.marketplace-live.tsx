import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, XCircle, TimerReset, IndianRupee, Compass, Megaphone, UserCheck } from "lucide-react";
import {
  getLiveBroadcasts,
  getMarketplaceHealth,
  adminCancelBroadcast,
  adminExtendTimer,
  adminSetIncentive,
  adminSetRadius,
  adminRebroadcast,
  adminForceAssignBroadcast,
} from "@/lib/marketplace.functions";

export const Route = createFileRoute("/admin/marketplace-live")({
  component: MarketplaceLivePage,
});

function MarketplaceLivePage() {
  const qc = useQueryClient();
  const listFn = useServerFn(getLiveBroadcasts);
  const healthFn = useServerFn(getMarketplaceHealth);

  const liveQ = useQuery({ queryKey: ["mp-live"], queryFn: () => listFn(), refetchInterval: 5000 });
  const healthQ = useQuery({ queryKey: ["mp-health"], queryFn: () => healthFn(), refetchInterval: 10000 });

  useEffect(() => {
    const ch = supabase
      .channel("admin-mp-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "marketplace_broadcasts" }, () => {
        qc.invalidateQueries({ queryKey: ["mp-live"] });
        qc.invalidateQueries({ queryKey: ["mp-health"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "marketplace_offers" }, () => {
        qc.invalidateQueries({ queryKey: ["mp-live"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const h = healthQ.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Marketplace V2 — Live Broadcasts</h1>
        <p className="text-sm text-muted-foreground">Real-time view of every open Daily Shine broadcast with admin controls.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="Live broadcasts" value={h?.live_broadcasts ?? "—"} />
        <Stat label="Waiting (R1)" value={h?.waiting_round1 ?? "—"} />
        <Stat label="Assigned (30d)" value={h?.assigned_30d ?? "—"} />
        <Stat label="Expired (30d)" value={h?.expired_30d ?? "—"} />
        <Stat label="Cancelled (30d)" value={h?.cancelled_30d ?? "—"} />
        <Stat label="Longest wait" value={h ? formatDuration(h.longest_wait_seconds) : "—"} />
      </div>

      {liveQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (liveQ.data ?? []).length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No live broadcasts right now.</Card>
      ) : (
        <div className="space-y-3">
          {(liveQ.data ?? []).map((b: any) => <BroadcastRow key={b.id} b={b} />)}
        </div>
      )}
    </div>
  );
}

function BroadcastRow({ b }: { b: any }) {
  const qc = useQueryClient();
  const cancelFn = useServerFn(adminCancelBroadcast);
  const extendFn = useServerFn(adminExtendTimer);
  const incFn = useServerFn(adminSetIncentive);
  const radFn = useServerFn(adminSetRadius);
  const rebFn = useServerFn(adminRebroadcast);
  const forceFn = useServerFn(adminForceAssignBroadcast);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["mp-live"] });
    qc.invalidateQueries({ queryKey: ["mp-health"] });
  };

  const [inc, setInc] = useState<string>(String(b.current_incentive ?? ""));
  const [rad, setRad] = useState<string>(String(b.current_radius_m ?? ""));
  const [ext, setExt] = useState<string>("60");
  const [partnerId, setPartnerId] = useState<string>("");

  useEffect(() => {
    setInc(String(b.current_incentive ?? ""));
    setRad(String(b.current_radius_m ?? ""));
  }, [b.current_incentive, b.current_radius_m]);

  const run = (label: string, promise: Promise<any>) =>
    promise.then((r: any) => {
      if (r?.ok === false) throw new Error(r.reason || "Failed");
      toast.success(label);
      invalidate();
    }).catch((e) => toast.error(e?.message ?? `${label} failed`));

  const ageSec = Math.round((Date.now() - new Date(b.created_at).getTime()) / 1000);
  const remainingSec = Math.max(0, Math.round((new Date(b.round_expires_at).getTime() - Date.now()) / 1000));

  const v = b.vehicle;
  const vehicleLabel = v ? [v.make, v.model, v.registration_number].filter(Boolean).join(" · ") : "—";

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{b.customer?.full_name ?? "Customer"}</p>
            <Badge variant="secondary">Round {b.current_round}</Badge>
            <Badge variant="outline">{b.service_area?.name ?? "—"}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{vehicleLabel}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Waiting {formatDuration(ageSec)} · round ends in {formatDuration(remainingSec)} · ₹{b.current_incentive}/day · radius {b.current_radius_m}m
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <ControlRow icon={<IndianRupee className="h-4 w-4" />} label="Incentive ₹/day">
          <Input type="number" value={inc} onChange={(e) => setInc(e.target.value)} className="h-8" />
          <Button size="sm" variant="outline" onClick={() => run("Incentive updated", incFn({ data: { broadcastId: b.id, incentive: Number(inc) } }))}>Set</Button>
        </ControlRow>
        <ControlRow icon={<Compass className="h-4 w-4" />} label="Radius (m)">
          <Input type="number" value={rad} onChange={(e) => setRad(e.target.value)} className="h-8" />
          <Button size="sm" variant="outline" onClick={() => run("Radius updated", radFn({ data: { broadcastId: b.id, radiusM: Math.round(Number(rad)) } }))}>Set</Button>
        </ControlRow>
        <ControlRow icon={<TimerReset className="h-4 w-4" />} label="Extend timer (s)">
          <Input type="number" value={ext} onChange={(e) => setExt(e.target.value)} className="h-8" />
          <Button size="sm" variant="outline" onClick={() => run("Timer extended", extendFn({ data: { broadcastId: b.id, seconds: Math.round(Number(ext)) } }))}>Add</Button>
        </ControlRow>
        <ControlRow icon={<Megaphone className="h-4 w-4" />} label="Start a fresh round">
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => run("Rebroadcast sent", rebFn({ data: { broadcastId: b.id } }))}>Rebroadcast</Button>
        </ControlRow>
        <ControlRow icon={<UserCheck className="h-4 w-4" />} label="Force-assign partner ID">
          <Input value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="h-8" placeholder="uuid" />
          <Button size="sm" variant="outline" disabled={!partnerId} onClick={() => {
            if (!confirm("Force-assign this partner? This bypasses the offer flow.")) return;
            run("Assigned", forceFn({ data: { broadcastId: b.id, partnerId } }));
          }}>Assign</Button>
        </ControlRow>
        <ControlRow icon={<XCircle className="h-4 w-4" />} label="Cancel broadcast">
          <Button size="sm" variant="destructive" className="ml-auto" onClick={() => {
            const reason = window.prompt("Cancellation reason (optional)") ?? undefined;
            if (reason === null) return;
            run("Broadcast cancelled", cancelFn({ data: { broadcastId: b.id, reason: reason || undefined } }));
          }}>Cancel</Button>
        </ControlRow>
      </div>
    </Card>
  );
}

function ControlRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-[140px]">{icon}{label}</div>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function formatDuration(seconds: number) {
  if (!seconds || seconds < 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  const h = Math.floor(m / 60);
  if (h === 0) return `${m}m ${s}s`;
  return `${h}h ${m % 60}m`;
}
// silence unused-var warning for useMemo import
export const _unused = useMemo;
