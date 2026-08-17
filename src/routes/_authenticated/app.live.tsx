import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getRouteVisibility } from "@/lib/assignment.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Phone, Navigation, Play, AlertTriangle, Car, Loader2, CheckCircle2, Clock, Trophy, Wallet, MapPin, ZoomIn, Lock, Sparkles, ChevronDown, ChevronRight, X } from "lucide-react";
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
import { TodayAssignmentStatus, TodayAssignmentSkeleton } from "@/components/partner/TodayAssignmentStatus";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { googleMapsDirectionsUrl, openGoogleMapsDirections, validateExactGps } from "@/lib/gps";
import { saveRouteSnapshot, loadRouteSnapshot, isOnline } from "@/lib/offline-progress-cache";
import { getPosition } from "@/components/partner/service/photo-slot";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/live")({
  component: () => <OfflineGuard label="your live route"><RoutePage /></OfflineGuard>,
});

function RoutePage() {
  const qc = useQueryClient();
  useRealtimeInvalidation(
    ["services", "assignments", "customers", "vehicles", "wallet_ledger"],
    [["route-today"], ["today-assignment"], ["earnings-v3"], ["today-assignment-for-earnings"]]
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
  
  const isMonday = new Date().getDay() === 1;
  
  const visibleServices = (() => {
    // If today has services, use them
    const todays = (services ?? []).filter((s) => s.status !== "covered_by_booking");
    if (todays.length > 0) return todays;
    
    // If it's Monday or today is empty but we have an assignment, derive "route" from the assignment's unique customers
    if (todayQuery.data?.all && todayQuery.data.all.length > 0) {
      // Create a unique set of customers/vehicles for the assignment to show as the "route"
      const unique = new Map();
      [...todayQuery.data.all]
        .sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime())
        .forEach(s => {
          const key = s.vehicle_id || s.customer_id;
          if (key && !unique.has(key)) {
            unique.set(key, s);
          }
        });
      return Array.from(unique.values());
    }
    
    return [];
  })();
  const total = todayQuery.data?.assignmentTotalCustomers || 0;
  const done = todayQuery.data?.completedToday ?? visibleServices.filter((s) => s.status === "completed").length;
  const completedCount = done;
  const isEndOfDay = total > 0 && (total - done) <= 0;
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  const { data: rateSetting } = useQuery({
    queryKey: ["route-rate-per-car"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings").select("value").eq("key", "rate_per_car").maybeSingle();
      return Number(data?.value ?? 17);
    },
  });
  const ratePerCar = rateSetting ?? 17;
  const earnedSoFar = todayQuery.data?.actualEarnedToday ?? (done * ratePerCar);

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
    .map((s, i) => {
      const lat = Number(s.lat || (s.customers as any)?.latitude);
      const lng = Number(s.lng || (s.customers as any)?.longitude);
      
      if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
        console.warn(`[LiveMap] Customer ${s.customers?.full_name} has invalid coordinates:`, { lat, lng });
      }

      return {
        id: s.id,
        sequence_no: (s as any).routeIndex ?? i + 1,
        lat,
        lng,
        label: (s.customers as any)?.full_name ?? "Customer",
        eta: (s as any).eta_at ?? null,
        distanceKm: (s as any).distance_km ?? null,
      };
    })
    .filter(s => !isNaN(s.lat) && !isNaN(s.lng) && s.lat !== 0 && s.lng !== 0);

  const [mapStats, setMapStats] = useState<{ km: number; mins: number } | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  // qc is already declared at the top of the component

  const startService = useMutation({
    mutationFn: async (id: string) => {
      const pos = await getPosition();
      const { error } = await supabase.from("services").update({
        status: "in_progress",
        started_at: new Date().toISOString(),
        start_lat: pos?.lat ?? null,
        start_lng: pos?.lng ?? null,
      }).eq("id", id);
      if (error) throw error;
      
      // Trigger notification
      import("@/lib/push/immediate.functions").then(m => {
        m.flushNotificationPush().catch(e => console.error("[immediate-push] start flush failed", e));
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["route-today"] });
      qc.invalidateQueries({ queryKey: ["today-assignment"] });
      toast.success("Service started");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not start service"),
  });

  const selectedStop = visibleServices.find(s => s.id === selectedStopId);

  if (todayQuery.isLoading && !todayQuery.data) {
    return (
      <div className="mx-auto w-full max-w-md pb-40 overflow-x-hidden box-border bg-white min-h-screen safe-bottom">
         <header className="px-5 pt-3 pb-2">
          <h1 className="text-[28px] sm:text-3xl font-black text-black tracking-tight leading-tight">Daily Route</h1>
          <p className="text-xs font-medium text-muted-foreground mt-0.5">Your work sequence for today</p>
        </header>
        <TodayAssignmentSkeleton />
      </div>
    );
  }
  
  return (
    <div className="mx-auto w-full max-w-md pb-40 overflow-x-hidden box-border bg-white min-h-screen safe-bottom">
      {/* Page Header - Clean & Operational */}
      <header className="px-5 pt-3 pb-2">
        <h1 className="text-[28px] sm:text-3xl font-black text-black tracking-tight leading-tight">Daily Route</h1>
        <p className="text-xs font-medium text-muted-foreground mt-0.5">Your work sequence for today</p>
        
        <TodayAssignmentStatus 
          isError={!!todayQuery.isError}
          isFetching={!!todayQuery.isFetching}
          isRefetching={!!todayQuery.isRefetching}
          hasData={!!todayQuery.data?.assignment}
          onRetry={() => todayQuery.refetch()}
          metrics={todayQuery.metrics}
          lastSuccessAt={todayQuery.metrics.lastSuccessAt}
        />
      </header>

      {/* Progress Card */}
      <div className="px-5 w-full box-border">
        <Card className="p-4 shadow-sm border-none bg-neutral-50 w-full box-border">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Today's Progress</h3>
            <span className="text-xs font-bold">{isMonday ? "MONDAY — SERVICE OFF" : `${done} / ${total} COMPLETED TODAY`}</span>
          </div>
          <Progress value={progressPct} className="h-1.5 mb-5" />
          <div className="grid grid-cols-3 gap-2 text-center w-full">
            <div className="min-w-0">
              <p className="text-lg font-black truncate">₹{earnedSoFar.toLocaleString("en-IN")}</p>
              <p className="text-[9px] uppercase font-bold tracking-tighter text-muted-foreground">Earned</p>
            </div>
            <div className="min-w-0 border-x border-neutral-200">
              <p className="text-lg font-black truncate">{done}</p>
              <p className="text-[9px] uppercase font-bold tracking-tighter text-muted-foreground">Completed</p>
            </div>
            <div className="min-w-0">
              <p className="text-lg font-black truncate">{total - done}</p>
              <p className="text-[9px] uppercase font-bold tracking-tighter text-muted-foreground">Remaining</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Map Section */}
      <div className="px-5 mt-4 w-full box-border">
        <div className="flex justify-between items-baseline mb-2.5">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Map</h2>
        </div>
        <div className="rounded-[24px] overflow-hidden h-[280px] shadow-sm border border-neutral-100 w-full box-border bg-neutral-200 relative">
           {(stops.length > 0 || (todayQuery.data?.assignmentTotalCustomers ?? 0) > 0) ? (
             <LiveMap
                stops={stops}
                showCustomers={true}
                heightClass="h-full"
                hideStats
                onStats={setMapStats}
                onStopClick={setSelectedStopId}
                highlightStopId={selectedStopId}
              />
           ) : (
             <div className="h-full w-full flex items-center justify-center bg-neutral-100">
               <div className="text-center">
                 <MapPin className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
                 <p className="text-[10px] font-bold text-neutral-400 uppercase">No stops assigned</p>
               </div>
             </div>
           )}
        </div>
      </div>

      {/* Primary Next Customer Card */}
      <div className="px-5 mt-5 w-full box-border">
        <div className="flex justify-between items-baseline mb-3">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Next Stop</h2>
        </div>
        {activeNext && !isEndOfDay && routeUnlocked && (
          <NextCustomerHero stop={activeNext} seqNo={1} total={total} onClick={() => setSelectedStopId(activeNext.id)} isMonday={isMonday} />
        )}
        {!activeNext && !isEndOfDay && routeUnlocked && (todayQuery.data?.assignmentTotalCustomers ?? todayQuery.data?.targetCars ?? 0) > 0 && (
          <div className="p-8 text-center bg-neutral-50 rounded-3xl border border-dashed border-neutral-200">
            <Clock className="h-8 w-8 text-neutral-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-neutral-500 uppercase tracking-tight">Assignment Active</p>
            <p className="text-[10px] text-neutral-400 font-medium mt-1 uppercase">Loading sequence...</p>
          </div>
        )}
      </div>

      {/* Up Next List */}
      {activeQueue.length > 0 && !isEndOfDay && (
        <div className="px-5 mt-6 w-full box-border">
           <div className="flex justify-between items-baseline mb-4">
             <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Up Next</h2>
             <span className="text-[10px] font-bold text-muted-foreground uppercase">{activeQueue.length} Remaining</span>
           </div>
           <div className="space-y-2 w-full">
             {activeQueue.map((s, i) => (
                <CompactQueueRow key={s.id} stop={s} seqNo={i + 2} onClick={() => setSelectedStopId(s.id)} />
             ))}
           </div>
        </div>
      )}

      {/* Completed Section */}
      {/* Today's Service Summary */}
      {!isMonday && total > 0 && (
        <div className="px-5 mt-6 w-full box-border">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Service Summary</h2>
          <div className="grid grid-cols-3 gap-2 w-full">
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 text-center">
              <p className="text-xl font-black text-emerald-600">{completed.length}</p>
              <p className="text-[9px] font-bold uppercase text-emerald-600/60 tracking-tighter">Done</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-center">
              <p className="text-xl font-black text-amber-600">{dirty.length}</p>
              <p className="text-[9px] font-bold uppercase text-amber-600/60 tracking-tighter">Dirty</p>
            </div>
            <div className="bg-rose-50 border border-rose-100 rounded-2xl p-3 text-center">
              <p className="text-xl font-black text-rose-600">{unavailable.length}</p>
              <p className="text-[9px] font-bold uppercase text-rose-600/60 tracking-tighter">Unavailable</p>
            </div>
          </div>
        </div>
      )}

      {/* Completed List */}
      {completed.length > 0 && (
         <div className="px-5 mt-6 w-full box-border mb-6">
            <details className="group border-t border-b border-neutral-100 py-4 w-full cursor-pointer">
               <summary className="flex justify-between items-center list-none">
                  <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Completed Records ({completed.length})</h2>
                  <ChevronDown className="h-4 w-4 text-neutral-300 transition-transform group-open:rotate-180" />
               </summary>
               <div className="pt-4 space-y-2 w-full animate-in fade-in slide-in-from-top-2">
                  {completed.map(s => (
                    <div key={s.id} className="flex justify-between items-center text-sm w-full bg-neutral-50 px-4 py-3 rounded-2xl">
                       <div className="min-w-0">
                         <p className="text-neutral-900 font-bold truncate text-sm tracking-tight">{(s.customers as any)?.full_name}</p>
                         <p className="text-[9px] text-muted-foreground font-medium truncate uppercase">{(s.vehicles as any)?.make} {(s.vehicles as any)?.model}</p>
                       </div>
                       <span className="text-emerald-500 font-black shrink-0 text-[9px] uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">✓ COMPLETED</span>
                    </div>
                  ))}
               </div>
            </details>
         </div>
      )}

      {/* Unavailable List */}
      {(unavailable.length > 0 || dirty.length > 0) && (
         <div className="px-5 w-full box-border mb-10">
            <details className="group border-b border-neutral-100 py-4 w-full cursor-pointer">
               <summary className="flex justify-between items-center list-none">
                  <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">Other Outcomes ({unavailable.length + dirty.length})</h2>
                  <ChevronDown className="h-4 w-4 text-neutral-300 transition-transform group-open:rotate-180" />
               </summary>
               <div className="pt-4 space-y-2 w-full animate-in fade-in slide-in-from-top-2">
                  {[...dirty, ...unavailable].map(s => (
                    <div key={s.id} className="flex justify-between items-center text-sm w-full bg-neutral-50 px-4 py-3 rounded-2xl">
                       <div className="min-w-0">
                         <p className="text-neutral-900 font-bold truncate text-sm tracking-tight">{(s.customers as any)?.full_name}</p>
                         <p className="text-[9px] text-muted-foreground font-medium truncate uppercase">{(s.vehicles as any)?.make} {(s.vehicles as any)?.model}</p>
                       </div>
                       <span className={cn(
                         "font-black shrink-0 text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full border",
                         (s as any).unavailable_reason === 'dirty_vehicle' 
                          ? "text-amber-500 bg-amber-500/10 border-amber-500/20" 
                          : "text-rose-500 bg-rose-500/10 border-rose-500/20"
                       )}>
                         { (s as any).unavailable_reason === 'dirty_vehicle' ? '⚠ DIRTY' : '✕ UNAVAILABLE' }
                       </span>
                    </div>
                  ))}
               </div>
            </details>
         </div>
      )}

      {isEndOfDay && (
        <div className="px-5 mt-8 text-center space-y-4 w-full box-border">
           <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <Trophy className="h-8 w-8 text-emerald-600" />
           </div>
           <div>
              <h2 className="text-xl font-bold">Today's Route Complete!</h2>
              <p className="text-muted-foreground text-sm">Great work, you've finished all tasks.</p>
           </div>
           <EndOfDayCard 
              completed={todayQuery.data?.completedToday ?? 0}
              total={todayQuery.data?.todaysCustomers ?? 0}
              earnings={todayQuery.data?.actualEarnedToday ?? 0}
            />
        </div>
      )}
      
      <CustomerDetailSheet 
        stop={selectedStop} 
        open={!!selectedStopId} 
        onOpenChange={(open) => !open && setSelectedStopId(null)}
        onStart={() => selectedStopId && startService.mutate(selectedStopId)}
        isStarting={startService.isPending}
        isMonday={isMonday}
      />

    </div>
  );
}

function CustomerDetailSheet({ stop, open, onOpenChange, onStart, isStarting, isMonday }: { stop: any; open: boolean; onOpenChange: (open: boolean) => void; onStart?: () => void; isStarting?: boolean; isMonday?: boolean }) {
  if (!stop) return null;
  const c = stop.customers as any;
  const v = stop.vehicles as any;
  const time = stop.time_slot;
  const timeLabel = c?.time_window_type === "before" ? "Before " : "";
  const stopLat = Number(stop.destination_lat || c?.latitude);
  const stopLng = Number(stop.destination_lng || c?.longitude);


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-[32px] px-6 pb-8 pt-4 border-none bg-white max-h-[85vh] overflow-y-auto outline-none">
        {/* Simple handle for better UX */}
        <div className="mx-auto w-12 h-1.5 bg-neutral-100 rounded-full mb-6" />
        
        <div className="space-y-6">
          {/* Header Area */}
          <div>
            <h2 className="text-2xl font-black tracking-tight text-neutral-900 leading-tight">{c?.full_name}</h2>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-sm font-bold text-neutral-500">{v?.make} {v?.model}</span>
              <span className="h-1 w-1 rounded-full bg-neutral-300" />
              <span className="text-sm font-mono font-bold text-neutral-400 uppercase tracking-wider bg-neutral-50 px-1.5 py-0.5 rounded">
                {v?.registration_number}
              </span>
            </div>
          </div>

          {/* Quick Info Grid */}
          <div className="grid grid-cols-2 gap-3">
             <div className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-100/50">
                <p className="text-[9px] uppercase text-neutral-400 font-black tracking-widest mb-1">Time</p>
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-[#FF6B00]" />
                  <p className="text-sm font-black text-neutral-900">{timeLabel}{formatTime12(time)}</p>
                </div>
             </div>
             <div className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-100/50">
                <p className="text-[9px] uppercase text-neutral-400 font-black tracking-widest mb-1">Status</p>
                <div className="flex items-center gap-2">
                  {stop.status === "completed" ? (
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-full">✓ Done</span>
                  ) : stop.status === "in_progress" ? (
                    <span className="text-[10px] font-black text-[#FF6B00] uppercase tracking-widest bg-[#FF6B00]/10 px-2 py-0.5 rounded-full animate-pulse">● Working</span>
                  ) : (
                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest bg-neutral-100 px-2 py-0.5 rounded-full">Upcoming</span>
                  )}
                </div>
             </div>
          </div>

          {/* Location & Navigation */}
          {c?.address_line && (
            <div className="space-y-3">
              <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-100/50">
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-[#FF6B00] shrink-0 mt-0.5" />
                  <p className="text-sm font-medium text-neutral-600 leading-snug">{c.address_line}</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="w-full h-14 rounded-2xl border-neutral-200 font-bold text-neutral-900 gap-2 bg-white active:scale-[0.98] transition-all"
                onClick={() => openGoogleMapsDirections(stopLat, stopLng)}
              >
                <Navigation className="h-4 w-4 text-[#FF6B00]" />
                Open in Maps
              </Button>
            </div>
          )}

          {/* Primary Actions */}
          <div className="space-y-3 pt-2">
             {stop.status === "pending" ? (
               <Button
                 onClick={onStart}
                 disabled={isStarting || isMonday}
                 className={cn(
                   "w-full h-16 rounded-[24px] font-black uppercase tracking-widest text-base shadow-xl active:scale-[0.98] transition-all",
                   isMonday 
                     ? "bg-neutral-100 text-neutral-400 cursor-not-allowed shadow-none border border-neutral-200" 
                     : "bg-[#FF6B00] text-white shadow-orange-500/20 hover:bg-[#ff8c40]"
                 )}
               >
                 {isStarting ? (
                   <Loader2 className="h-5 w-5 animate-spin" />
                 ) : isMonday ? (
                   <Lock className="h-5 w-5 mr-2" />
                 ) : (
                   <Play className="h-5 w-5 fill-current mr-2" />
                 )}
                 {isMonday ? "Monday Off" : "Start Service"}
               </Button>
             ) : stop.status === "in_progress" ? (
               <Link
                 to="/app/service/$id"
                 params={{ id: stop.id }}
                 className="w-full h-16 flex items-center justify-center gap-2 rounded-[24px] bg-[#FF6B00] text-white font-black uppercase tracking-widest text-base shadow-xl shadow-orange-500/20 hover:bg-[#ff8c40] active:scale-[0.98] transition-all"
               >
                 <Play className="h-5 w-5 fill-current" />
                 Continue Service
               </Link>
             ) : (
               <Button
                 disabled
                 className="w-full h-16 rounded-[24px] bg-emerald-50 text-emerald-600 font-black uppercase tracking-widest text-base cursor-not-allowed border border-emerald-100"
               >
                 <CheckCircle2 className="h-5 w-5 mr-2" />
                 Service Completed
               </Button>
             )}

             <MaskedCallButton serviceId={stop.id} full size="lg" />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NextCustomerHero({ stop, seqNo, total, onClick, isMonday }: { stop: any; seqNo: number; total: number; onClick?: () => void; isMonday?: boolean }) {
  const startService = useMutation({
    mutationFn: async (id: string) => {
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
      const qc = (require("@tanstack/react-query") as any).getQueryClient?.() || (require("@tanstack/react-query") as any).useQueryClient?.();
      if (qc) {
        qc.invalidateQueries({ queryKey: ["route-today"] });
        qc.invalidateQueries({ queryKey: ["today-assignment"] });
      }
      toast.success("Service started");
    },
    onError: (e: any) => toast.error(e.message ?? "Could not start service"),
  });
  
  // Use the hook correctly
  const queryClient = useQueryClient();
  
  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const pos = await getPosition();
    const { error } = await supabase.from("services").update({
      status: "in_progress",
      started_at: new Date().toISOString(),
      start_lat: pos?.lat ?? null,
      start_lng: pos?.lng ?? null,
    }).eq("id", stop.id);
    
    if (error) {
      toast.error(error.message);
      return;
    }
    
    queryClient.invalidateQueries({ queryKey: ["route-today"] });
    queryClient.invalidateQueries({ queryKey: ["today-assignment"] });
    toast.success("Service started immediately");
    
    import("@/lib/push/immediate.functions").then(m => {
      m.flushNotificationPush().catch(console.error);
    });
  };

  const c = stop.customers as any;
  const v = stop.vehicles as any;
  const time = stop.time_slot;
  const timeLabel = c?.time_window_type === "before" ? "Before " : "";
  const inProgress = stop.status === "in_progress";
  const gps = { lat: (stop as any).lat, lng: (stop as any).lng };

  return (
    <Card 
      className="p-5 bg-[#1A1A1A] text-white rounded-[32px] border-none shadow-xl w-full box-border overflow-hidden cursor-pointer active:scale-[0.98] transition-all"
      onClick={onClick}
    >
      <div className="flex justify-between items-center mb-5">
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">NEXT STOP • {seqNo} of {total}</span>
        {inProgress ? (
          <span className="text-[#FF6B00] text-[9px] font-black uppercase tracking-widest bg-[#FF6B00]/10 px-3 py-1 rounded-full border border-[#FF6B00]/20 shrink-0 animate-pulse">IN PROGRESS</span>
        ) : (
          <span className="text-[#FF6B00] text-[9px] font-black uppercase tracking-widest bg-[#FF6B00]/10 px-3 py-1 rounded-full border border-[#FF6B00]/20 shrink-0">READY</span>
        )}
      </div>
      <div className="flex gap-4 mb-6 w-full">
        <div className="relative shrink-0">
          <TappableVehicleImage 
            path={v?.front_image_path} 
            className="h-20 w-20 rounded-2xl object-cover border border-white/10"
            customerName={c?.full_name}
            vehicleLabel={`${v?.make} ${v?.model}`}
            registration={v?.registration_number}
          />
          <div className="absolute -bottom-2 -right-2 bg-white rounded-full p-1.5 shadow-lg">
             <Car className="h-3 w-3 text-black" />
          </div>
        </div>
        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <p className="text-xl font-bold truncate leading-tight tracking-tight">{c?.full_name}</p>
          <p className="text-sm text-white/50 truncate mt-0.5 font-medium">{v?.make} {v?.model}</p>
          <div className="mt-2 inline-flex items-center bg-white/5 text-white/80 px-2 py-0.5 rounded border border-white/10 self-start">
             <span className="text-[10px] font-mono font-bold tracking-wider">{v?.registration_number}</span>
          </div>
        </div>
      </div>
      
      <div className="mb-6 w-full">
        <div className="space-y-1">
           <p className="text-[9px] uppercase text-white/30 font-bold tracking-widest">
             {inProgress ? "Started At" : "Reach By"}
           </p>
           <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-[#FF6B00]" />
              <p className="text-base font-black tracking-tight">
                {inProgress 
                  ? formatTime12(new Date(stop.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })) 
                  : `${timeLabel}${formatTime12(time)}`}
              </p>
           </div>
        </div>
      </div>

      <div className="flex items-center gap-3 w-full" onClick={(e) => e.stopPropagation()}>
        {/* NAVIGATION: icon-only circular compact ~22% */}
        <Button 
          variant="outline" 
          size="icon" 
          className="rounded-full h-12 w-12 bg-white/5 border-white/10 hover:bg-white/10 shrink-0 active:scale-95 transition-all flex-[0.22]"
          onClick={() => openGoogleMapsDirections(gps.lat, gps.lng)}
        >
          <Navigation className="h-5 w-5 text-white" />
        </Button>

        {/* START: large primary CTA ~56% */}
        {inProgress ? (
          <Link
            to="/app/service/$id"
            params={{ id: stop.id }}
            className="flex-[0.56] flex items-center justify-center gap-2 rounded-full bg-[#FF6B00] text-white font-black uppercase tracking-wider hover:bg-[#ff8c40] px-4 h-12 text-xs shadow-lg shadow-[#FF6B00]/20 active:scale-95 transition-all truncate"
          >
            <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
            <span className="truncate">In Progress</span>
          </Link>
        ) : (
          <Button
            onClick={handleStart}
            disabled={isMonday}
            className={cn(
              "flex-[0.56] flex items-center justify-center gap-2 rounded-full font-black uppercase tracking-wider px-4 h-12 text-xs shadow-lg active:scale-95 transition-all truncate",
              isMonday 
                ? "bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700 shadow-none" 
                : "bg-[#FF6B00] text-white hover:bg-[#ff8c40] shadow-[#FF6B00]/20"
            )}
          >
            {isMonday ? <Lock className="h-4 w-4 shrink-0" /> : <Play className="h-4 w-4 fill-current shrink-0" />}
            <span className="truncate">{isMonday ? "Monday Off" : "Start"}</span>
          </Button>
        )}

        {/* CALL: icon-only circular compact ~22% */}
        <MaskedCallButton serviceId={stop.id} size="icon" />
      </div>
    </Card>
  );
}

function CompactQueueRow({ stop, seqNo, onClick }: { stop: any; seqNo: number; onClick: () => void }) {
  const c = stop.customers as any;
  const v = stop.vehicles as any;
  const time = stop.time_slot;
  const timeLabel = c?.time_window_type === "before" ? "Before " : "";

  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-4 p-3.5 bg-white border border-neutral-100 rounded-[20px] shadow-sm active:scale-[0.98] transition-all w-full box-border text-left group"
    >
      <div className="h-8 w-8 bg-neutral-50 rounded-xl flex items-center justify-center font-black text-neutral-400 text-[10px] shrink-0 border border-neutral-100 group-hover:bg-neutral-100 transition-colors">
        {seqNo}
      </div>
      <div className="flex-1 min-w-0">
         <p className="font-bold truncate text-neutral-900 text-sm tracking-tight">{c?.full_name}</p>
         <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[9px] text-neutral-400 font-bold uppercase tracking-tight truncate">{v?.make} {v?.model}</p>
            <span className="h-0.5 w-0.5 rounded-full bg-neutral-300" />
            <p className="text-[9px] font-black text-neutral-500 uppercase tracking-tighter">{timeLabel}{formatTime12(time)}</p>
         </div>
      </div>
      <ChevronRight className="h-4 w-4 text-neutral-300 shrink-0 group-hover:text-neutral-500 transition-colors" />
    </button>
  );
}

export function MaskedCallButton({ serviceId, full, size }: { serviceId: string; full?: boolean; size?: "default" | "lg" | "sm" | "icon" }) {
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
    <Button 
      variant="outline" 
      size={size === "icon" ? "icon" : (size ?? (full ? "lg" : "default"))} 
      className={cn(
        "rounded-2xl border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-900 shrink-0 font-bold transition-all active:scale-95", 
        size === "icon" ? "h-12 w-12 rounded-full flex-[0.22] border-white/10 bg-white/5 text-white hover:bg-white/10" : (full ? "flex-1 h-14" : (size === "default" || !size ? "h-12 w-12" : ""))
      )} 
      onClick={onClick} 
      disabled={loading}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className={cn("h-4 w-4", size === "icon" ? "text-white" : "text-[#FF6B00]")} />}
      {full && !loading && " Call Customer"}
    </Button>
  );
}
