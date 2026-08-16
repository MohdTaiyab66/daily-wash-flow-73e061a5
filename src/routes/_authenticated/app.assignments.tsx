import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Loader2, MapPin, IndianRupee,
  Car, Clock, TrendingUp,
} from "lucide-react";
import { PartnerShell } from "@/components/partner/PartnerShell";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";
import { OfflineGuard } from "@/components/OfflineGuard";
import { useI18n } from "@/lib/i18n";
import { formatTime12 } from "@/lib/format";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function useAnimatedNumber(value: number, duration = 380) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    const from = display;
    fromRef.current = from;
    startRef.current = null;
    let raf = 0;
    const step = (t: number) => {
      if (startRef.current == null) startRef.current = t;
      const p = Math.min(1, (t - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return display;
}

function commitmentLabel(days: number, min: number, max: number): { label: string } {
  return { label: days >= 21 ? "Priority Partner" : "Starter" };
}

export const Route = createFileRoute("/_authenticated/app/assignments")({
  component: () => <OfflineGuard label="assignment builder"><PartnerShell><AssignmentsPage /></PartnerShell></OfflineGuard>,
});

const DEFAULT_START_RULES = [
  { max_cars: 15, start_time: "07:00" },
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

  const { data: active } = useQuery({
    queryKey: ["active-assignment-builder"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase.from("assignments").select("id,status,end_date")
        .eq("partner_id", u.user.id).eq("status", "active").gte("end_date", today).maybeSingle();
      return data;
    },
  });

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
    queryKey: ["assignment-settings-v2"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings").select("key,value").in("key", [
        "min_hours_per_day", "max_hours_per_day", "cars_per_hour", "rate_per_car", "assignment_min_days", "assignment_max_days", "assignment_default_days"
      ]);
      const m: Record<string, any> = {};
      (data ?? []).forEach((s: any) => (m[s.key] = s.value));
      return {
        rate: Number(m.rate_per_car ?? 17),
        minHours: Number(m.min_hours_per_day ?? 2),
        maxHours: Number(m.max_hours_per_day ?? 6),
        carsPerHour: Number(m.cars_per_hour ?? 6),
        minDays: 7, maxDays: 30, defaultDays: 30
      };
    },
  });

  const [hours, setHours] = useState(4);
  const [duration, setDuration] = useState(30);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const cars = Math.round(hours * (settings?.carsPerHour ?? 6));
  const rate = settings?.rate ?? 17;
  const startTime = computeStartTime(cars, DEFAULT_START_RULES);
  const finishTime = addHours(startTime, hours);
  const dailyEarn = cars * rate;
  const monthlyEarn = dailyEarn * SERVICE_DAYS_PER_MONTH;

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

  if (active) {
    return (
      <div className="mx-auto max-w-md px-5 pt-10 space-y-6 text-center">
        <h1 className="text-3xl font-black text-[#1A1A1A]">Today's Assignment</h1>
        <Card className="p-8 rounded-3xl bg-neutral-50 border-0">
          <p className="font-bold">You have an active assignment.</p>
          <Button onClick={() => navigate({ to: "/app/live" })} className="mt-4 w-full h-12 rounded-2xl bg-[#FF6B00]">Manage Today's Work</Button>
        </Card>
      </div>
    );
  }

  if (!partner?.home_area) return <div className="p-5">Please select your work area first.</div>;

  return (
    <div className="mx-auto max-w-md px-5 pt-3 pb-[140px] space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight text-[#1A1A1A]">Build Your Assignment</h1>
        <p className="text-sm text-muted-foreground font-medium">Choose how much you want to work.</p>
      </header>

      <section>
        <div className="flex items-center justify-between p-4 bg-white border border-neutral-100 rounded-2xl shadow-sm">
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Work Area</p>
            <p className="text-sm font-bold">{partner.home_area}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app/area" })}>Change</Button>
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <label className="text-base font-bold text-[#1A1A1A]">How many hours do you want to work?</label>
          <p className="text-[13px] font-bold text-[#FF6B00]">{hours} HOURS / DAY</p>
          <Slider value={[hours]} min={settings?.minHours ?? 2} max={settings?.maxHours ?? 6} step={0.5} onValueChange={([v]) => setHours(v)} />
          <p className="text-xs text-neutral-400 mt-2">{formatTime12(startTime)} → {formatTime12(finishTime)}</p>
        </div>

        <div>
          <label className="text-base font-bold text-[#1A1A1A]">How many days do you want to work?</label>
          <p className="text-[13px] font-bold text-[#FF6B00]">{duration} DAYS</p>
          <Slider value={[duration]} min={7} max={30} step={1} onValueChange={([v]) => setDuration(v)} />
        </div>
      </section>

      <Card className="p-6 border-0 shadow-sm bg-white rounded-3xl">
        <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-[#1A1A1A]">₹{monthlyEarn.toLocaleString("en-IN")}</span>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">MONTHLY</span>
        </div>
        <div className="pt-6 border-t border-neutral-100 space-y-2">
            <p className="text-sm">Daily earning: <span className="font-bold">₹{dailyEarn}</span></p>
            <p className="text-sm">Target: <span className="font-bold">{cars} customers</span></p>
            <p className="text-[11px] text-neutral-500">26 service days/month • Mondays OFF</p>
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-[70px] z-30 border-t border-neutral-100 bg-white/95 p-4">
        <Button size="lg" className="w-full h-14 rounded-3xl bg-[#FF6B00] text-lg font-black" onClick={() => setConfirmOpen(true)}>
          START MY ASSIGNMENT →
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start Assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              Accept {cars} customers in {partner.home_area}. Monthly earnings: ₹{monthlyEarn.toLocaleString("en-IN")}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={() => accept.mutate()}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
