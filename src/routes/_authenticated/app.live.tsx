import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRouteVisibility } from "@/lib/assignment.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Phone, Navigation, Play, AlertTriangle, Car, Loader2, CheckCircle2, Clock, Trophy, Wallet, MapPin, ZoomIn, Lock, Sparkles, ChevronDown } from "lucide-react";
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
import { useTodayAssignment } from "@/hooks/use-today-assignment";
import { TodayAssignmentStatus } from "@/components/partner/TodayAssignmentStatus";
import { googleMapsDirectionsUrl, openGoogleMapsDirections, validateExactGps } from "@/lib/gps";
import { saveRouteSnapshot, loadRouteSnapshot, isOnline } from "@/lib/offline-progress-cache";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/live")({
  component: () => <OfflineGuard label="your live route"><RoutePage /></OfflineGuard>,
});

function RoutePage() {
  useRealtimeInvalidation(
    ["services", "assignments", "customers", "vehicles", "dirty_vehicle_reports", "unavailability_reports", "wallet_ledger", "customer_notifications", "admin_alerts"],
    [["route-today"], ["today-assignment"], ["today-assignment"], ["earnings-v3"], ["wallet-balance"]],
  );
  
  const todayDateStr = new Date().toISOString().slice(0, 10);
  const { data: services } = useQuery({
    queryKey: ["route-today"],
    queryFn: async () => {
      const d = todayDateStr;
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return loadRouteSnapshot<any[]>("today", d) ?? [];
      const { data, error } = await supabase
        .from("services")
        .select("id,assignment_id,status,time_slot,sequence_no,started_at,completed_at,unavailable_reason,locked_position,manual_sequence_no,is_emergency,cluster_id,eta_at,travel_min,distance_km,destination_lat,destination_lng,destination_source,customers(full_name,area,address_line,phone,service_required_before,preferred_time,time_window_type,exact_time,latitude,longitude),vehicles(make,model,registration_number,color,front_image_path,parking_notes)")
        .eq("partner_id", u.user.id)
        .eq("scheduled_date", d)
        .order("sequence_no", { ascending: true });
      if (error) {
        const cached = loadRouteSnapshot<any[]>("today", d);
        if (cached) return cached;
        throw error;
      }
      const rows = data ?? [];
      saveRouteSnapshot("today", d, rows);
      return rows;
    },
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const todayQuery = useTodayAssignment();
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

  const routeUnlocked = !visibilityInfo || visibilityInfo.visible !== false;
  
  const visibleServices = (services ?? []).filter((s) => s.status !== "covered_by_booking");
  const total = visibleServices.length;
  const doneList = visibleServices.filter((s) => s.status === "completed" || s.status === "unavailable");
  const completedCount = visibleServices.filter((s) => s.status === "completed").length;
  const done = doneList.length;
  const isEndOfDay = total > 0 && (total - done) === 0;
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

  const pendingRaw = visibleServices.filter((s) => s.status !== "completed" && s.status !== "unavailable");
  const completed = (services ?? []).filter((s) => s.status === "completed");
  const dirty = (services ?? []).filter((s) => s.status === "unavailable" && (s as any).unavailable_reason === "dirty_vehicle");
  const unavailable = (services ?? []).filter((s) => s.status === "unavailable" && (s as any).unavailable_reason !== "dirty_vehicle");

  const pending = [...pendingRaw]
    .sort((a: any, b: any) => {
      const sa = Number(a.manual_sequence_no ?? a.sequence_no ?? 9999);
      const sb = Number(b.manual_sequence_no ?? b.sequence_no ?? 9999);
      if (sa !== sb) return sa - sb;
      return String(a.eta_at ?? a.time_slot ?? a.id).localeCompare(String(b.eta_at ?? b.time_slot ?? b.id));
    })
    .map((s: any, idx: number) => {
      const snap = validateExactGps(s.destination_lat, s.destination_lng);
      return { ...s, lat: snap?.latitude ?? null, lng: snap?.longitude ?? null, routeIndex: idx + 1 };
    });

  const activeNext = pending[0] ?? null;
  const activeQueue = pending.slice(1);
  const stops = pending
    .filter((s) => s.lat != null && s.lng != null)
    .map((s, i) => ({
      id: s.id,
      sequence_no: (s as any).routeIndex ?? i + 1,
      lat: Number(s.lat),
      lng: Number(s.lng),
      label: (s.customers as any)?.full_name ?? "Customer",
      eta: (s as any).eta_at ?? null,
      distanceKm: (s as any).distance_km ?? null,
    }));

  const [mapStats, setMapStats] = useState<{ km: number; mins: number } | null>(null);

  return (
    <div className="mx-auto max-w-md pb-32">
      {/* Header */}
      <header className="px-5 pt-5 pb-3">
        <h1 className="text-3xl font-black text-black tracking-tight">Daily Route</h1>
        <p className="text-lg font-medium text-muted-foreground">Your work sequence for today</p>
      </header>

      {/* Progress Card */}
      <div className="px-5">
        <Card className="p-4 shadow-sm">
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Today's Progress</h3>
            <span className="text-sm font-semibold">{done} / {total} Completed</span>
          </div>
          <Progress value={progressPct} className="h-2 mb-4" />
          <div className="flex justify-between items-center text-center">
            <div>
              <p className="text-lg font-black">₹{earnedSoFar.toLocaleString("en-IN")}</p>
              <p className="text-[10px] uppercase text-muted-foreground">Earned</p>
            </div>
            <div>
              <p className="text-lg font-black">{done}</p>
              <p className="text-[10px] uppercase text-muted-foreground">Completed</p>
            </div>
            <div>
              <p className="text-lg font-black">{total - done}</p>
              <p className="text-[10px] uppercase text-muted-foreground">Remaining</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Map */}
      <div className="px-5 mt-5">
        <div className="rounded-3xl overflow-hidden h-64">
           <LiveMap
              stops={stops}
              showCustomers={stops.length > 0}
              heightClass="h-full"
              hideStats
              onStats={setMapStats}
            />
        </div>
      </div>

      {/* Primary Next Customer Card */}
      <div className="px-5 mt-5">
        {activeNext && !isEndOfDay && routeUnlocked && (
          <NextCustomerHero stop={activeNext} seqNo={1} total={total} />
        )}
      </div>

      {/* Up Next List */}
      {activeQueue.length > 0 && !isEndOfDay && (
        <div className="px-5 mt-6">
           <div className="flex justify-between items-baseline mb-3">
             <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Up Next</h2>
             <span className="text-[11px] font-semibold text-muted-foreground">{activeQueue.length} Remaining</span>
           </div>
           <div className="space-y-3">
             {activeQueue.map((s, i) => (
                <CompactQueueRow key={s.id} stop={s} seqNo={i + 2} />
             ))}
           </div>
        </div>
      )}

      {/* Completed Section */}
      {completed.length > 0 && (
         <div className="px-5 mt-6">
            <details className="group border-t border-b border-border py-4">
               <summary className="flex justify-between items-center cursor-pointer list-none">
                  <h2 className="text-sm font-bold">Completed ({completed.length})</h2>
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
               </summary>
               <div className="pt-4 space-y-3">
                  {completed.map(s => (
                    <div key={s.id} className="flex justify-between text-sm">
                       <span>{(s.customers as any)?.full_name}</span>
                       <span className="text-emerald-600 font-medium">✓ Done</span>
                    </div>
                  ))}
               </div>
            </details>
         </div>
      )}

    </div>
  );
}

function NextCustomerHero({ stop, seqNo, total }: { stop: any; seqNo: number; total: number }) {
  const c = stop.customers as any;
  const v = stop.vehicles as any;
  const rate = Number(stop.rate_per_car ?? 17);
  const time = c?.service_required_before ?? c?.preferred_time ?? stop.time_slot;
  const inProgress = stop.status === "in_progress";

  return (
    <Card className="p-4 bg-black text-white rounded-3xl">
      <div className="flex justify-between items-center mb-4">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Next Customer • {seqNo} of {total}</span>
      </div>
      <div className="flex gap-4 mb-5">
        <TappableVehicleImage path={v?.front_image_path} className="h-20 w-20 rounded-xl" />
        <div>
          <p className="text-lg font-bold">{c?.full_name}</p>
          <p className="text-sm text-white/70">{v?.make} {v?.model}</p>
          <span className="text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded">{v?.registration_number}</span>
        </div>
      </div>
      <div className="flex justify-between items-center">
        <div>
           <p className="text-[10px] uppercase text-white/50">Time Window</p>
           <p className="text-sm font-bold">{formatTime12(time)}</p>
        </div>
        <div className="text-right">
           <p className="text-[10px] uppercase text-white/50">Earning</p>
           <p className="text-sm font-bold text-[#FF6B00]">+₹{rate}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-5">
        <MaskedCallButton serviceId={stop.id} full />
        <Link
            to="/app/service/$id"
            params={{ id: stop.id }}
            className="flex items-center justify-center gap-2 rounded-full bg-[#FF6B00] text-white font-bold hover:bg-[#ff8c40] px-3 py-2 text-sm"
          >
            <Play className="h-4 w-4 fill-current" />
            <span>{inProgress ? "Resume" : "Start Service"}</span>
        </Link>
      </div>
    </Card>
  );
}

function CompactQueueRow({ stop, seqNo }: { stop: any; seqNo: number }) {
  const c = stop.customers as any;
  const time = c?.service_required_before ?? c?.preferred_time ?? stop.time_slot;
  return (
    <div className="flex items-center gap-3 p-3 bg-white border border-border rounded-2xl">
      <div className="font-black text-muted-foreground">#{seqNo}</div>
      <div className="flex-1 min-w-0">
         <p className="font-bold truncate">{c?.full_name}</p>
         <p className="text-[11px] text-muted-foreground">{formatTime12(time)}</p>
      </div>
      <div className="text-sm font-bold text-[#FF6B00]">+₹17</div>
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
    <Button variant="outline" size={size ?? (full ? "lg" : "sm")} className={cn("rounded-full", full ? "w-full" : "")} onClick={onClick} disabled={loading}>
      {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Phone className="mr-1.5 h-4 w-4" />}
      {full ? " Call Customer" : "Call"}
    </Button>
  );
}
