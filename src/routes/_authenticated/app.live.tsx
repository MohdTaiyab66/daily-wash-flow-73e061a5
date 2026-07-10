import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRouteVisibility } from "@/lib/assignment.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Phone, Navigation, Play, AlertTriangle, Car, Loader2, CheckCircle2, Clock, MapPin, IndianRupee, Trophy } from "lucide-react";
import { OfflineGuard } from "@/components/OfflineGuard";
import { formatTime12 } from "@/lib/format";
import { initiateMaskedCall } from "@/lib/calling.functions";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { LiveMap } from "@/components/LiveMap";
import { EndOfDayCard } from "@/components/EndOfDayCard";
import { VehicleImage } from "@/components/VehicleImage";
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
    ? new Date(nowTs + mapStats.mins * 60_000).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
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

      {/* Map — reduced height (~20%) */}
      <div className="mt-5">
        <LiveMap
          stops={stops}
          showCustomers={pending.length > 0}
          heightClass="h-44"
          hideStats
          onStats={setMapStats}
        />
      </div>

      {/* Today's Progress */}
      {total > 0 && (
        <Card className="mt-4 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Today's progress</p>
            <p className="text-base font-semibold tabular-nums">{done} <span className="text-sm font-medium text-muted-foreground">of {total} completed</span></p>
          </div>
          <Progress value={progressPct} className="mt-3 h-2" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniStat icon={<Car className="h-4 w-4" />} label="Remaining" value={`${remaining}`} />
            <MiniStat icon={<IndianRupee className="h-4 w-4" />} label="Earned" value={`₹${earnedSoFar.toLocaleString("en-IN")}`} />
            <MiniStat icon={<MapPin className="h-4 w-4" />} label="Distance left" value={mapStats ? `${mapStats.km} km` : "—"} />
            <MiniStat icon={<Clock className="h-4 w-4" />} label="Finish by" value={estFinishClock ?? (mapStats ? `~${mapStats.mins}m` : "—")} />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Today's target · ₹{expectedEarnings.toLocaleString("en-IN")}
          </p>
        </Card>
      )}

      {/* End of day success state */}
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

      {/* Pending stops */}
      {!isEndOfDay && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold tracking-tight">
            Remaining customers {routeUnlocked && pending.length > 0 && <span className="text-muted-foreground">({pending.length})</span>}
          </h2>
          <div className="mt-3 space-y-4">
            {!routeUnlocked && (
              <Card className="p-6 text-center">
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
            {routeUnlocked && pending.length === 0 && (
              <Card className="p-6 text-center text-sm text-muted-foreground">No pending stops.</Card>
            )}
            {routeUnlocked && pending.map((s, idx) => {
              const isNext = idx === 0;
              const c = s.customers as any;
              const v = s.vehicles as any;
              const gps = { lat: (s as any).lat, lng: (s as any).lng };
              const navUrl = googleMapsDirectionsUrl(gps.lat, gps.lng);
              const inProgress = s.status === "in_progress";
              const seqNo = currentSeq ? currentSeq + idx : (s as any).routeIndex;
              return (
                <Card
                  key={s.id}
                  className={`overflow-hidden p-0 ${isNext ? "border-2 border-primary bg-[hsl(28_100%_97%)] shadow-[0_14px_36px_-14px_hsl(var(--primary)/0.55)]" : ""}`}
                >
                  <ZoomableVehicleImage
                    path={v?.front_image_path}
                    className={`${isNext ? "h-28" : "h-24"} w-full`}
                    alt={`${v?.make} ${v?.model}`}
                  />
                  <div className={isNext ? "p-4" : "p-3"}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {isNext && (
                            <Badge className="bg-primary uppercase tracking-wider text-primary-foreground hover:bg-primary">Next customer</Badge>
                          )}
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {seqNo} of {total}
                          </span>
                        </div>
                        <p className={`mt-1.5 truncate font-semibold ${isNext ? "text-lg" : "text-base"}`}>
                          {c?.full_name ?? "Customer"}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          <Car className="mr-1 inline h-3 w-3" />{v?.make} {v?.model}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{v?.registration_number}</p>
                        {(c?.service_required_before || c?.preferred_time) && (
                          <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            <Clock className="h-3 w-3" /> Before {formatTime12(c?.service_required_before ?? c?.preferred_time)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className={`mt-3 grid gap-2 ${isNext ? "grid-cols-[1fr_1fr_1.4fr]" : "grid-cols-3"}`}>
                      <Button
                        type="button"
                        size={isNext ? "default" : "sm"}
                        variant="outline"
                        disabled={!navUrl}
                        onClick={async () => {
                          await logApkEvidence({
                            eventType: "navigation_open_attempt",
                            serviceId: s.id,
                            assignmentId: (s as any).assignment_id ?? null,
                            status: navUrl ? "info" : "blocked",
                            payload: {
                              destination_lat: gps.lat,
                              destination_lng: gps.lng,
                              destination_source: (s as any).destination_source ?? null,
                              customer_name: c?.full_name ?? null,
                            },
                          });
                          const opened = await openGoogleMapsDirections(gps.lat, gps.lng);
                          await logApkEvidence({
                            eventType: "navigation_open_result",
                            serviceId: s.id,
                            assignmentId: (s as any).assignment_id ?? null,
                            status: opened ? "success" : "error",
                            payload: { opened, destination_lat: gps.lat, destination_lng: gps.lng },
                          });
                        }}
                        aria-label={navUrl ? "Open Maps" : "Location unavailable"}
                      >
                        <Navigation className="mr-1.5 h-4 w-4" />Open Maps
                      </Button>
                      <MaskedCallButton serviceId={s.id} size={isNext ? "default" : "sm"} />
                      <Button asChild size={isNext ? "default" : "sm"} className={isNext ? "bg-primary shadow-sm" : ""}>
                        <Link to="/app/service/$id" params={{ id: s.id }}>
                          <Play className="mr-1.5 h-4 w-4" />
                          {inProgress ? "Resume" : "Start service"}
                        </Link>
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Completed today */}
      {completed.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Completed today</h2>
          <div className="mt-3 space-y-2">
            {completed.map((s) => {
              const c = s.customers as any;
              const v = s.vehicles as any;
              return (
                <Card key={s.id} className="flex items-center gap-3 border-l-4 border-l-[color:var(--success)] bg-[color:var(--success)]/5 p-2.5">
                  <VehicleImage path={v?.front_image_path} className="h-11 w-11 shrink-0 rounded-md" alt={`${v?.make ?? ""} ${v?.model ?? ""}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c?.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{v?.make} {v?.model} · {v?.registration_number}</p>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--success)]">
                      <CheckCircle2 className="h-3 w-3" />
                      Completed {s.completed_at && new Date(s.completed_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Dirty vehicles today */}
      {dirty.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Dirty vehicles today</h2>
          <div className="mt-3 space-y-2">
            {dirty.map((s) => {
              const c = s.customers as any;
              const v = s.vehicles as any;
              return (
                <Card key={s.id} className="flex items-center gap-3 border-l-4 border-l-primary bg-primary/5 p-3">
                  <VehicleImage path={v?.front_image_path} className="h-12 w-12 shrink-0 rounded-md" alt={`${v?.make ?? ""} ${v?.model ?? ""}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c?.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{v?.make} {v?.model} · {v?.registration_number}</p>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                      <AlertTriangle className="h-3 w-3" /> Dirty · ₹12 credited
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Unavailable today */}
      {unavailable.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Unavailable today</h2>
          <div className="mt-3 space-y-2">
            {unavailable.map((s) => {
              const c = s.customers as any;
              const v = s.vehicles as any;
              return (
                <Card key={s.id} className="flex items-center gap-3 border-l-4 border-l-muted-foreground/40 bg-muted/40 p-3">
                  <VehicleImage path={v?.front_image_path} className="h-12 w-12 shrink-0 rounded-md" alt={`${v?.make ?? ""} ${v?.model ?? ""}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c?.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{v?.make} {v?.model} · {v?.registration_number}</p>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                      <AlertTriangle className="h-3 w-3" /> Unavailable · ₹12 credited
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-background text-primary">{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
        <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
    </div>
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

function ZoomableVehicleImage({ path, className, alt }: { path?: string | null; className?: string; alt?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => path && setOpen(true)} className={`block w-full p-0 ${path ? "cursor-zoom-in" : "cursor-default"}`} aria-label="View vehicle photo">
        <VehicleImage path={path} className={className} alt={alt} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <VehicleImage path={path} className="h-auto max-h-[80vh] w-full" alt={alt} />
        </DialogContent>
      </Dialog>
    </>
  );
}
