import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import {
  Loader2, MapPin, IndianRupee, CheckCircle2, BellRing, Crosshair,
  AlertTriangle, Inbox, UserRound, TrendingUp,
  ArrowRight, ChevronDown, Clock, Navigation,
} from "lucide-react";
import { MarketplaceOffersList } from "@/components/partner/MarketplaceOffersList";


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

// Small tween hook so estimates animate as sliders move — feels premium.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return display;
}

function commitmentLabel(days: number, min: number, max: number): { label: string; tone: "flex" | "reco" | "max" } {
  const span = Math.max(1, max - min);
  const ratio = (days - min) / span;
  if (ratio >= 0.75) return { label: "Priority Partner", tone: "max" };
  if (ratio >= 0.4) return { label: "Regular Partner", tone: "reco" };
  if (ratio >= 0.15) return { label: "Consistent", tone: "reco" };
  return { label: "Starter", tone: "flex" };
}

const MOTIVATION_TIPS = [
  { emoji: "🚀", head: "High-performing partners", tail: "receive more recurring customers over time." },
  { emoji: "🔥", head: "Complete today's route", tail: "to unlock more regular customers." },
  { emoji: "⭐", head: "Partners with high ratings", tail: "receive priority customers." },
  { emoji: "💰", head: "Longer commitments", tail: "increase monthly earnings." },
  { emoji: "🏆", head: "Consistent partners", tail: "get better routes and premium areas." },
];

export const Route = createFileRoute("/_authenticated/app/assignments")({
  component: () => <OfflineGuard label="assignment builder"><AssignmentsPage /></OfflineGuard>,
});

type StartRule = { max_cars: number; start_time: string };

const DEFAULT_START_RULES: StartRule[] = [
  { max_cars: 15, start_time: "07:00" },
  { max_cars: 20, start_time: "06:30" },
  { max_cars: 25, start_time: "06:00" },
  { max_cars: 30, start_time: "05:30" },
  { max_cars: 36, start_time: "05:00" },
];

const DAYS = [
  { key: 1, label: "Mon", full: "Monday" },
  { key: 2, label: "Tue", full: "Tuesday" },
  { key: 3, label: "Wed", full: "Wednesday" },
  { key: 4, label: "Thu", full: "Thursday" },
  { key: 5, label: "Fri", full: "Friday" },
  { key: 6, label: "Sat", full: "Saturday" },
  { key: 0, label: "Sun", full: "Sunday" },
];

const DAY_NAME_TO_KEY: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

function computeStartTime(cars: number, rules: StartRule[]): string {
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
  const { t } = useI18n();

  useRealtimeInvalidation(["platform_settings", "customers"],
    [["assignment-settings-v2"], ["me-partner-builder"]]);

  const { data: settings } = useQuery({
    queryKey: ["assignment-settings-v2"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings").select("key,value").in("key", [
        "min_cars_required", "max_cars_allowed", "rate_per_car",
        "min_hours_per_day", "max_hours_per_day", "cars_per_hour",
        "minutes_per_car", "fuel_cost_per_car", "start_time_rules", "weekly_off_day",
        "avg_bike_mileage_kmpl", "fuel_price_per_litre", "fuel_calc_enabled",
        "assignment_min_days", "assignment_max_days", "assignment_default_days",
      ]);
      const m: Record<string, any> = {};
      (data ?? []).forEach((s: any) => (m[s.key] = s.value));
      const rules: StartRule[] = Array.isArray(m.start_time_rules) ? m.start_time_rules : DEFAULT_START_RULES;
      return {
        minCars: Math.max(1, Number(m.min_cars_required ?? 1)),
        maxCars: Number(m.max_cars_allowed ?? 30),
        rate: Number(m.rate_per_car ?? 17),
        minHours: Number(m.min_hours_per_day ?? 2),
        maxHours: Number(m.max_hours_per_day ?? 6),
        carsPerHour: Number(m.cars_per_hour ?? 6),
        minutesPerCar: Number(m.minutes_per_car ?? 10),
        fuelPerCar: Number(m.fuel_cost_per_car ?? 1.4),
        avgMileage: Number(m.avg_bike_mileage_kmpl ?? 40),
        fuelPrice: Number(m.fuel_price_per_litre ?? 105),
        fuelEnabled: m.fuel_calc_enabled !== false,
        startRules: rules,
        weeklyOff: typeof m.weekly_off_day === "string" ? m.weekly_off_day.toLowerCase() : "monday",
        minDays: Math.max(1, Number(m.assignment_min_days ?? 7)),
        maxDays: Math.max(1, Number(m.assignment_max_days ?? 90)),
        defaultDays: Math.max(1, Number(m.assignment_default_days ?? 30)),
      };
    },
  });

  const minHours = settings?.minHours ?? 2;
  const maxHours = settings?.maxHours ?? 6;
  const carsPerHour = settings?.carsPerHour ?? 6;
  const rate = settings?.rate ?? 17;
  const fuelPerCar = settings?.fuelPerCar ?? 1.4;
  const avgMileage = settings?.avgMileage ?? 40;
  const fuelEnabled = settings?.fuelEnabled ?? true;
  const startRules = settings?.startRules ?? DEFAULT_START_RULES;
  // Derive the max cars ceiling from the admin hour ceiling × cars-per-hour so
  // "6 Hours" always yields exactly 6 × carsPerHour cars (default 36) instead of
  // being clamped to a stale max_cars_allowed value.
  const maxCarsCeiling = Math.max(Number(settings?.maxCars ?? 0), maxHours * carsPerHour);
  const minCars = settings?.minCars ?? 1;
  const offDayKey = DAY_NAME_TO_KEY[settings?.weeklyOff ?? "monday"] ?? 1;
  const offDayFull = DAYS.find((d) => d.key === offDayKey)?.full ?? "Monday";

  // Commitment window is fixed to a partner-friendly 7–30 range so the slider
  // stays legible and consistent regardless of admin envelope.
  const minDays = Math.max(7, settings?.minDays ?? 7);
  const maxDays = Math.min(30, settings?.maxDays ?? 30);
  const defaultDays = Math.min(maxDays, Math.max(minDays, settings?.defaultDays ?? 15));

  const [hours, setHours] = useState(4);
  const [duration, setDuration] = useState(defaultDays);
  const [durationTouched, setDurationTouched] = useState(false);

  useEffect(() => {
    setHours((h) => Math.min(maxHours, Math.max(minHours, h)));
  }, [minHours, maxHours]);
  useEffect(() => {
    setDuration((d) => {
      if (!durationTouched) return defaultDays;
      return Math.min(maxDays, Math.max(minDays, d));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDays, maxDays, defaultDays]);

  const cars = useMemo(() => {
    const raw = Math.round(hours * carsPerHour);
    return Math.max(minCars, Math.min(maxCarsCeiling, raw));
  }, [hours, carsPerHour, minCars, maxCarsCeiling]);

  const { data: partner, isLoading: loadingPartner } = useQuery({
    queryKey: ["me-partner-builder"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("partners")
        .select("id,home_area,notify_when_customers_added").eq("id", u.user.id).maybeSingle();
      return data;
    },
  });

  const { data: active, isLoading: loadingActive } = useQuery({
    queryKey: ["active-assignment-builder"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase.from("assignments").select("id")
        .eq("partner_id", u.user.id).eq("status", "active").gte("end_date", today).maybeSingle();
      return data;
    },
  });

  const { data: bookingRequests = [], isLoading: loadingBookings } = useQuery({
    queryKey: ["partner-booking-requests"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_partner_booking_requests");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !active && !!partner?.home_area,
    refetchInterval: 30000,
  });

  // Active partners must NEVER see the onboarding/build flow. Send them to the
  // live route (map + ordered customer list + navigate/complete actions) which
  // is the single canonical "working" view for a partner with an assignment.
  useEffect(() => {
    if (active?.id) navigate({ to: "/app/live", replace: true });
  }, [active?.id, navigate]);

  const hasArea = !!partner?.home_area;

  const { data: preview, isFetching, error: previewError, dataUpdatedAt } = useQuery({
    queryKey: ["preview", cars, duration],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("preview_assignment", { p_cars: cars, p_duration: duration });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: !active && hasArea,
    retry: 1,
  });

  // Live "updated Xs ago" ticker for the estimates trust line.
  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);
  const updatedAgo = dataUpdatedAt ? Math.max(0, Math.round((nowTs - dataUpdatedAt) / 1000)) : null;
  const updatedAgoLabel = updatedAgo == null ? "" : updatedAgo < 5 ? "just now" : updatedAgo < 60 ? `${updatedAgo}s ago` : `${Math.floor(updatedAgo / 60)}m ago`;


  const friendlyError = (raw: any): string => {
    const msg = String(raw?.message ?? raw ?? "").toLowerCase();
    if (!msg) return "Something went wrong. Please try again.";
    if (msg.includes("already have an active assignment")) return "You already have an active route today.";
    if (msg.includes("select your work area")) return "Please choose your work area first.";
    if (msg.includes("no customers available")) return "No customers available in your area right now. Try a different area or come back soon.";
    if (msg.includes("cars must be at most")) return "That's more customers than allowed. Reduce your working hours and try again.";
    if (msg.includes("first assignment must be") || msg.includes("duration must be")) return "Please pick a commitment between 7 and 30 days.";
    if (msg.includes("not authenticated")) return "Please sign in again to continue.";
    // Never expose column/schema/DB errors to partners.
    if (msg.includes("column") || msg.includes("relation") || msg.includes("permission") || msg.includes("violates")) {
      return "We couldn't create your route right now. Please try again in a moment.";
    }
    return raw?.message ?? "Something went wrong. Please try again.";
  };

  const accept = useMutation({
    mutationFn: async (acceptCars: number) => {
      const { data, error } = await supabase.rpc("accept_assignment_v2", { p_cars: acceptCars, p_duration: duration });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Route created · heading to your live route");
      qc.invalidateQueries();
      navigate({ to: "/app/live" });
    },
    onError: (e: any) => {
      console.error("[accept_assignment_v2] raw error:", e);
      toast.error(friendlyError(e));
    },
  });

  const claimBooking = useMutation({
    mutationFn: async (bookingId: string) => {
      const { data, error } = await (supabase as any).rpc("claim_customer_booking", { p_booking_id: bookingId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Booking added to today's route");
      qc.invalidateQueries();
      navigate({ to: "/app/live" });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not accept booking"),
  });

  const toggleNotify = useMutation({
    mutationFn: async (on: boolean) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("partners").update({ notify_when_customers_added: on }).eq("id", u.user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("We'll notify you when new customers arrive in your area");
      qc.invalidateQueries({ queryKey: ["me-partner-builder"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not update"),
  });

  // ---- All hooks below must run on every render (no early returns above this) ----
  const previewSafe = preview as any;
  const availableInArea = previewSafe ? Number(previewSafe.available_customers ?? 0) : 0;
  const acceptableCars = Math.min(cars, availableInArea);
  const startTime = computeStartTime(cars, startRules);
  const finishTime = addHours(startTime, hours);
  const dailyEarn = cars * rate;
  const acceptableEarn = acceptableCars * rate;

  const fullyAvailable = !!previewSafe && availableInArea >= cars;
  const partialAvailable = !!previewSafe && availableInArea > 0 && availableInArea < cars;
  const noneAvailable = !!previewSafe && availableInArea === 0;
  const growthPct = cars > 0 ? Math.min(100, Math.round((availableInArea / cars) * 100)) : 0;
  const estKm = Math.max(1, Math.round(cars * 0.35 * 10) / 10);
  const previewMessage = previewSafe ? String(previewSafe.message ?? "") : "";

  // Working days across the commitment window, excluding the weekly-off day.
  const workingDays = useMemo(() => {
    const start = new Date();
    let count = 0;
    for (let i = 0; i < duration; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      if (d.getDay() !== offDayKey) count++;
    }
    return count;
  }, [duration, offDayKey]);

  const monthlyServices = workingDays * cars;
  const monthlyEarn = workingDays * dailyEarn;
  
  // Potential monthly includes both currently configured assignment and extra available work
  const potentialMonthlyExtra = (bookingRequests ?? []).reduce((sum: number, req: any) => {
    return sum + (Number((req as any).incentive || rate) * workingDays);
  }, 0);
  
  const totalPotentialMonthly = monthlyEarn + potentialMonthlyExtra;

  const perDayEarn = workingDays > 0 ? Math.round(monthlyEarn / workingDays) : 0;

  const animCars = useAnimatedNumber(cars);
  const animEarn = useAnimatedNumber(dailyEarn);
  const animMonthly = useAnimatedNumber(monthlyEarn);
  const animMonthlyServices = useAnimatedNumber(monthlyServices);
  const animPerDay = useAnimatedNumber(perDayEarn);
  const commitment = commitmentLabel(duration, minDays, maxDays);
  const tipOfDay = MOTIVATION_TIPS[new Date().getDate() % MOTIVATION_TIPS.length];
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCars, setConfirmCars] = useState(0);

  // ---- Conditional early returns AFTER all hooks ----
  if (loadingActive || loadingPartner || active) {
    return <div className="mx-auto max-w-md p-5 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!hasArea) {
    return (
      <div className="mx-auto max-w-md px-5 pt-5 pb-32">
        <h1 className="text-2xl font-semibold tracking-tight">{t("build_your_assignment")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Step 1 of 2</p>
        <Card className="mt-5 p-6 text-center">
          <MapPin className="mx-auto h-10 w-10 text-primary" />
          <h2 className="mt-3 text-lg font-semibold">Choose your work area first</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We need to know where you'll service customers before we can show you available cars and earnings.
          </p>
          <Button asChild size="lg" className="mt-5 w-full">
            <Link to="/app/area"><Crosshair className="mr-2 h-4 w-4" />Select work area / use current location</Link>
          </Button>
        </Card>
      </div>
    );
  }



  return (
    <div className="mx-auto max-w-md px-5 pt-3 pb-32 space-y-6">
      <header>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Today's Work</p>
          <Link to="/app/area" className="flex items-center gap-1.5 px-3 py-1 bg-neutral-100 rounded-full text-[10px] font-bold text-neutral-600 uppercase tracking-wider">
            <MapPin className="h-3 w-3" />
            {partner.home_area}
          </Link>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Available Work</h1>
      </header>

      {/* COMPACT SUMMARY */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border rounded-2xl p-3 flex flex-col items-center text-center shadow-sm">
          <p className="text-lg font-bold">{availableInArea}</p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Customers</p>
        </div>
        <div className="bg-white border rounded-2xl p-3 flex flex-col items-center text-center shadow-sm">
          <p className="text-lg font-bold text-primary">₹{acceptableEarn}</p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Earnings</p>
        </div>
        <div className="bg-white border rounded-2xl p-3 flex flex-col items-center text-center shadow-sm">
          <p className="text-lg font-bold">{estKm}km</p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Distance</p>
        </div>
      </div>

      {/* CUSTOMER AVAILABILITY LIST */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Nearby Customers</h3>
          <span className="text-[10px] font-medium text-muted-foreground">Updated {updatedAgoLabel}</span>
        </div>

        {isFetching && !previewSafe && (
          <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-3 opacity-20" />
            <p className="text-xs">Finding customers nearby...</p>
          </div>
        )}

        {noneAvailable && !isFetching && (
          <Card className="p-8 text-center border-dashed bg-neutral-50/50">
            <Inbox className="h-10 w-10 text-neutral-200 mx-auto mb-3" />
            <h3 className="text-sm font-bold mb-1">No customers right now</h3>
            <p className="text-xs text-muted-foreground mb-4">
              We'll notify you as soon as new work arrives in {partner.home_area}.
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              className="rounded-xl h-9 font-bold"
              onClick={() => toggleNotify.mutate(!partner.notify_when_customers_added)}
            >
              <BellRing className={cn("mr-2 h-3.5 w-3.5", partner.notify_when_customers_added && "fill-primary text-primary")} />
              {partner.notify_when_customers_added ? "Notifications On" : "Notify Me"}
            </Button>
          </Card>
        )}

        <div className="space-y-3">
          {/* MarketplaceOffersList handles the actual customer cards/offers */}
          <MarketplaceOffersList />
        </div>
      </section>

      {/* STICKY BOTTOM CTA */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-neutral-100 bg-white/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-md p-4">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Potential Total</span>
              <span className="text-lg font-bold">₹{acceptableEarn}</span>
            </div>
            <div className="text-right flex flex-col items-end">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Target Start</span>
              <span className="text-xs font-bold">{formatTime12(startTime)}</span>
            </div>
          </div>
          
          <Button 
            size="lg" 
            className="w-full h-14 rounded-2xl bg-neutral-900 text-white font-bold text-lg shadow-xl shadow-neutral-200 active:scale-[0.98] transition-all disabled:opacity-50"
            disabled={acceptableCars === 0 || accept.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {accept.isPending ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <>
                Start with {acceptableCars} Customer{acceptableCars !== 1 ? 's' : ''}
                <ArrowRight className="ml-2 h-5 w-5" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* CONFIRMATION DIALOG */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-3xl max-w-[90vw]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">Confirm Selection</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              You are accepting {acceptableCars} customer(s) in {partner.home_area}. 
              Your estimated earning is ₹{acceptableEarn}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-3">
             <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-2xl border border-neutral-100">
               <div className="h-10 w-10 bg-white rounded-xl border border-neutral-100 flex items-center justify-center">
                 <Clock className="h-5 w-5 text-primary" />
               </div>
               <div>
                 <p className="text-[10px] font-bold uppercase text-muted-foreground">Start Time</p>
                 <p className="text-sm font-bold">{formatTime12(startTime)}</p>
               </div>
             </div>
             <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-2xl border border-neutral-100">
               <div className="h-10 w-10 bg-white rounded-xl border border-neutral-100 flex items-center justify-center">
                 <Navigation className="h-5 w-5 text-primary" />
               </div>
               <div>
                 <p className="text-[10px] font-bold uppercase text-muted-foreground">Route Distance</p>
                 <p className="text-sm font-bold">{estKm} km total</p>
               </div>
             </div>
          </div>
          <AlertDialogFooter className="flex-row gap-3">
            <AlertDialogCancel className="flex-1 h-12 rounded-xl mt-0 font-bold border-2">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="flex-1 h-12 rounded-xl bg-primary text-white font-bold"
              onClick={() => accept.mutate(acceptableCars)}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}



