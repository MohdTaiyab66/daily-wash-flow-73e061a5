import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTodayAssignment } from "@/hooks/use-today-assignment";
import { TodayAssignmentSkeleton } from "@/components/partner/TodayAssignmentStatus";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Car,
  CheckCircle2,
  Clock,
  MapPin,
  IndianRupee,
  Navigation,
  ArrowRight,
  Phone,
  MessageCircle,
  Briefcase,
  Wallet,
  TrendingUp,
} from "lucide-react";
import { AnimatedNumber } from "@/components/partner/AnimatedNumber";
import { usePartner, useToggleOnline } from "@/hooks/use-partner";
import { MarketplaceOffersList } from "@/components/partner/MarketplaceOffersList";
import { formatTime12 } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getPartnerOpenOffers } from "@/lib/marketplace.functions";


import { PartnerShell } from "@/components/partner/PartnerShell";

export const Route = createFileRoute("/_authenticated/app/")({
  component: () => (
    <PartnerShell>
      <HomePage />
    </PartnerShell>
  ),
});

function HomePage() {
  const navigate = useNavigate();
  const { data: partner } = usePartner();
  const toggle = useToggleOnline();
  const online = partner?.availability === "online";

  const todayQuery = useTodayAssignment();
  const todayData = todayQuery.data;
  const hasData = todayData !== undefined;

  // Poll for available work count in the area
  const { data: availableWork } = useQuery({
    queryKey: ["available-work-summary", partner?.home_area],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("preview_assignment", { p_cars: 36, p_duration: 30 });
      if (error) return null;
      return data?.[0] ?? null;
    },
    enabled: !!partner?.home_area && online,
    refetchInterval: 30000,
  });

  const { data: bookingRequests = [] } = useQuery({
    queryKey: ["partner-booking-requests"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_partner_booking_requests");
      if (error) throw error;
      return data ?? [];
    },
    enabled: online && !!partner?.home_area,
    refetchInterval: 30000,
  });

  // MISSED-WORK RECOVERY — the marketplace (database) is the source of truth,
  // never FCM history. This runs on every mount/login and surfaces still-open,
  // unclaimed opportunities the partner is currently eligible for, including
  // ones broadcast while they were logged out.
  const fetchOpenOffers = useServerFn(getPartnerOpenOffers);
  const { data: openOffers = [] } = useQuery<any[]>({
    queryKey: ["partner-open-offers-home"],
    queryFn: async () => (await fetchOpenOffers()) as any[],
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: "always",
  });



  if (!hasData && (todayQuery.isLoading || todayQuery.isFetching) && !todayQuery.isError) {
    return <TodayAssignmentSkeleton />;
  }

  const assignment = todayData?.assignment ?? null;
  const today = todayData?.today ?? [];
  const completed = todayData?.completedToday ?? 0;
  const done = todayData?.completedToday ?? 0;
  const total = todayData?.assignmentTotalCustomers ?? todayData?.targetCustomers ?? 0;
  const remaining = todayData?.remainingToday ?? 0;

  const earnedSoFar = todayData?.actualEarnedToday ?? 0;

  const potentialDailyEarnings = todayData?.potentialDailyEarnings ?? 0;
  const potentialMonthlyEarnings = todayData?.potentialMonthlyEarnings ?? 0;
  const targetCustomers = todayData?.targetCars ?? 0;
  
  const inProgressService = today.find(s => s.status === 'in_progress' || (s.started_at && !s.completed_at && s.status !== 'unavailable'));
  const allDone = total > 0 && remaining === 0;
  const anyStarted = today.some(s => !!s.started_at);
  
  // Explicit states for UI
  const getExplicitStatus = () => {
    const isMonday = new Date().getDay() === 1;

    if (!assignment) return { label: "NO ACTIVE ASSIGNMENT", color: "text-white/40", sub: "Build your plan to start earning" };
    
    if (isMonday) return { label: "ACTIVE — MONDAY OFF", color: "text-[#FF6B00]", sub: "Today is your scheduled day off. Services resume tomorrow." };

    if (allDone) return { label: "ACTIVE — COMPLETED", color: "text-emerald-400", sub: "All services for today are finished" };
    if (inProgressService) return { label: "ACTIVE — WORKING", color: "text-[#FF6B00]", sub: "You have a service in progress" };
    if (todayData?.assignmentTotalCustomers && todayData.assignmentTotalCustomers > 0) return { label: "ACTIVE — CUSTOMERS ASSIGNED", color: "text-emerald-400", sub: `${todayData.assignmentTotalCustomers} customers ready for service` };
    
    if (assignment.sub_status === 'waiting_for_customers' || total === 0) return { label: "ACTIVE — WAITING FOR CUSTOMERS", color: "text-[#FF6B00]", sub: "New customers will appear here as they are assigned." };
    return { label: "ACTIVE ASSIGNMENT", color: "text-emerald-400", sub: "Your assignment is active" };
  };

  const statusInfo = getExplicitStatus();
  
  const firstName = (partner?.full_name ?? "Partner").split(" ")[0];
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "GOOD MORNING" : hour < 17 ? "GOOD AFTERNOON" : "GOOD EVENING";
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  const handleToggle = async (on: boolean) => {
    try {
      await toggle(on);
    } catch (err) {
      console.error("[TOGGLE_ONLINE_ERROR]", err);
    }
  };

  // Recovered marketplace opportunities (new_booking + assignment_released).
  const recoveredCount = openOffers.reduce(
    (sum: number, o: any) => sum + Math.max(1, Number(o?.customer_count ?? 1)),
    0,
  );
  const recoveredMonthly = openOffers.reduce(
    (sum: number, o: any) =>
      sum +
      Number(
        o?.earning_monthly ??
          (Number(o?.incentive ?? 0) * 26),
      ),
    0,
  );
  const recoveredDistanceM = openOffers
    .map((o: any) => Number(o?.distance_from_route_m ?? NaN))
    .filter((d: number) => Number.isFinite(d) && d > 0)
    .sort((a: number, b: number) => a - b)[0];

  const availableCount = Number(availableWork?.available_customers ?? 0) + recoveredCount;
  const potentialEarnings = Number(availableWork?.total_earnings ?? availableWork?.daily_earnings ?? 0);
  const potentialMonthlyExtra =
    Number((availableWork as any)?.monthly_earnings ?? potentialEarnings * 26) + recoveredMonthly;
  const areaName = partner?.home_area ?? "Your Area";

  return (
    <div className="mx-auto max-w-md px-5 pb-[160px] pt-3 space-y-8">
      {/* GREETING */}
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-[#1A1A1A]">Home</h1>
          <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest">Urban Wash Partner</p>
        </div>
        {partner?.home_area && (
           <div className="flex flex-col items-end">
             <div className="text-[10px] font-black uppercase text-neutral-400 tracking-widest">Work Area</div>
             <Link to="/app/profile" className="text-sm font-black text-[#FF6B00] flex items-center gap-1">
               {partner.home_area}
             </Link>
           </div>
        )}
      </header>

      {/* AREA SELECTION HEADER */}
      <section>
        <Link 
          to="/app/area" 
          className="flex items-center justify-between p-4 bg-white border border-neutral-100 rounded-2xl shadow-sm active:scale-[0.98] transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#FF6B00]/10 flex items-center justify-center">
              <MapPin className="h-5 w-5 text-[#FF6B00]" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Work Area</p>
              <p className="text-sm font-bold text-[#1A1A1A]">📍 {areaName}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-[11px] font-bold text-[#FF6B00] uppercase tracking-wider">Change</Button>
        </Link>
      </section>

      {/* HERO SUMMARY CARD - [BOOKING-PUSH:UI:01] */}
      <section>
        <Card className="overflow-hidden border-0 bg-[#1A1A1A] text-white shadow-2xl rounded-3xl relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF6B00]/20 rounded-full blur-3xl -mr-16 -mt-16" />
          <div className="p-6 space-y-5 relative z-10">
            {assignment ? (
              <>
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">{statusInfo.label}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                      <Car className={cn("h-5 w-5", statusInfo.color)} />
                    </div>
                    <span className="text-xl font-black uppercase tracking-tight">
                      {todayData?.assignmentTotalCustomers !== undefined && todayData.assignmentTotalCustomers > 0 ? `${todayData.assignmentTotalCustomers} Total Customers` : (todayData?.targetCars ?? 0) > 0 ? `${todayData?.targetCars} Total Customers` : "WAITING FOR CUSTOMERS"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-5">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase text-white/40 tracking-wider">Today's Earned</p>
                    <p className="text-2xl font-black tracking-tight text-[#FF6B00]">₹{earnedSoFar.toLocaleString("en-IN")}<span className="text-[10px] text-white/40 ml-1">/ Today</span></p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase text-white/40 tracking-wider">Daily Potential</p>
                    <p className="text-2xl font-black tracking-tight text-white">₹{potentialDailyEarnings.toLocaleString("en-IN")}</p>
                  </div>
                </div>

                <div className="pt-4 space-y-3">
                   <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest flex items-center gap-2">
                    <span className={cn("h-1.5 w-1.5 rounded-full", total > 0 ? "bg-emerald-500" : "bg-[#FF6B00] animate-pulse")} />
                    {total > 0 || targetCustomers > 0 ? "26 service days • Mondays OFF" : `${assignment.working_days || 26} service days • ${assignment.duration_days || 30} days`}
                  </p>
                  
                  {(todayData?.todaysCustomers ?? 0) > 0 || (todayData?.assignmentTotalCustomers ?? 0) > 0 ? (
                    <div className="grid grid-cols-2 gap-4 bg-white/5 rounded-2xl p-4">
                      <div className="space-y-0.5">
                        <p className="text-[9px] font-black uppercase text-white/40 tracking-wider flex items-center gap-1.5">
                          <Clock className="h-3 w-3" /> Start Time
                        </p>
                        <p className="text-sm font-bold">{assignment.expected_start_time ? formatTime12(assignment.expected_start_time) : "—"}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[9px] font-black uppercase text-white/40 tracking-wider flex items-center gap-1.5">
                          <Navigation className="h-3 w-3" /> Progress
                        </p>
                        <p className="text-sm font-bold">{todayData?.completedToday ?? 0} / {todayData?.assignmentTotalCustomers || todayData?.targetCars || 0} Completed</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                      <p className="text-[11px] text-white/70 font-bold leading-relaxed">
                        Your assignment is active.
                      </p>
                      <p className="text-[10px] text-white/40 font-medium mt-1 leading-relaxed">
                        {statusInfo.sub}
                      </p>
                    </div>
                  )}

                  <Button asChild size="lg" className="w-full h-14 rounded-2xl bg-[#FF6B00] hover:bg-[#E56000] text-white font-black text-sm shadow-xl shadow-[#FF6B00]/20 active:scale-[0.95] transition-all mt-2">
                    <Link to="/app/live">{allDone ? "VIEW EARNINGS" : (anyStarted ? "RESUME DAILY ROUTE" : "VIEW DAILY ROUTE")}</Link>
                  </Button>
                </div>
              </>
            ) : (
              <div className="py-8 text-center space-y-4">
                <div className="h-16 w-16 bg-white/10 rounded-full flex items-center justify-center mx-auto">
                   <Car className="h-8 w-8 text-[#FF6B00]" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold">{statusInfo.label}</h2>
                  <p className="text-sm text-white/60">{statusInfo.sub}</p>
                </div>
                <Button asChild className="bg-[#FF6B00] hover:bg-[#E56000] text-white font-bold h-12 rounded-2xl px-8">
                  <Link to="/app/assignments">Build Your Plan</Link>
                </Button>
              </div>
            )}
          </div>
        </Card>
      </section>

      {/* AVAILABILITY STATUS */}
      <div className={cn(
        "flex items-center justify-between p-4 rounded-3xl transition-all border",
        online ? "bg-emerald-50 border-emerald-100" : "bg-neutral-50 border-neutral-100"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-2.5 w-2.5 rounded-full shrink-0",
            online ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" : "bg-neutral-300"
          )} />
          <div className="flex flex-col">
            <span className={cn("text-[10px] font-black uppercase tracking-[0.2em]", online ? "text-emerald-600" : "text-neutral-400")}>
              {online ? "SYSTEM ONLINE" : "SYSTEM OFFLINE"}
            </span>
            <span className="text-[11px] font-bold text-neutral-500 mt-0.5 leading-none">
              {online ? "Ready to receive new customers" : "Not receiving new work"}
            </span>
          </div>
        </div>
        <Switch 
          checked={online} 
          onCheckedChange={handleToggle}
          className="data-[state=checked]:bg-emerald-500" 
        />
      </div>

      {/* PRIMARY CTA / ACTION SECTION */}
      <section className="space-y-4">
        {online && inProgressService && (
          <Button asChild size="lg" className="w-full h-16 rounded-2xl bg-[#FF6B00] hover:bg-[#E56000] text-white font-black text-lg shadow-xl shadow-[#FF6B00]/20 active:scale-[0.98] transition-all">
            <Link to="/app/live">
              CONTINUE SERVICE
              <ArrowRight className="ml-2 h-5 w-5" strokeWidth={3} />
            </Link>
          </Button>
        )}

        {online && allDone && (
          <div className="p-6 bg-emerald-500 text-white rounded-3xl text-center space-y-4 shadow-xl shadow-emerald-500/20">
             <div className="h-12 w-12 bg-white/20 rounded-full flex items-center justify-center mx-auto">
               <CheckCircle2 className="h-6 w-6" strokeWidth={3} />
             </div>
             <div>
               <h2 className="text-xl font-bold uppercase tracking-tight">Today Completed!</h2>
               <p className="text-emerald-50/80 text-xs font-medium mt-1 uppercase tracking-wider">{total} services done · Great job!</p>
             </div>
             <Button asChild variant="secondary" className="w-full h-12 rounded-2xl bg-white text-emerald-600 font-black">
               <Link to="/app/earnings">VIEW EARNINGS</Link>
             </Button>
          </div>
        )}

        {online && assignment && !allDone && total > 0 && (
           <Button asChild size="lg" className="w-full h-16 rounded-3xl bg-[#FF6B00] hover:bg-[#E56000] text-white font-black text-lg shadow-xl shadow-[#FF6B00]/20 active:scale-[0.98] transition-all">
            <Link to="/app/live">
              {anyStarted ? "CONTINUE ROUTE" : "START DAILY ROUTE"}
              <ArrowRight className="ml-2 h-5 w-5" strokeWidth={3} />
            </Link>
          </Button>
        )}

        {online && !assignment && (availableCount > 0 || (bookingRequests?.length ?? 0) > 0) && (
          <div className="p-6 bg-white border border-neutral-100 rounded-3xl shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase text-[#FF6B00] tracking-[0.2em]">CUSTOMERS AVAILABLE NOW</p>
                <h2 className="text-xl font-bold mt-1 text-[#1A1A1A]">{availableCount}</h2>
                <p className="text-[10px] font-bold text-neutral-400 mt-1">More customers can be added to your area.</p>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Button asChild size="lg" className="w-full h-14 rounded-3xl bg-[#FF6B00] hover:bg-[#E56000] text-white font-black shadow-lg shadow-[#FF6B00]/20">
                <Link to="/app/assignments">BUILD YOUR ASSIGNMENT</Link>
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* TODAY SUMMARY (3-Column) */}
      <section>
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Earning Summary</h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-neutral-100 rounded-3xl p-5 flex flex-col items-center text-center shadow-sm">
            <p className="text-2xl font-black text-[#1A1A1A]">₹{earnedSoFar}</p>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mt-2">Earned</p>
          </div>
          <div className="bg-white border border-neutral-100 rounded-3xl p-5 flex flex-col items-center text-center shadow-sm">
            <p className="text-2xl font-black text-[#1A1A1A]">{completed}</p>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mt-2">Done</p>
          </div>
          <div className="bg-white border border-neutral-100 rounded-3xl p-5 flex flex-col items-center text-center shadow-sm">
            <p className="text-2xl font-black text-[#FF6B00]">{assignment ? remaining : availableCount}</p>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#FF6B00] mt-1.5">
              {assignment ? "Pending" : "Available"}
            </p>
          </div>
        </div>
      </section>

      {/* SUPPORT */}
      <section>
        <Card className="p-5 border-neutral-100 shadow-sm bg-white rounded-3xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">Need Help?</p>
              <h3 className="text-base font-bold text-[#1A1A1A]">Partner Support</h3>
            </div>
            <div className="flex gap-2">
              <a href="tel:+919999999999" className="h-10 w-10 rounded-full bg-neutral-50 flex items-center justify-center border border-neutral-100 active:scale-90 transition-all">
                <Phone className="h-4 w-4 text-[#FF6B00]" />
              </a>
              <a href="https://wa.me/919999999999" target="_blank" rel="noreferrer" className="h-10 w-10 rounded-full bg-neutral-50 flex items-center justify-center border border-neutral-100 active:scale-90 transition-all">
                <MessageCircle className="h-4 w-4 text-emerald-500" />
              </a>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
