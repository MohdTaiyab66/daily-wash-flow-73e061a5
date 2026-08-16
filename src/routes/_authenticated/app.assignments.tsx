import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Loader2, MapPin, IndianRupee,
  Car, Clock, TrendingUp, Navigation, X
} from "lucide-react";
import { PartnerShell } from "@/components/partner/PartnerShell";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { OfflineGuard } from "@/components/OfflineGuard";
import { formatTime12 } from "@/lib/format";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTodayAssignment } from "@/hooks/use-today-assignment";
import { cancelMyAssignment } from "@/lib/assignment.functions";

export const Route = createFileRoute("/_authenticated/app/assignments")({
  component: () => <OfflineGuard label="assignment builder"><PartnerShell><AssignmentsPage /></PartnerShell></OfflineGuard>,
});

const DEFAULT_START_RULES = [
  { max_cars: 15, start_time: "07:00" },
  { max_cars: 25, start_time: "06:30" },
  { max_cars: 30, start_time: "06:00" },
  { max_cars: 36, start_time: "05:00" },
];

function computeStartTime(cars: number, rules: any[]): string {
  const sorted = [...rules].sort((a, b) => a.max_cars - b.max_cars);
  for (const r of sorted) if (cars <= r.max_cars) return r.start_time;
  return sorted[sorted.length - 1]?.start_time ?? "07:00";
}

function addHours(hhmm: string, hours: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + Math.round(hours * 60);
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function AssignmentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const SERVICE_DAYS_PER_MONTH = 26;

  const todayQuery = useTodayAssignment();
  const activeAssignment = todayQuery.data?.assignment ?? null;
  const totalCustomers = todayQuery.data?.assignmentTotalCustomers ?? 0;
  const completedToday = todayQuery.data?.assignmentCompleted ?? 0;

  const { data: partner } = useQuery({
    queryKey: ["me-partner-builder"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("partners")
        .select("id,home_area").eq("id", u.user.id).maybeSingle();
      return data;
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["assignment-settings-v3"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings").select("key,value").in("key", [
        "min_hours_per_day", "max_hours_per_day", "cars_per_hour", "rate_per_car"
      ]);
      const m: Record<string, any> = {};
      (data ?? []).forEach((s: any) => (m[s.key] = s.value));
      return {
        rate: Number(m.rate_per_car ?? 17),
        minHours: Number(m.min_hours_per_day ?? 2),
        maxHours: Number(m.max_hours_per_day ?? 6),
        carsPerHour: Number(m.cars_per_hour ?? 6),
      };
    },
  });

  const [hours, setHours] = useState(4);
  const [duration, setDuration] = useState(30);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const cars = Math.round(hours * (settings?.carsPerHour ?? 6));
  const rate = settings?.rate ?? 17;
  const startTime = computeStartTime(cars, DEFAULT_START_RULES);
  const finishTime = addHours(startTime, hours);
  const dailyEarn = cars * rate;
  const monthlyEarn = dailyEarn * SERVICE_DAYS_PER_MONTH;

  const activeDailyEarn = (activeAssignment?.rate_per_car ?? rate) * (activeAssignment?.target_cars ?? totalCustomers);
  const activeMonthlyEarn = activeDailyEarn * SERVICE_DAYS_PER_MONTH;

  const accept = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("accept_assignment_v2", { p_cars: cars, p_duration: duration });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      navigate({ to: "/app/live" });
    },
    onError: (e: any) => toast.error(e.message)
  });

  const cancel = useMutation({
    mutationFn: async () => {
      if (!activeAssignment) return;
      return cancelMyAssignment({ data: { assignment_id: activeAssignment.id } });
    },
    onSuccess: () => {
      toast.success("Assignment cancelled");
      qc.invalidateQueries();
      setCancelOpen(false);
    },
    onError: (e: any) => toast.error(e.message)
  });

  // STATE 2 — ACTIVE ASSIGNMENT
  if (activeAssignment) {
    return (
      <div className="mx-auto max-w-md px-5 pt-3 pb-[220px] space-y-8">
        <header className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-[#1A1A1A]">TODAY'S ASSIGNMENT</h1>
          <p className="text-sm text-muted-foreground font-medium">Your work plan for today</p>
        </header>

        <section>
          <div className="flex items-center gap-3 p-4 bg-white border border-neutral-100 rounded-2xl shadow-sm">
            <div className="h-10 w-10 rounded-xl bg-[#FF6B00]/10 flex items-center justify-center">
              <MapPin className="h-5 w-5 text-[#FF6B00]" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Work Area</p>
              <p className="text-sm font-bold text-[#1A1A1A]">📍 {partner?.home_area ?? "—"}</p>
            </div>
          </div>
        </section>

        <Card className="overflow-hidden border-0 bg-[#1A1A1A] text-white shadow-2xl rounded-3xl relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF6B00]/20 rounded-full blur-3xl -mr-16 -mt-16" />
          <div className="p-6 space-y-5 relative z-10">
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Assignment Summary</p>
              <div className="flex items-center gap-3 mt-2">
                <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Car className="h-5 w-5 text-[#FF6B00]" />
                </div>
                <span className="text-xl font-black uppercase tracking-tight">{totalCustomers} Total Customers</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-5">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase text-white/40 tracking-wider">Daily Earning</p>
                <p className="text-2xl font-black tracking-tight text-[#FF6B00]">₹{activeDailyEarn.toLocaleString("en-IN")}<span className="text-[10px] text-white/40 ml-1">/ Day</span></p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase text-white/40 tracking-wider">Monthly Earning</p>
                <p className="text-2xl font-black tracking-tight">₹{activeMonthlyEarn.toLocaleString("en-IN")}<span className="text-[10px] text-white/40 ml-1">/ Month</span></p>
              </div>
            </div>

            <div className="pt-4 space-y-3">
               <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                26 service days • Mondays OFF
              </p>
              
              <div className="grid grid-cols-2 gap-4 bg-white/5 rounded-2xl p-4">
                <div className="space-y-0.5">
                  <p className="text-[9px] font-black uppercase text-white/40 tracking-wider flex items-center gap-1.5">
                    <Clock className="h-3 w-3" /> Start Time
                  </p>
                  <p className="text-sm font-bold">{activeAssignment.expected_start_time ? formatTime12(activeAssignment.expected_start_time) : "—"}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[9px] font-black uppercase text-white/40 tracking-wider flex items-center gap-1.5">
                    <Navigation className="h-3 w-3" /> Progress
                  </p>
                  <p className="text-sm font-bold">{completedToday} / {totalCustomers} Done</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="fixed inset-x-0 bottom-[70px] z-30 border-t border-neutral-100 bg-white/95 p-4 space-y-3">
          <Button asChild size="lg" className="w-full h-16 rounded-3xl bg-[#FF6B00] text-lg font-black shadow-lg shadow-[#FF6B00]/20">
            <Link to="/app/live">START ASSIGNMENT →</Link>
          </Button>
          <Button 
            variant="ghost" 
            className="w-full h-10 text-xs font-bold text-neutral-400 hover:text-red-500 uppercase tracking-widest"
            onClick={() => setCancelOpen(true)}
          >
            CANCEL ASSIGNMENT
          </Button>
        </div>

        <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <AlertDialogContent className="rounded-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold">Cancel Assignment?</AlertDialogTitle>
              <AlertDialogDescription className="text-sm">
                You are about to release:
                <div className="mt-3 p-4 bg-neutral-50 rounded-2xl space-y-1">
                  <p className="font-bold text-[#1A1A1A]">{totalCustomers} customers</p>
                  <p className="text-xs font-medium">₹{activeDailyEarn}/day · ₹{activeMonthlyEarn}/month</p>
                </div>
                <p className="mt-4">This work will become available to other eligible partners in {partner?.home_area}.</p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row gap-3">
              <AlertDialogCancel className="flex-1 h-12 rounded-xl mt-0 font-bold border-2">Keep Assignment</AlertDialogCancel>
              <AlertDialogAction 
                className="flex-1 h-12 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold shadow-lg shadow-red-500/20"
                onClick={() => cancel.mutate()}
                disabled={cancel.isPending}
              >
                {cancel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, Cancel"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // STATE 1 — NO ACTIVE ASSIGNMENT
  if (!partner?.home_area) {
    return (
      <div className="mx-auto max-w-md px-5 pt-10 space-y-6">
        <h1 className="text-3xl font-black text-[#1A1A1A]">BUILD YOUR ASSIGNMENT</h1>
        <Card className="p-8 text-center border-neutral-100 rounded-3xl shadow-sm bg-white">
          <div className="h-16 w-16 rounded-2xl bg-[#FF6B00]/10 flex items-center justify-center mx-auto">
            <MapPin className="h-8 w-8 text-[#FF6B00]" />
          </div>
          <h2 className="mt-5 text-xl font-black text-[#1A1A1A]">Choose your work area</h2>
          <p className="mt-2 text-sm font-medium text-neutral-500">We need to know where you'll work before showing your potential earnings.</p>
          <Button asChild size="lg" className="mt-8 w-full h-14 rounded-3xl bg-[#FF6B00] font-black">
            <Link to="/app/area">SELECT WORK AREA</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-5 pt-3 pb-[140px] space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight text-[#1A1A1A]">BUILD YOUR ASSIGNMENT</h1>
        <p className="text-sm text-muted-foreground font-medium">Configure your professional work plan.</p>
      </header>

      <section className="space-y-4">
        <Link to="/app/area" className="flex items-center justify-between p-4 bg-white border border-neutral-100 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#FF6B00]/10 flex items-center justify-center">
              <MapPin className="h-5 w-5 text-[#FF6B00]" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Your Work Area</p>
              <p className="text-sm font-bold text-[#1A1A1A]">📍 {partner.home_area}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-[11px] font-bold text-[#FF6B00] uppercase tracking-wider">Change</Button>
        </Link>

        <div className="flex items-center justify-between p-4 bg-neutral-50 border border-neutral-100 rounded-2xl">
          <div className="space-y-0.5">
            <p className="text-[10px] font-black text-[#FF6B00] uppercase tracking-wider">CUSTOMERS AVAILABLE NOW</p>
            <p className="text-2xl font-black text-neutral-900">0</p>
          </div>
          <p className="text-[10px] font-bold text-neutral-400 text-right max-w-[140px]">New customers can be added to your area at any time.</p>
        </div>
      </section>

      <section className="space-y-10">
        <div className="space-y-5">
          <div className="flex items-end justify-between px-1">
            <label className="text-base font-black text-[#1A1A1A] uppercase tracking-tight">How many hours per day?</label>
            <span className="text-xl font-black text-[#FF6B00]">{hours} HOURS</span>
          </div>
          <div className="px-1 space-y-4">
            <Slider 
              value={[hours]} 
              min={settings?.minHours ?? 2} 
              max={settings?.maxHours ?? 6} 
              step={0.5} 
              onValueChange={([v]) => setHours(v)}
              className="py-4"
            />
            <div className="bg-[#1A1A1A] p-5 rounded-2xl border border-white/5 shadow-lg relative overflow-hidden">
               <div className="absolute top-0 right-0 w-24 h-24 bg-[#FF6B00]/10 rounded-full blur-2xl -mr-12 -mt-12" />
               <div className="relative z-10 flex items-center justify-between">
                 <div className="space-y-1">
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Working Hours</p>
                    <p className="text-lg font-black text-white flex items-center gap-2">
                      <Clock className="h-4 w-4 text-[#FF6B00]" />
                      {formatTime12(startTime)} <span className="text-white/20">→</span> {formatTime12(finishTime)}
                    </p>
                 </div>
                 <div className="text-right">
                   <p className="text-[10px] font-black text-[#FF6B00] uppercase tracking-wider">Target</p>
                   <p className="text-lg font-black text-white">{cars} CARS</p>
                 </div>
               </div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="flex items-end justify-between px-1">
            <label className="text-base font-black text-[#1A1A1A] uppercase tracking-tight">How many days to commit?</label>
            <span className="text-xl font-black text-[#FF6B00]">{duration} DAYS</span>
          </div>
          <div className="px-1 space-y-4">
            <Slider 
              value={[duration]} 
              min={7} 
              max={30} 
              step={1} 
              onValueChange={([v]) => setDuration(v)}
              className="py-4"
            />
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 w-fit px-3 py-1.5 rounded-full border border-emerald-100">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Mondays are always OFF
              </div>
              <p className="text-[11px] font-medium text-neutral-400 leading-relaxed px-1">
                Your assignment duration is {duration} days. Monthly earning is projected using 26 service days per month.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Plan Summary</h3>
        <div className="grid grid-cols-2 gap-3">
           <div className="bg-white border border-neutral-100 p-4 rounded-2xl space-y-1">
             <p className="text-[9px] font-black text-neutral-400 uppercase tracking-wider">Area</p>
             <p className="text-xs font-bold truncate">📍 {partner.home_area}</p>
           </div>
           <div className="bg-white border border-neutral-100 p-4 rounded-2xl space-y-1">
             <p className="text-[9px] font-black text-neutral-400 uppercase tracking-wider">Commitment</p>
             <p className="text-xs font-bold text-[#FF6B00]">{duration} DAYS</p>
           </div>
        </div>

        <Card className="p-6 border-0 shadow-2xl bg-[#1A1A1A] text-white rounded-[32px] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-[#FF6B00]/20 rounded-full blur-[80px] -mr-20 -mt-20" />
          <div className="flex flex-col gap-6 relative z-10">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Daily Earning</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-[#FF6B00]">₹{dailyEarn.toLocaleString("en-IN")}</span>
                  <span className="text-[10px] text-white/30 uppercase font-black">/ Day</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Monthly Earning</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-white">₹{monthlyEarn.toLocaleString("en-IN")}</span>
                  <span className="text-[10px] text-white/30 uppercase font-black">/ Month</span>
                </div>
              </div>
            </div>
            
            <div className="pt-6 border-t border-white/10 space-y-4">
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3">
                   <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center">
                     <Car className="h-4 w-4 text-[#FF6B00]" />
                   </div>
                   <div>
                     <p className="text-[9px] font-black text-white/40 uppercase tracking-wider">Customer Target</p>
                     <p className="text-sm font-black uppercase">{cars} Customers</p>
                   </div>
                 </div>
                 <div className="text-right">
                   <p className="text-[9px] font-black text-white/40 uppercase tracking-wider">Rate</p>
                   <p className="text-sm font-black text-[#FF6B00]">₹{rate}/Car</p>
                 </div>
               </div>

               <div className="bg-white/5 p-4 rounded-2xl space-y-2">
                 <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Calculation Model</p>
                 <div className="flex flex-col gap-1">
                   <p className="text-[11px] font-bold text-white/80 flex items-center justify-between">
                     <span>26 Service Days / Month</span>
                     <span className="text-[#FF6B00]">Mondays Off</span>
                   </p>
                   <p className="text-[10px] text-white/40 italic">
                     {cars} cars × ₹{rate} × 26 days = ₹{monthlyEarn.toLocaleString("en-IN")}
                   </p>
                 </div>
               </div>
            </div>
          </div>
        </Card>
      </section>

      <div className="fixed inset-x-0 bottom-[70px] z-30 border-t border-neutral-100 bg-white/90 backdrop-blur-xl p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <Button 
          size="lg" 
          className="w-full h-16 rounded-[24px] bg-[#FF6B00] hover:bg-[#E56000] text-white font-black text-lg shadow-2xl shadow-[#FF6B00]/30 active:scale-[0.97] transition-all"
          onClick={() => setConfirmOpen(true)}
          disabled={accept.isPending}
        >
          {accept.isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : "START MY ASSIGNMENT →"}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-3xl max-w-[90vw]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">Create Assignment?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              You are accepting {cars} customers in {partner.home_area}. 
              <div className="mt-3 p-4 bg-neutral-50 rounded-2xl">
                <p className="font-bold text-neutral-900">Monthly earning: ₹{monthlyEarn.toLocaleString("en-IN")}</p>
                <p className="text-[10px] mt-1">Based on 26 service days.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3">
            <AlertDialogCancel className="flex-1 h-12 rounded-xl mt-0 font-bold border-2">Back</AlertDialogCancel>
            <AlertDialogAction 
              className="flex-1 h-12 rounded-xl bg-[#FF6B00] text-white font-bold"
              onClick={() => accept.mutate()}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
