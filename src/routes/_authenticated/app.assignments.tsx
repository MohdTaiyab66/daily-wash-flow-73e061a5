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
  const [hours, setHours] = useState(4);
  const [duration, setDuration] = useState(30);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  // Mondays are always off
  const countServiceDays = (calendarDays: number, startDate = new Date()) => {
    let count = 0;
    for (let i = 0; i < calendarDays; i++) {
      const current = new Date(startDate);
      current.setDate(startDate.getDate() + i);
      if (current.getDay() !== 1) { // 1 is Monday
        count++;
      }
    }
    return count;
  };

  const serviceDays = countServiceDays(duration);

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

  const cars = Math.round(hours * (settings?.carsPerHour ?? 6));
  const rate = settings?.rate ?? 17;
  const startTime = computeStartTime(cars, DEFAULT_START_RULES);
  const finishTime = addHours(startTime, hours);
  const dailyEarn = cars * rate;
  const assignmentEarn = dailyEarn * serviceDays;

  const activeDailyEarn = (activeAssignment?.rate_per_car ?? rate) * (activeAssignment?.target_cars ?? totalCustomers);
  // For active assignments, we use 26 as the standard monthly reference for the display card
  const activeMonthlyEarn = activeDailyEarn * 26;


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
                <p className="text-[10px] font-black uppercase text-white/40 tracking-wider">YOUR EARNING</p>
                <p className="text-2xl font-black tracking-tight text-white">₹{activeMonthlyEarn.toLocaleString("en-IN")}</p>

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

        <div className="fixed inset-x-0 bottom-[70px] z-30 border-t border-neutral-100 bg-white/95 p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <Button asChild size="lg" className="w-full h-16 rounded-[24px] bg-[#FF6B00] text-lg font-black shadow-lg shadow-[#FF6B00]/20">
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
                  <p className="text-xs font-medium">₹{activeDailyEarn}/day · ₹{activeMonthlyEarn}</p>

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
    <div className="mx-auto max-w-md px-5 pt-4 pb-[220px] space-y-6">
      <header>
        <h1 className="text-[28px] font-black tracking-tight text-[#1A1A1A] uppercase leading-none">BUILD YOUR ASSIGNMENT</h1>
      </header>

      <section className="space-y-4">
        <div className="space-y-1.5">
          <p className="text-[10px] font-black uppercase text-neutral-400 tracking-[0.2em] px-1">WORK AREA</p>
          <Link to="/app/area" className="flex items-center justify-between p-4 bg-white border border-neutral-100 rounded-[22px] shadow-sm active:scale-[0.98] transition-all">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#FF6B00]/10 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-[#FF6B00]" />
              </div>
              <p className="text-sm font-bold text-[#1A1A1A]">📍 {partner.home_area}</p>
            </div>
            <span className="text-[11px] font-black text-[#FF6B00] uppercase tracking-widest">Change</span>
          </Link>
        </div>

        <div className="flex items-center justify-between px-5 py-3 bg-neutral-50 border border-neutral-100 rounded-[20px]">
          <div className="space-y-0.5">
            <p className="text-[9px] font-black text-[#1A1A1A] uppercase tracking-widest">CUSTOMERS AVAILABLE NOW</p>
            <p className="text-xl font-black text-neutral-900">0</p>
          </div>
          <p className="text-[9px] font-bold text-neutral-400 text-right max-w-[120px] leading-tight">"New customers can be added anytime."</p>
        </div>
      </section>

      <section className="space-y-6">
        {/* 1. HOURS PER DAY */}
        <div className="space-y-3">
          <div className="flex items-end justify-between px-1">
            <label className="text-[11px] font-black text-[#1A1A1A] uppercase tracking-[0.2em]">HOW MANY HOURS PER DAY?</label>
            <span className="text-xl font-black text-[#FF6B00]">{hours} HOURS</span>
          </div>

          <div className="px-1 space-y-4">
            <Slider 
              value={[hours]} 
              min={settings?.minHours ?? 2} 
              max={settings?.maxHours ?? 6} 
              step={0.5} 
              onValueChange={([v]) => setHours(v)}
              className="py-2"
            />
            
            <div className="grid grid-cols-2 gap-3">
               <div className="bg-[#1A1A1A] p-4 rounded-[22px] border border-white/5 shadow-lg relative overflow-hidden group">
                 <div className="absolute top-0 right-0 w-12 h-12 bg-[#FF6B00]/10 rounded-full blur-xl -mr-6 -mt-6" />
                 <div className="space-y-3 relative z-10">
                   <div className="flex flex-col gap-1">
                     <p className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em]">WORKING HOURS</p>
                     <Clock className="h-4 w-4 text-[#FF6B00]" />
                   </div>
                   <p className="text-[13px] font-bold text-white tracking-tight leading-none whitespace-nowrap">
                     {formatTime12(startTime)} → {formatTime12(finishTime)}
                   </p>
                 </div>
               </div>
               
               <div className="bg-[#1A1A1A] p-4 rounded-[22px] border border-white/5 shadow-lg relative overflow-hidden group">
                 <div className="absolute top-0 right-0 w-12 h-12 bg-[#FF6B00]/10 rounded-full blur-xl -mr-6 -mt-6" />
                 <div className="space-y-3 relative z-10">
                   <div className="flex flex-col gap-1">
                     <p className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em]">CUSTOMER TARGET</p>
                     <Car className="h-4 w-4 text-[#FF6B00]" />
                   </div>
                   <p className="text-[13px] font-bold text-white tracking-tight leading-none whitespace-nowrap">
                     <span className="text-[#FF6B00]">{cars}</span> CUSTOMERS
                   </p>
                 </div>
               </div>
            </div>
          </div>
        </div>

        {/* 2. DAYS TO COMMIT */}
        <div className="space-y-3">
          <div className="flex items-end justify-between px-1">
            <label className="text-[11px] font-black text-[#1A1A1A] uppercase tracking-[0.2em]">HOW MANY DAYS TO COMMIT?</label>
            <span className="text-xl font-black text-[#FF6B00]">{duration} DAYS</span>
          </div>

          <div className="px-1 space-y-3">
            <Slider 
              value={[duration]} 
              min={7} 
              max={30} 
              step={1} 
              onValueChange={([v]) => setDuration(v)}
              className="py-2"
            />
            <div className="space-y-3">
              <div className="flex justify-between text-[10px] font-black text-neutral-400 uppercase tracking-widest px-0.5">
                <span>7 DAYS</span>
                <span>30 DAYS</span>
              </div>
              
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-black text-neutral-900 uppercase tracking-widest px-0.5">
                  {duration} CALENDAR DAYS
                </p>
                <div className="flex items-center gap-2 text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] bg-emerald-50 w-fit px-3 py-1.5 rounded-full border border-emerald-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {serviceDays} SERVICE DAYS • MONDAYS OFF
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4 pb-4">
        <div className="p-6 border-0 shadow-2xl bg-[#1A1A1A] text-white rounded-[32px] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#FF6B00]/20 rounded-full blur-[80px] -mr-24 -mt-24" />
          <div className="space-y-6 relative z-10">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.3em]">YOUR EARNING</p>
              <div className="h-px bg-white/5 w-full mt-2" />
            </div>
            
            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-1.5">
                <p className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em]">DAILY EARNING</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-[#FF6B00]">₹{dailyEarn.toLocaleString("en-IN")}</span>
                  <span className="text-[10px] text-white/30 uppercase font-black tracking-widest">/ DAY</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em]">
                    FOR YOUR {duration}-DAY ASSIGNMENT
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-white tracking-tighter">₹{assignmentEarn.toLocaleString("en-IN")}</span>
                  </div>
                </div>
                
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2 text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] bg-white/5 w-fit px-3 py-1.5 rounded-lg border border-white/5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {serviceDays} SERVICE DAYS
                  </div>
                  <p className="text-[9px] text-white/30 font-bold italic tracking-tight leading-tight">
                    Calculated using your selected days. Mondays are always off.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* Earning Card is already replaced in the previous block */}
    

      <div className="fixed inset-x-0 bottom-[70px] z-30 border-t border-[rgba(0,0,0,0.03)] bg-white/95 backdrop-blur-xl p-4 px-[30px] pb-[calc(16px+env(safe-area-inset-bottom))]">
        <Button 
          size="lg" 
          className="w-full h-[64px] rounded-[24px] bg-[#FF6B00] hover:bg-[#E56000] text-white font-black text-lg shadow-xl shadow-[#FF6B00]/25 active:scale-[0.97] transition-all flex items-center justify-center gap-3"
          onClick={() => setConfirmOpen(true)}
          disabled={accept.isPending}
        >
          {accept.isPending ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>CREATING ASSIGNMENT...</span>
            </>
          ) : (
            <>
              <span className="uppercase tracking-tight">START MY ASSIGNMENT</span>
              <span className="text-2xl leading-none">→</span>
            </>
          )}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-[32px] max-w-[92vw] border-0 p-6 overflow-hidden">
          <AlertDialogHeader className="space-y-1 mb-6">
            <AlertDialogTitle className="text-2xl font-black text-[#1A1A1A] uppercase tracking-tight">
              CREATE ASSIGNMENT
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] font-medium text-neutral-500">
              Review your assignment before starting.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-5">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 rounded-full">
                <MapPin className="h-3.5 w-3.5 text-[#FF6B00]" />
                <span className="text-[11px] font-bold text-[#1A1A1A]">{partner.home_area}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 rounded-full">
                <Clock className="h-3.5 w-3.5 text-[#FF6B00]" />
                <span className="text-[11px] font-bold text-[#1A1A1A] uppercase">{duration} DAYS</span>
              </div>
            </div>

            <Card className="p-6 bg-[#1A1A1A] border-0 shadow-2xl rounded-[28px] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF6B00]/10 rounded-full blur-3xl -mr-16 -mt-16" />
              
              <div className="space-y-6 relative z-10">
                <div className="space-y-1">
                  <p className="text-[9px] font-black uppercase text-white/40 tracking-[0.2em]">ASSIGNMENT SUMMARY</p>
                  <div className="h-px bg-white/5 w-full mt-2" />
                </div>

                <div className="grid grid-cols-1 gap-5">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black uppercase text-white/30 tracking-wider">CUSTOMER TARGET</p>
                    <p className="text-xl font-black text-white uppercase tracking-tight">{cars} CUSTOMERS</p>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-white/5">
                    <p className="text-[9px] font-black uppercase text-white/30 tracking-wider">ASSIGNMENT EARNING</p>
                    <p className="text-3xl font-black text-[#FF6B00]">₹{assignmentEarn.toLocaleString("en-IN")}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">{serviceDays} SERVICE DAYS</p>
                    </div>
                  </div>
                  
                  <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest text-right">Mondays Off</p>
                </div>
              </div>
            </Card>
          </div>

          <AlertDialogFooter className="flex-row gap-3 mt-8 sm:space-x-0">
            <AlertDialogCancel 
              disabled={accept.isPending}
              className="flex-1 h-14 rounded-[20px] mt-0 font-black text-[13px] uppercase tracking-widest border-neutral-200 text-neutral-500 bg-white"
            >
              BACK
            </AlertDialogCancel>
            <AlertDialogAction 
              disabled={accept.isPending}
              className="flex-1 h-14 rounded-[20px] bg-[#FF6B00] hover:bg-[#E56000] text-white font-black text-[13px] uppercase tracking-widest shadow-lg shadow-[#FF6B00]/20"
              onClick={(e) => {
                e.preventDefault();
                accept.mutate();
              }}
            >
              {accept.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "CONFIRM"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
