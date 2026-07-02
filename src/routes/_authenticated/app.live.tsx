import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MapPin, Phone, Navigation, Play, AlertTriangle, Clock, Car, Loader2, CheckCircle2 } from "lucide-react";
import { OfflineGuard } from "@/components/OfflineGuard";
import { formatTime12 } from "@/lib/format";
import { initiateMaskedCall } from "@/lib/calling.functions";
import { toast } from "sonner";
import { useState } from "react";
import { LiveMap } from "@/components/LiveMap";
import { EndOfDayCard } from "@/components/EndOfDayCard";
import { VehicleImage } from "@/components/VehicleImage";
import { DarOfferCard } from "@/components/partner/DarOfferCard";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { googleMapsDirectionsUrl, gpsLabel, validateExactGps } from "@/lib/gps";

export const Route = createFileRoute("/_authenticated/app/live")({
  component: () => <OfflineGuard label="your live route"><RoutePage /></OfflineGuard>,
});

function RoutePage() {
  useRealtimeInvalidation(["services", "assignments", "customers", "vehicles"], [["route-today"], ["active-assignment-summary"], ["today-services-mini"]]);
  const { data: services } = useQuery({
    queryKey: ["route-today"],
    queryFn: async () => {
      const d = new Date().toISOString().slice(0, 10);
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data } = await supabase
        .from("services")
        .select("id,status,time_slot,sequence_no,started_at,completed_at,unavailable_reason,locked_position,manual_sequence_no,is_emergency,cluster_id,eta_at,travel_min,distance_km,destination_lat,destination_lng,destination_source,customers(full_name,area,address_line,phone,service_required_before,preferred_time,time_window_type,exact_time,latitude,longitude),vehicles(make,model,registration_number,color,front_image_path,parking_notes)")
        .eq("partner_id", u.user.id)
        .eq("scheduled_date", d)
        .order("sequence_no", { ascending: true });
      return data ?? [];
    },
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const { data: visibilitySetting } = useQuery({
    queryKey: ["route-visibility-until"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "route_visibility_until")
        .maybeSingle();
      // value is jsonb, e.g. "10:00" or "all_day"
      const v = data?.value;
      return (typeof v === "string" ? v : (v as any)) ?? "10:00";
    },
  });

  const total = services?.length ?? 0;
  const doneList = (services ?? []).filter((s) => s.status === "completed" || s.status === "unavailable");
  const completedCount = (services ?? []).filter((s) => s.status === "completed").length;
  const done = doneList.length;
  const remaining = total - done;
  const isEndOfDay = total > 0 && remaining === 0;

  // Rate for expected earnings — reuse same platform setting as builder.
  const { data: rateSetting } = useQuery({
    queryKey: ["route-rate-per-car"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings").select("value").eq("key", "rate_per_car").maybeSingle();
      return Number(data?.value ?? 17);
    },
  });
  const ratePerCar = rateSetting ?? 17;
  const expectedEarnings = total * ratePerCar;
  const remainingEarnings = remaining * ratePerCar;

  // Route visibility window
  const now = new Date();
  const cutoff = String(visibilitySetting ?? "10:00");
  let routeVisible = true;
  if (cutoff !== "all_day") {
    const [hh, mm] = cutoff.split(":").map(Number);
    const cutoffMins = (hh || 10) * 60 + (mm || 0);
    const nowMins = now.getHours() * 60 + now.getMinutes();
    routeVisible = nowMins < cutoffMins;
  }

  const pendingRaw = (services ?? []).filter((s) => s.status !== "completed" && s.status !== "unavailable");
  const completed = (services ?? []).filter((s) => s.status === "completed");
  const dirty = (services ?? []).filter((s) => s.status === "unavailable" && (s as any).unavailable_reason === "dirty_vehicle");
  const unavailable = (services ?? []).filter((s) => s.status === "unavailable" && (s as any).unavailable_reason !== "dirty_vehicle");

  // Source of truth: the saved Route Manager order on services.sequence_no/manual_sequence_no.
  // Never re-optimise in the partner app because that can diverge from the approved route.
  const routeSource = (s: any) => {
    const snap = validateExactGps(s.destination_lat, s.destination_lng);
    if (snap) return { lat: snap.latitude, lng: snap.longitude, exact: true };
    const customer = validateExactGps((s.customers as any)?.latitude, (s.customers as any)?.longitude);
    return customer ? { lat: customer.latitude, lng: customer.longitude, exact: true } : { lat: null, lng: null, exact: false };
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

  const currentStop = pending[0] ?? null;
  const nextStop = pending[1] ?? null;
  const distanceRemaining = (pending ?? []).reduce((sum: number, s: any) => sum + Number(s.distance_km || 0), 0);
  const estimatedFinish = (() => {
    const lastEta = pending.map((s: any) => s.eta_at).filter(Boolean).at(-1);
    if (lastEta) return new Date(lastEta).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (!pending.length) return "Done";
    const mins = pending.length * 12 + Math.round(distanceRemaining * 3);
    return new Date(Date.now() + mins * 60000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  })();

  return (
    <div className="mx-auto max-w-md px-5 pt-5 pb-10">
      <h1 className="text-2xl font-semibold tracking-tight">Today's route</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {routeVisible ? "Saved Route Manager sequence with exact customer GPS." : `Route hidden after ${formatTime12(cutoff)}.`}
      </p>

      <div className="mt-4"><DarOfferCard /></div>

      <div className="mt-5">
        <LiveMap stops={stops} showCustomers={pending.length > 0} />
        <Card className="mt-3 p-3">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today's route</p>
            <p className="text-lg font-semibold tabular-nums">{total} cars</p>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <KPI label="Completed" value={String(completedCount)} />
            <KPI label="Remaining" value={String(remaining)} />
            <KPI label="Est. earnings" value={`₹${expectedEarnings.toLocaleString("en-IN")}`} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-center">
            <KPI label="Current stop" value={currentStop ? `#1` : "—"} />
            <KPI label="Next stop" value={nextStop ? `#2` : "—"} />
            <KPI label="Distance left" value={distanceRemaining ? `${distanceRemaining.toFixed(1)} km` : "—"} />
            <KPI label="Est. finish" value={estimatedFinish} />
            <KPI label="Expected left" value={`₹${remainingEarnings.toLocaleString("en-IN")}`} />
            <KPI label="Done/Total" value={`${done}/${total}`} />
          </div>
        </Card>
      </div>

      {isEndOfDay && <div className="mt-5"><EndOfDayCard /></div>}

      {/* Pending stops */}
      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pending</h2>
      <div className="mt-3 space-y-3">
        {pending.length === 0 && !isEndOfDay && (
          <Card className="p-6 text-center text-sm text-muted-foreground">No pending stops.</Card>
        )}
        {!routeVisible && pending.length > 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Route is hidden until tomorrow. Contact admin if you need access.
          </Card>
        )}
        {routeVisible && pending.map((s, idx) => {
          const c = s.customers as any;
          const v = s.vehicles as any;
          const gps = { lat: (s as any).lat, lng: (s as any).lng };
          const navUrl = googleMapsDirectionsUrl(gps.lat, gps.lng);
          const cutoffTime = c?.service_required_before ?? c?.preferred_time;
          const isExact = (c?.time_window_type ?? "soft") === "exact";
          const isEmergency = !!(s as any).is_emergency;
          const isLocked = !!(s as any).locked_position;
          const priority = isExact || isEmergency;
          const prevCluster = idx > 0 ? (pending[idx - 1] as any).cluster_id ?? (pending[idx - 1].customers as any)?.area : null;
          const currCluster = (s as any).cluster_id ?? c?.area;
          const showClusterHeader = idx === 0 || prevCluster !== currCluster;
          return (
            <div key={s.id}>
              {showClusterHeader && (
                <p className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {currCluster ?? "Cluster"}
                </p>
              )}
              <Card className="overflow-hidden p-0">
                <ZoomableVehicleImage path={v?.front_image_path} className="h-32 w-full" alt={`${v?.make} ${v?.model}`} />
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`grid h-9 w-9 place-items-center rounded-full text-sm font-semibold ${priority ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground"}`}>
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium">#{idx + 1} · {c?.full_name ?? "Customer"}</p>
                        <div className="flex items-center gap-1">
                          {isEmergency && <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive">Emergency</Badge>}
                          {isLocked && <Badge variant="outline" className="text-[10px]">Locked</Badge>}
                          {isExact ? (
                            <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive">Exact time</Badge>
                          ) : cutoffTime ? (
                            <Badge variant="outline" className="text-[10px]">Prefers {formatTime12(cutoffTime)}</Badge>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        <Car className="mr-1 inline h-3 w-3" />{v?.make} {v?.model} · {v?.color} · {v?.registration_number}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        <MapPin className="mr-1 inline h-3 w-3" />
                        {c?.area ?? "Location unavailable"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <Clock className="mr-1 inline h-3 w-3" />
                        {isExact ? `Exact · ${formatTime12(c?.exact_time ?? cutoffTime)}` : cutoffTime ? `Before ${formatTime12(cutoffTime)}` : "Flexible"}
                      </p>
                    </div>
                  </div>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  <Button asChild={!!navUrl} size="sm" variant="outline" className="col-span-1" disabled={!navUrl}>
                    {navUrl ? <a href={navUrl} target="_blank" rel="noreferrer" aria-label="Navigate"><Navigation className="h-4 w-4" /></a> : <span aria-label="Location unavailable"><Navigation className="h-4 w-4" /></span>}
                  </Button>
                  <MaskedCallButton serviceId={s.id} compact />
                  <Button asChild size="sm" className="col-span-2">
                    <Link to="/app/service/$id" params={{ id: s.id }}>
                      {s.status === "in_progress" ? <><AlertTriangle className="mr-1.5 h-4 w-4" />Continue</> : <><Play className="mr-1.5 h-4 w-4" />Start Service</>}
                    </Link>
                  </Button>
                  </div>
                </div>
              </Card>
            </div>
          );
        })}
      </div>

      {/* Completed today */}
      {completed.length > 0 && (
        <>
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Completed today</h2>
          <div className="mt-3 space-y-2">
            {completed.map((s) => {
              const c = s.customers as any;
              const v = s.vehicles as any;
              const dur = s.started_at && s.completed_at
                ? Math.max(1, Math.round((+new Date(s.completed_at) - +new Date(s.started_at)) / 60000))
                : null;
              return (
                <Card key={s.id} className="flex items-center gap-3 p-3">
                  <VehicleImage path={v?.front_image_path} className="h-12 w-12 shrink-0 rounded-md" alt={`${v?.make ?? ""} ${v?.model ?? ""}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c?.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{v?.make} {v?.model} · {v?.registration_number}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      <CheckCircle2 className="mr-1 inline h-3 w-3 text-[color:var(--success)]" />
                      {s.completed_at && new Date(s.completed_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      {dur != null && ` · ${dur} min`}
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {dirty.length > 0 && (
        <>
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Dirty vehicles today</h2>
          <div className="mt-3 space-y-2">
            {dirty.map((s) => {
              const c = s.customers as any;
              const v = s.vehicles as any;
              return (
                <Card key={s.id} className="flex items-center gap-3 p-3">
                  <VehicleImage path={v?.front_image_path} className="h-12 w-12 shrink-0 rounded-md" alt={`${v?.make ?? ""} ${v?.model ?? ""}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c?.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{v?.make} {v?.model} · {v?.registration_number}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      <AlertTriangle className="mr-1 inline h-3 w-3 text-destructive" />Dirty vehicle · ₹12 credited
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {unavailable.length > 0 && (
        <>
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Unavailable today</h2>
          <div className="mt-3 space-y-2">
            {unavailable.map((s) => {
              const c = s.customers as any;
              const v = s.vehicles as any;
              return (
                <Card key={s.id} className="flex items-center gap-3 p-3">
                  <VehicleImage path={v?.front_image_path} className="h-12 w-12 shrink-0 rounded-md" alt={`${v?.make ?? ""} ${v?.model ?? ""}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c?.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{v?.make} {v?.model} · {v?.registration_number}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      <AlertTriangle className="mr-1 inline h-3 w-3 text-destructive" />Unavailable · ₹12 credited
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function MaskedCallButton({ serviceId, compact, full }: { serviceId: string; compact?: boolean; full?: boolean }) {
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
      <Button size="sm" variant="outline" className="col-span-1" onClick={onClick} disabled={loading} aria-label="Call Customer">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
      </Button>
    );
  }
  return (
    <Button variant="outline" size={full ? "lg" : "sm"} className={full ? "w-full" : ""} onClick={onClick} disabled={loading}>
      {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Phone className="mr-1.5 h-4 w-4" />} Call Customer
    </Button>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-3">
      <p className="text-xl font-semibold">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
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
