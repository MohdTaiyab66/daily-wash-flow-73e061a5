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
  Wallet,
  Briefcase,
  Phone,
  MessageCircle,
} from "lucide-react";
import { AnimatedNumber } from "@/components/partner/AnimatedNumber";
import { usePartner, useToggleOnline } from "@/hooks/use-partner";
import { MarketplaceOffersList } from "@/components/partner/MarketplaceOffersList";
import { formatTime12 } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  const handleToggle = async (on: boolean) => {
    await toggle(on);
    if (!on) navigate({ to: "/app" }); // Force refresh state visually if needed, though toggle handles data.
  };

  return (
    <div className="mx-auto max-w-md px-5 pb-8 pt-3 space-y-5">
      {/* HEADER */}
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{greeting} 👋</p>
          <h1 className="text-2xl font-bold tracking-tight">{firstName}</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">{dateStr}</p>
        </div>
        <div className="flex items-center gap-3">
           {/* Notification Bell handled by TopBar in AppLayout, so we just provide the profile greeting space here */}
        </div>
      </header>

      {/* AVAILABILITY */}
      <Card className={cn(
        "flex items-center justify-between px-4 py-3 border transition-colors duration-300",
        online ? "bg-emerald-50/50 border-emerald-100" : "bg-muted/30 border-border"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-3 w-3 rounded-full shrink-0",
            online ? "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.1)] animate-pulse" : "bg-muted-foreground/40"
          )} />
          <div>
            <p className={cn("text-sm font-bold uppercase tracking-wide", online ? "text-emerald-700" : "text-muted-foreground")}>
              {online ? "You're Online" : "You're Offline"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {online ? "Available for new assignments" : "Not receiving new assignments"}
            </p>
          </div>
        </div>
        <Switch 
          checked={online} 
          onCheckedChange={handleToggle}
          className="data-[state=checked]:bg-emerald-500" 
        />
      </Card>

      {/* PRIMARY WORK AREA */}
      <section className="space-y-4">
        {inProgressService ? (
          /* STATE: SERVICE IN PROGRESS */
          <Card className="overflow-hidden border-2 border-primary/20 bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                Service In Progress
              </span>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary">
                <Car className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Active Customer</p>
                <h3 className="text-xl font-bold">Current Wash</h3>
              </div>
            </div>
            <Button asChild className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-bold text-base shadow-lg shadow-primary/20">
              <Link to="/app/live">
                Continue Service
                <Navigation className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </Card>
        ) : allDone ? (
          /* STATE: ALL SERVICES COMPLETED */
          <Card className="flex flex-col items-center text-center p-8 bg-emerald-500 text-white border-0">
             <div className="h-16 w-16 bg-white/20 rounded-full flex items-center justify-center mb-4">
               <CheckCircle2 className="h-8 w-8 text-white" />
             </div>
             <h2 className="text-2xl font-bold mb-2">Today Completed! 🎉</h2>
             <p className="text-emerald-50 text-sm mb-6 max-w-[200px]">
               {total} / {total} services completed. Great work today!
             </p>
             <Button asChild variant="secondary" className="w-full h-12 rounded-2xl font-bold">
               <Link to="/app/earnings">View Earnings</Link>
             </Button>
          </Card>
        ) : assignment && total > 0 ? (
          /* STATE: ASSIGNMENT AVAILABLE */
          <Card className="overflow-hidden border-0 bg-neutral-900 text-white p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Today's Assignment</p>
                <h2 className="text-xl font-bold mt-1">{assignment.area}</h2>
              </div>
              <MapPin className="h-5 w-5 text-primary" />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white/5 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Customers</p>
                <p className="text-2xl font-bold mt-1">{total}</p>
              </div>
              <div className="bg-white/5 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Est. Earnings</p>
                <p className="text-2xl font-bold mt-1 text-primary">₹{estimatedEarningsToday}</p>
              </div>
            </div>

            <Button asChild size="lg" className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-lg shadow-lg shadow-primary/30">
              <Link to="/app/live">
                View Assignment
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            
            {assignment.expected_start_time && (
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-white/40">
                <Clock className="h-3.5 w-3.5" />
                <span>Start Before {formatTime12(assignment.expected_start_time)}</span>
              </div>
            )}
          </Card>
        ) : (
          /* STATE: NO ASSIGNMENT YET */
          <Card className="flex flex-col items-center text-center p-8 py-10 border-dashed border-2">
            <div className="h-20 w-20 bg-muted/50 rounded-full flex items-center justify-center mb-6">
              <Car className="h-10 w-10 text-muted-foreground/30" />
            </div>
            <h3 className="text-xl font-bold mb-2">No assignment yet</h3>
            <p className="text-sm text-muted-foreground mb-8 max-w-[240px]">
              You're online and ready. New work will appear here automatically.
            </p>
            <Button asChild variant="outline" className="w-full h-12 rounded-2xl font-bold border-2">
              <Link to="/app/assignments">View Available Work</Link>
            </Button>
          </Card>
        )}
      </section>

      {/* TODAY'S EARNINGS - COMPACT */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider">Today</h3>
          {done > 0 && <span className="text-[10px] text-muted-foreground font-medium">{done} / {total} Done</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4 flex flex-col justify-between">
            <div className="flex items-center gap-2 text-primary mb-1">
              <IndianRupee className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Earned</span>
            </div>
            <p className="text-2xl font-bold">
              <AnimatedNumber value={earnedSoFar} format={(n) => `₹${n}`} />
            </p>
          </Card>
          <Card className="p-4 flex flex-col justify-between">
            <div className="flex items-center gap-2 text-emerald-500 mb-1">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Completed</span>
            </div>
            <p className="text-2xl font-bold">{completed}</p>
          </Card>
        </div>
      </section>

      {/* MARKETPLACE - AVAILABLE WORK */}
      <MarketplaceOffersList />

      {/* QUICK ACCESS */}
      <section>
        <h3 className="text-sm font-bold uppercase tracking-wider mb-3">Quick Access</h3>
        <div className="grid grid-cols-2 gap-3">
          <Link to="/app/assignments" className="flex items-center gap-3 p-4 bg-white border rounded-2xl transition-active active:scale-[0.98]">
            <div className="h-10 w-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600">
              <Briefcase className="h-5 w-5" />
            </div>
            <span className="font-semibold text-sm">Assignments</span>
          </Link>
          <Link to="/app/earnings" className="flex items-center gap-3 p-4 bg-white border rounded-2xl transition-active active:scale-[0.98]">
            <div className="h-10 w-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600">
              <Wallet className="h-5 w-5" />
            </div>
            <span className="font-semibold text-sm">Earnings</span>
          </Link>
        </div>
      </section>

      {/* SUPPORT */}
      <section className="bg-neutral-50 rounded-3xl p-5 border border-neutral-100">
        <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Need help?</h3>
        <div className="grid grid-cols-2 gap-3">
          <a href="tel:+919999999999" className="flex flex-col items-center justify-center gap-2 p-4 bg-white border rounded-2xl">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Phone className="h-5 w-5" />
            </div>
            <span className="font-bold text-xs">Support</span>
          </a>
          <a href="https://wa.me/919999999999" target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center gap-2 p-4 bg-white border rounded-2xl">
            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
              <MessageCircle className="h-5 w-5" />
            </div>
            <span className="font-bold text-xs">WhatsApp</span>
          </a>
        </div>
      </section>
    </div>
  );
}
