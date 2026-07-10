import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRouteVisibility } from "@/lib/assignment.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Phone, Navigation, Play, AlertTriangle, Car, Loader2, CheckCircle2, Clock, Trophy, Wallet, MapPin, ZoomIn } from "lucide-react";
import { OfflineGuard } from "@/components/OfflineGuard";
import { formatTime12 } from "@/lib/format";
import { initiateMaskedCall } from "@/lib/calling.functions";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { LiveMap } from "@/components/LiveMap";
import { EndOfDayCard } from "@/components/EndOfDayCard";
import { TappableVehicleImage } from "@/components/VehiclePhotoViewer";
import { DarOfferCard } from "@/components/partner/DarOfferCard";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { googleMapsDirectionsUrl, openGoogleMapsDirections, validateExactGps } from "@/lib/gps";
import { logApkEvidence } from "@/lib/apkEvidence";

export const Route = createFileRoute("/_authenticated/app/live")({
  component: () => <OfflineGuard label="your live route"><RoutePage /></OfflineGuard>,
});

function RoutePage() {
  useRealtimeInvalidation(
    ["services", "assignments", "customers", "vehicles", "dirty_vehicle_reports", "unavailability_reports", "wallet_ledger", "customer_notifications", "admin_alerts"],
    [["route-today"], ["active-assignment-summary"], ["today-services-mini"], ["earnings-v3"], ["wallet-balance"]],
  );
  const { data: services } = useQuery({
    queryKey: ["route-today"],
    queryFn: async () => {
      const d = new Date().toISOString().slice(0, 10);
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data } = await supabase
        .from("services")
        .select("id,assignment_id,status,time_slot,sequence_no,started_at,completed_at,unavailable_reason,locked_position,manual_sequence_no,is_emergency,cluster_id,eta_at,travel_min,distance_km,destination_lat,destination_lng,destination_source,customers(full_name,area,address_line,phone,service_required_before,preferred_time,time_window_type,exact_time,latitude,longitude),vehicles(make,model,registration_number,color,front_image_path,parking_notes)")
        .eq("partner_id", u.user.id)
        .eq("scheduled_date", d)
        .order("sequence_no", { ascending: true });
      return data ?? [];
    },
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const visibilityFn = useServerFn(getRouteVisibility);
  const { data: visibilityInfo } = useQuery({
    queryKey: ["route-visibility-unlock"],
    queryFn: () => visibilityFn(),
    refetchInterval: 60000,
  });

  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const visibilityUnlockAt = visibilityInfo?.unlock_at ? new Date(visibilityInfo.unlock_at) : null;
  const routeUnlocked = !visibilityInfo || visibilityInfo.visible !== false;
  const unlockMsRemaining = visibilityUnlockAt ? Math.max(0, visibilityUnlockAt.getTime() - nowTs) : 0;
  const unlockHH = Math.floor(unlockMsRemaining / 3_600_000);
  const unlockMM = Math.floor((unlockMsRemaining % 3_600_000) / 60_000);
  const unlockSS = Math.floor((unlockMsRemaining % 60_000) / 1000);
  const countdownLabel = unlockHH > 0
    ? `${unlockHH}h ${String(unlockMM).padStart(2, "0")}m ${String(unlockSS).padStart(2, "0")}s`
    : `${unlockMM}m ${String(unlockSS).padStart(2, "0")}s`;
  const fmtHM = (d: Date | null) =>
    d ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
  const unlockClock = fmtHM(visibilityUnlockAt);
  const shiftClock = visibilityInfo?.shift_start ? String(visibilityInfo.shift_start).slice(0, 5) : "";
  const overrideMode = (visibilityInfo as any)?.override ?? "auto";

  const visibleServices = (services ?? []).filter((s) => s.status !== "covered_by_booking");
  const total = visibleServices.length;
  const doneList = visibleServices.filter((s) => s.status === "completed" || s.status === "unavailable");
  const completedCount = visibleServices.filter((s) => s.status === "completed").length;
  const done = doneList.length;
  const remaining = total - done;
  const isEndOfDay = total > 0 && remaining === 0;
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  const { data: rateSetting } = useQuery({
    queryKey: ["route-rate-per-car"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings").select("value").eq("key", "rate_per_car").maybeSingle();
      return Number(data?.value ?? 17);
    },
  });
  const ratePerCar = rateSetting ?? 17;
  const earnedSoFar = done * ratePerCar;
  const expectedEarnings = total * ratePerCar;

  const pendingRaw = visibleServices.filter((s) => s.status !== "completed" && s.status !== "unavailable");
  const completed = (services ?? []).filter((s) => s.status === "completed");
  const dirty = (services ?? []).filter((s) => s.status === "unavailable" && (s as any).unavailable_reason === "dirty_vehicle");
  const unavailable = (services ?? []).filter((s) => s.status === "unavailable" && (s as any).unavailable_reason !== "dirty_vehicle");

  const routeSource = (s: any) => {
    const snap = validateExactGps(s.destination_lat, s.destination_lng);
    if (snap) return { lat: snap.latitude, lng: snap.longitude, exact: true };
    return { lat: null, lng: null, exact: false };
  };

  const pending = [...pendingRaw]
    .sort((a: any, b: any) => {
      const sa = Number(a.manual_sequence_no ?? a.sequence_no ?? 9999);
      const sb = Number(b.manual_sequence_no ?? b.sequence_no ?? 9999);
      if (sa !== sb) return sa - sb;
      return String(a.eta_at ?? a.time_slot ?? a.id).localeCompare(String(b.eta_at ?? b.time_slot ?? b.id));
    })
    .map((s: any, idx: number) => {
      const gps = routeSource(s);
      return { ...s, lat: gps.lat, lng: gps.lng, routeIndex: idx + 1 };
    });

  const stops = pending
    .filter((s) => s.lat != null && s.lng != null)
    .map((s, i) => {
      const c = s.customers as any;
      return {
        id: s.id,
        sequence_no: (s as any).routeIndex ?? i + 1,
        lat: Number(s.lat),
        lng: Number(s.lng),
        label: c?.full_name ?? "Customer",
        eta: (s as any).eta_at ?? null,
        distanceKm: (s as any).distance_km ?? null,
      };
    });

  const [mapStats, setMapStats] = useState<{ km: number; mins: number } | null>(null);
  const estFinishClock = mapStats?.mins
    ? new Date(nowTs + mapStats.mins * 60_000).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase()
    : null;

  const currentStop = pending[0] ?? null;
  const currentSeq = currentStop ? (total - remaining + 1) : null;

  useEffect(() => {
    if (!services) return;
    void logApkEvidence({
      eventType: "route_loaded",
      status: "success",
      payload: {
        total,
        pending: pending.length,
        completed: completedCount,
        unavailable: unavailable.length,
        dirty: dirty.length,
        route_visible: routeUnlocked,
        first_service_id: currentStop?.id ?? null,
        first_destination: currentStop ? { lat: (currentStop as any).lat, lng: (currentStop as any).lng } : null,
      },
    });
  }, [services, total, pending.length, completedCount, unavailable.length, dirty.length, routeUnlocked, currentStop?.id]);

  const nextStop = pending[0] ?? null;
  const queueStops = pending.slice(1);

  return (
    <div className="mx-auto max-w-md px-5 pt-5 pb-10">
      <h1 className="text-2xl font-semibold tracking-tight">Today's route</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {routeUnlocked
          ? "Your daily plan, in order."
          : shiftClock
          ? `Your work starts at ${shiftClock}.`
          : "Your route will unlock before your shift starts."}
      </p>

      <div className="mt-4"><DarOfferCard /></div>

      {/* Map */}
      <div className="mt-5">
        <LiveMap
          stops={stops}
          showCustomers={pending.length > 0}
          heightClass="h-40"
          hideStats
          onStats={setMapStats}
        />
      </div>

      {/* NEXT CUSTOMER — hero */}
      {!isEndOfDay && routeUnlocked && nextStop && (
        <NextCustomerHero
          stop={nextStop}
          seqNo={currentSeq ?? 1}
          total={total}
        />
      )}

      {/* Locked / empty states */}
      {!routeUnlocked && (
        <Card className="mt-5 p-6 text-center">
          <p className="text-sm font-medium">
            {overrideMode === "hide"
              ? "Route hidden by admin"
              : unlockClock
              ? `Today's route will be available at ${unlockClock}.`
              : "Today's route unlocks soon"}
          </p>
          {shiftClock && <p className="mt-1 text-xs text-muted-foreground">Your work starts at {shiftClock}.</p>}
          {overrideMode !== "hide" && visibilityUnlockAt && unlockMsRemaining > 0 && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold tabular-nums text-primary">
              Unlocks in {countdownLabel}
            </p>
          )}
          {overrideMode === "hide" && <p className="mt-1 text-xs text-muted-foreground">Contact admin if you need access.</p>}
        </Card>
      )}

      {routeUnlocked && !isEndOfDay && pending.length === 0 && (
        <Card className="mt-5 p-6 text-center text-sm text-muted-foreground">No pending stops.</Card>
      )}

      {/* Today's Progress */}
      {total > 0 && !isEndOfDay && (
        <Card className="mt-5 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Today's progress</p>
            <p className="text-base font-semibold tabular-nums">
              {done}<span className="text-sm font-medium text-muted-foreground"> / {total} done</span>
            </p>
          </div>
          <Progress value={progressPct} className="mt-3 h-2" />
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="flex flex-col items-center gap-0.5">
              <Wallet className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold tabular-nums">₹{earnedSoFar.toLocaleString("en-IN")}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Earned</p>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <MapPin className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold tabular-nums">{mapStats ? `${mapStats.km} km` : "—"}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Left</p>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <Clock className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold tabular-nums">{estFinishClock ?? "—"}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">ETA</p>
            </div>
          </div>
        </Card>
      )}

      {/* Queue — compact rows */}
      {!isEndOfDay && routeUnlocked && queueStops.length > 0 && (
        <section className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Queue</h2>
            <span className="text-[11px] text-muted-foreground">{queueStops.length} after next</span>
          </div>
          <div className="space-y-2">
            {queueStops.map((s, idx) => (
              <QueueRow key={s.id} stop={s} seqNo={(currentSeq ?? 1) + idx + 1} total={total} />
            ))}
          </div>
        </section>
      )}

      {/* End of day success */}
      {isEndOfDay && (
        <Card className="mt-5 border-[color:var(--success)]/30 bg-[color:var(--success)]/5 p-5 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--success)]/15">
            <Trophy className="h-6 w-6 text-[color:var(--success)]" />
          </div>
          <p className="mt-3 text-lg font-semibold">All customers completed</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-semibold">{completedCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Completed</p>
            </div>
            <div>
              <p className="text-lg font-semibold">₹{earnedSoFar.toLocaleString("en-IN")}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Earned</p>
            </div>
            <div>
              <p className="text-lg font-semibold">
                {new Date(nowTs).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Finished</p>
            </div>
          </div>
          <div className="mt-4"><EndOfDayCard /></div>
        </Card>
      )}

      {/* Completed — collapsed */}
      {completed.length > 0 && (
        <CollapsibleSection title="Completed" count={completed.length} accent="success" defaultOpen={false}>
          <div className="space-y-1">
            {completed.map((s) => {
              const c = s.customers as any;
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[color:var(--success)]" />
                    <p className="truncate text-sm">{c?.full_name}</p>
                  </div>
                  <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {s.completed_at && new Date(s.completed_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* Issues — merged dirty + unavailable, collapsed */}
      {(dirty.length + unavailable.length) > 0 && (
        <CollapsibleSection
          title="Attention required"
          count={dirty.length + unavailable.length}
          accent="warning"
          defaultOpen={false}
          subtitle={
            <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
              {dirty.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-primary" /> Dirty ({dirty.length})
                </span>
              )}
              {unavailable.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/60" /> Unavailable ({unavailable.length})
                </span>
              )}
            </span>
          }
        >
          <div className="space-y-1">
            {dirty.map((s) => {
              const c = s.customers as any;
              const v = s.vehicles as any;
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-primary" />
                    <p className="truncate text-sm">{c?.full_name} <span className="text-muted-foreground">· {v?.make} {v?.model}</span></p>
                  </div>
                  <p className="shrink-0 text-[11px] font-medium text-primary">Dirty</p>
                </div>
              );
            })}
            {unavailable.map((s) => {
              const c = s.customers as any;
              const v = s.vehicles as any;
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="truncate text-sm">{c?.full_name} <span className="text-muted-foreground">· {v?.make} {v?.model}</span></p>
                  </div>
                  <p className="shrink-0 text-[11px] font-medium text-muted-foreground">Unavailable</p>
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {/* Floating "Resume route" FAB — opens Maps to next stop */}
      {!isEndOfDay && routeUnlocked && nextStop && (
        <button
          type="button"
          onClick={() => openGoogleMapsDirections((nextStop as any).lat, (nextStop as any).lng)}
          className="fixed bottom-24 right-5 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-[0_10px_30px_-6px_hsl(var(--primary)/0.6)] transition-transform active:scale-95"
          aria-label="Resume route"
        >
          <Navigation className="h-4 w-4" />
          Resume route
        </button>
      )}
    </div>
  );
}

function NextCustomerHero({ stop, seqNo, total }: { stop: any; seqNo: number; total: number }) {
  const c = stop.customers as any;
  const v = stop.vehicles as any;
  const gps = { lat: (stop as any).lat, lng: (stop as any).lng };
  const navUrl = googleMapsDirectionsUrl(gps.lat, gps.lng);
  const inProgress = stop.status === "in_progress";
  return (
    <Card className="mt-5 overflow-hidden border-2 border-primary bg-[hsl(28_100%_97%)] p-0 shadow-[0_18px_44px_-18px_hsl(var(--primary)/0.6)]">
      <div className="flex items-center justify-between gap-2 bg-primary px-4 py-2 text-primary-foreground">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Serve next</span>
        <span className="text-[11px] font-medium tabular-nums opacity-90">{seqNo} of {total}</span>
      </div>
      <div className="flex items-start gap-3 p-4">
        <TappableVehicleImage
          path={v?.front_image_path}
          className="h-[80px] w-[80px] shrink-0 rounded-xl"
          alt={`${v?.make ?? ""} ${v?.model ?? ""}`}
          customerName={c?.full_name}
          vehicleLabel={`${v?.make ?? ""} ${v?.model ?? ""}`.trim()}
          registration={v?.registration_number}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-bold leading-tight">{c?.full_name ?? "Customer"}</p>
          <p className="mt-1 truncate text-sm text-foreground/80">
            <Car className="mr-1 inline h-3.5 w-3.5" />{v?.make} {v?.model}
          </p>
          {v?.registration_number && (
            <span className="mt-1 inline-block rounded-md border-2 border-foreground/80 bg-yellow-50 px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wider text-foreground">
              {v.registration_number}
            </span>
          )}
          {(c?.service_required_before || c?.preferred_time) && (
            <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
              <Clock className="h-3 w-3" /> Before {formatTime12(c?.service_required_before ?? c?.preferred_time)}
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-[1fr_1fr_2.2fr] gap-2 border-t border-primary/20 bg-background/60 p-3">
        <IconAction
          icon={<Navigation className="h-5 w-5" />}
          ariaLabel="Open maps"
          disabled={!navUrl}
          onClick={async () => {
            await logApkEvidence({
              eventType: "navigation_open_attempt",
              serviceId: stop.id,
              assignmentId: stop.assignment_id ?? null,
              status: navUrl ? "info" : "blocked",
              payload: { destination_lat: gps.lat, destination_lng: gps.lng, destination_source: stop.destination_source ?? null, customer_name: c?.full_name ?? null },
            });
            const opened = await openGoogleMapsDirections(gps.lat, gps.lng);
            await logApkEvidence({
              eventType: "navigation_open_result",
              serviceId: stop.id,
              assignmentId: stop.assignment_id ?? null,
              status: opened ? "success" : "error",
              payload: { opened, destination_lat: gps.lat, destination_lng: gps.lng },
            });
          }}
        />
        <HeroCallIconAction serviceId={stop.id} />
        <Link
          to="/app/service/$id"
          params={{ id: stop.id }}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-bold uppercase tracking-wide text-primary-foreground shadow-md transition-colors hover:bg-primary/90"
        >
          <Play className="h-5 w-5 fill-current" />
          <span>{inProgress ? "Resume" : "Start"}</span>
        </Link>
      </div>
    </Card>
  );
}

function IconAction({ icon, ariaLabel, onClick, disabled }: { icon: React.ReactNode; ariaLabel: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="grid h-11 place-items-center rounded-lg border border-border/60 bg-background text-foreground shadow-sm transition-colors hover:bg-muted/40 disabled:opacity-50"
    >
      {icon}
    </button>
  );
}

function HeroCallIconAction({ serviceId }: { serviceId: string }) {
  const call = useServerFn(initiateMaskedCall);
  const [loading, setLoading] = useState(false);
  const onClick = async () => {
    setLoading(true);
    try {
      const r = await call({ data: { service_id: serviceId } });
      toast.success(r.message ?? "Connecting...");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not place call");
    } finally {
      setLoading(false);
    }
  };
  return (
    <IconAction
      icon={loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Phone className="h-5 w-5" />}
      ariaLabel="Call customer"
      onClick={onClick}
    />
  );
}


function QueueRow({ stop, seqNo, total }: { stop: any; seqNo: number; total: number }) {
  const c = stop.customers as any;
  const v = stop.vehicles as any;
  const gps = { lat: (stop as any).lat, lng: (stop as any).lng };
  const navUrl = googleMapsDirectionsUrl(gps.lat, gps.lng);
  const inProgress = stop.status === "in_progress";
  return (
    <Card className="flex items-center gap-2.5 p-2">
      <div className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground w-7 text-center">
        #{seqNo}
      </div>
      <TappableVehicleImage
        path={v?.front_image_path}
        className="h-10 w-10 shrink-0 rounded-md"
        alt={`${v?.make ?? ""} ${v?.model ?? ""}`}
        customerName={c?.full_name}
        vehicleLabel={`${v?.make ?? ""} ${v?.model ?? ""}`.trim()}
        registration={v?.registration_number}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{c?.full_name ?? "Customer"}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {v?.make} {v?.model} · {v?.registration_number}
        </p>
        {(c?.service_required_before || c?.preferred_time) && (
          <p className="truncate text-[10px] text-primary">
            Before {formatTime12(c?.service_required_before ?? c?.preferred_time)}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          disabled={!navUrl}
          onClick={() => openGoogleMapsDirections(gps.lat, gps.lng)}
          className="grid h-9 w-9 place-items-center rounded-full border border-border/60 bg-background text-foreground/80 shadow-sm transition-colors hover:bg-muted/40 disabled:opacity-40"
          aria-label="Open maps"
        >
          <Navigation className="h-4 w-4" />
        </button>
        <Link
          to="/app/service/$id"
          params={{ id: stop.id }}
          className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          aria-label={inProgress ? "Resume service" : "Start service"}
        >
          <Play className="h-4 w-4 fill-current" />
        </Link>
      </div>
    </Card>
  );
}

function CollapsibleSection({
  title,
  count,
  children,
  defaultOpen,
  accent,
  subtitle,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accent?: "success" | "warning";
  subtitle?: React.ReactNode;
}) {
  const dot =
    accent === "success"
      ? "bg-[color:var(--success)]"
      : accent === "warning"
      ? "bg-primary"
      : "bg-muted-foreground";
  return (
    <details className="group mt-4 rounded-lg border border-border/60 bg-background" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
          <p className="text-sm font-semibold">{title}</p>
          <span className="text-xs text-muted-foreground">({count})</span>
        </div>
        <div className="flex items-center gap-2">
          {subtitle}
          <span className="text-xs text-muted-foreground transition-transform group-open:rotate-180">▾</span>
        </div>
      </summary>
      <div className="border-t border-border/60 px-2 py-2">{children}</div>
    </details>
  );
}


export function MaskedCallButton({ serviceId, compact, full, size }: { serviceId: string; compact?: boolean; full?: boolean; size?: "sm" | "default" | "lg" }) {
  const call = useServerFn(initiateMaskedCall);
  const [loading, setLoading] = useState(false);
  const onClick = async () => {
    setLoading(true);
    try {
      const r = await call({ data: { service_id: serviceId } });
      toast.success(r.message ?? "Connecting...");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not place call");
    } finally {
      setLoading(false);
    }
  };
  if (compact) {
    return (
      <Button size="sm" variant="outline" onClick={onClick} disabled={loading} aria-label="Call Customer">
        {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Phone className="mr-1.5 h-4 w-4" />}Call
      </Button>
    );
  }
  return (
    <Button variant="outline" size={size ?? (full ? "lg" : "sm")} className={full ? "w-full" : ""} onClick={onClick} disabled={loading}>
      {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Phone className="mr-1.5 h-4 w-4" />}
      {full ? " Call Customer" : "Call"}
    </Button>
  );
}

