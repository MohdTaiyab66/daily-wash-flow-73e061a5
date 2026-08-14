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
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/")({
  component: HomePage,
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

  if (!hasData && (todayQuery.isLoading || todayQuery.isFetching) && !todayQuery.isError) {
    return <TodayAssignmentSkeleton />;
  }

  const assignment = todayData?.assignment ?? null;
  const today = todayData?.today ?? [];
  const completed = today.filter((s) => s.status === "completed").length;
  const done = today.filter((s) => s.status === "completed" || s.status === "unavailable").length;
  const total = today.length;
  const remaining = total - done;

  const earnedSoFar = today
    .filter((s) => s.status === "completed" || s.status === "unavailable")
    .reduce((sum, s) => sum + (s.status === "unavailable" ? 12 : Number(s.rate_per_car || 0)), 0);

  const estimatedEarningsToday = today.reduce((sum, s) => sum + Number(s.rate_per_car || 17), 0);
  
  const inProgressService = today.find(s => s.status === 'in_progress' || (s.started_at && !s.completed_at && s.status !== 'unavailable'));
  const allDone = total > 0 && remaining === 0;
  
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

  const availableCount = Number(availableWork?.available_customers ?? 0);
  const potentialEarnings = Number(availableWork?.total_earnings ?? availableWork?.daily_earnings ?? 0);
  const potentialMonthlyExtra = Number((availableWork as any)?.monthly_earnings ?? (potentialEarnings * 26));
  const areaName = partner?.home_area ?? "Your Area";


  return (
    <div className="mx-auto max-w-md px-5 pb-8 pt-3 space-y-6">
      {/* GREETING */}
      <header className="space-y-0.5">
        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em]">{greeting} 👋</p>
        <h1 className="text-2xl font-bold tracking-tight">{firstName}</h1>
        <p className="text-[11px] text-muted-foreground">{dateStr}</p>
      </header>

      {/* AVAILABILITY CARD */}
      <div className={cn(
        "flex items-center justify-between p-4 rounded-2xl transition-all border",
        online ? "bg-white border-emerald-100 shadow-sm" : "bg-neutral-50 border-neutral-200"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-2.5 w-2.5 rounded-full shrink-0",
            online ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" : "bg-neutral-300"
          )} />
          <div className="flex flex-col">
            <span className={cn("text-xs font-bold uppercase tracking-wider", online ? "text-emerald-600" : "text-neutral-500")}>
              {online ? "ONLINE" : "OFFLINE"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {online ? "Ready to receive work" : "Not receiving new work"}
            </span>
          </div>
        </div>
        <Switch 
          checked={online} 
          onCheckedChange={handleToggle}
          className="data-[state=checked]:bg-emerald-500" 
        />
      </div>

      {/* MAIN WORK CARD (Action-First) */}
      <section>
        {!online ? (
          /* OFFLINE EMPTY STATE */
          <Card className="flex flex-col items-center text-center p-6 border-dashed bg-neutral-50/50">
            <div className="h-12 w-12 bg-neutral-100 rounded-full flex items-center justify-center mb-4">
              <Car className="h-6 w-6 text-neutral-300" />
            </div>
            <h3 className="text-lg font-bold mb-1">Currently Offline</h3>
            <p className="text-xs text-muted-foreground mb-4 max-w-[200px]">
              Go online to receive new customers and start earning today.
            </p>
            <Button onClick={() => handleToggle(true)} className="w-full h-11 rounded-xl bg-neutral-900 text-white font-bold">
              Go Online Now
            </Button>
          </Card>
        ) : inProgressService ? (
          /* SERVICE IN PROGRESS */
          <Card className="overflow-hidden border-0 bg-neutral-900 text-white p-6 relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-3xl -mr-16 -mt-16" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Next Step</p>
                  <h2 className="text-xl font-bold mt-1 text-white">Continue Service</h2>
                </div>
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                  <Navigation className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div className="flex items-center gap-4 mb-6">
                <div className="flex-1">
                  <p className="text-[10px] uppercase text-white/40 font-bold">Completed</p>
                  <p className="text-lg font-bold">{done} / {total}</p>
                </div>
                <div className="flex-1">
                  <p className="text-[10px] uppercase text-white/40 font-bold">Earned</p>
                  <p className="text-lg font-bold text-primary">₹{earnedSoFar}</p>
                </div>
              </div>
              <Button asChild size="lg" className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20">
                <Link to="/app/live">
                  Continue Route
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </Card>
        ) : allDone ? (
          /* ALL DONE */
          <Card className="flex flex-col items-center text-center p-6 bg-emerald-500 text-white border-0 shadow-lg shadow-emerald-100">
             <div className="h-12 w-12 bg-white/20 rounded-full flex items-center justify-center mb-3">
               <CheckCircle2 className="h-6 w-6 text-white" />
             </div>
             <h2 className="text-xl font-bold mb-1">Today Completed!</h2>
             <p className="text-emerald-50 text-xs mb-5">
               {total} services completed. Great job!
             </p>
             <Button asChild variant="secondary" className="w-full h-11 rounded-xl font-bold">
               <Link to="/app/earnings">View Today's Earnings</Link>
             </Button>
          </Card>
        ) : assignment && total > 0 ? (
          /* ASSIGNMENT READY */
          <Card className="overflow-hidden border border-neutral-100 shadow-sm bg-white p-6 relative">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Today's Work</p>
                <h2 className="text-xl font-bold mt-1">{total} Customers</h2>
              </div>
              <MapPin className="h-5 w-5 text-primary" />
            </div>

            <div className="flex items-center gap-6 mb-6">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground font-bold">Potential</p>
                <p className="text-lg font-bold">₹{estimatedEarningsToday}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground font-bold">Area</p>
                <p className="text-lg font-bold truncate max-w-[120px]">{areaName}</p>
              </div>
            </div>

            <Button asChild size="lg" className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20">
              <Link to="/app/live">
                View Assignment
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            
            {assignment.expected_start_time && (
              <p className="mt-3 text-center text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                Start around {formatTime12(assignment.expected_start_time)}
              </p>
            )}
          </Card>
        ) : availableCount > 0 ? (
          /* WORK AVAILABLE */
          <Card className="overflow-hidden border border-primary/20 shadow-md bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Work Available</p>
                <h2 className="text-xl font-bold mt-1">{availableCount} Customers</h2>
              </div>
              <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
            </div>

            <div className="flex items-center gap-6 mb-6">
              <div>
                <p className="text-[10px] uppercase text-muted-foreground font-bold">Potential</p>
                <p className="text-lg font-bold text-primary">₹{potentialEarnings}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-muted-foreground font-bold">Area</p>
                <p className="text-lg font-bold truncate max-w-[120px]">{areaName}</p>
              </div>
            </div>

            <Button asChild size="lg" className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20">
              <Link to="/app/assignments">
                View Work
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </Card>
        ) : (
          /* NO WORK YET */
          <Card className="flex flex-col items-center text-center p-6 border-dashed bg-neutral-50/50">
            <div className="h-12 w-12 bg-neutral-100 rounded-full flex items-center justify-center mb-4">
              <Car className="h-6 w-6 text-neutral-300" />
            </div>
            <h3 className="text-lg font-bold mb-1">No work assigned yet</h3>
            <p className="text-xs text-muted-foreground mb-5 max-w-[200px]">
              New customers will appear here when available.
            </p>
            <Button asChild variant="outline" className="w-full h-11 rounded-xl font-bold border-2">
              <Link to="/app/assignments">View Available Work</Link>
            </Button>
          </Card>
        )}
      </section>

      {/* TODAY SUMMARY (3-Column) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Today's Summary</h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border rounded-2xl p-3 flex flex-col items-center text-center shadow-sm">
            <p className="text-lg font-bold">₹{earnedSoFar}</p>
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Earned</p>
          </div>
          <div className="bg-white border rounded-2xl p-3 flex flex-col items-center text-center shadow-sm">
            <p className="text-lg font-bold">{completed}</p>
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Completed</p>
          </div>
          <div className="bg-white border rounded-2xl p-3 flex flex-col items-center text-center shadow-sm">
            <p className="text-lg font-bold">{total > 0 ? remaining : availableCount}</p>
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              {total > 0 ? "Pending" : "Available"}
            </p>
          </div>
        </div>
      </section>

      {/* SUPPORT (Compact White Card) */}
      <section>
        <Card className="p-5 border-neutral-100 shadow-sm bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Need Help?</p>
              <h3 className="text-sm font-bold">Partner Support</h3>
            </div>
            <div className="flex gap-2">
              <a href="tel:+919999999999" className="h-10 w-10 rounded-xl bg-neutral-50 flex items-center justify-center border border-neutral-100 active:scale-95 transition-all">
                <Phone className="h-4 w-4 text-primary" />
              </a>
              <a href="https://wa.me/919999999999" target="_blank" rel="noreferrer" className="h-10 w-10 rounded-xl bg-neutral-50 flex items-center justify-center border border-neutral-100 active:scale-95 transition-all">
                <MessageCircle className="h-4 w-4 text-emerald-500" />
              </a>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

