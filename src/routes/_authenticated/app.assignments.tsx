import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
// Checkbox no longer used after Working Days removal.
import { Progress } from "@/components/ui/progress";
import {
  Loader2, MapPin, IndianRupee, CheckCircle2, BellRing, Crosshair,
  AlertTriangle, Inbox, UserRound, Clock, TrendingUp, CalendarDays, Route as RouteIcon,
  ArrowRight, Sparkles, Timer,
} from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useRef, useState } from "react";
import { OfflineGuard } from "@/components/OfflineGuard";
import { useI18n } from "@/lib/i18n";
import { formatTime12 } from "@/lib/format";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

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
  const span = max - min;
  const recoLo = min + span * 0.28;
  const recoHi = min + span * 0.52;
  if (days <= min + span * 0.15) return { label: "Flexible", tone: "flex" };
  if (days >= min + span * 0.75) return { label: "Maximum Priority", tone: "max" };
  if (days >= recoLo && days <= recoHi) return { label: "⭐ Recommended", tone: "reco" };
  return { label: "Consistent", tone: "reco" };
}

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

  const { data: preview, isFetching, error: previewError } = useQuery({
    queryKey: ["preview", cars, duration],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("preview_assignment", { p_cars: cars, p_duration: duration });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: !active && hasArea,
    retry: 1,
  });

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
    onError: (e: any) => toast.error(friendlyError(e)),
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

  const previewMessage = preview ? String((preview as any).message ?? "") : "";
  const availableInArea = preview ? Number((preview as any).available_customers ?? 0) : 0;
  const acceptableCars = Math.min(cars, availableInArea);

  const startTime = computeStartTime(cars, startRules);
  const finishTime = addHours(startTime, hours);

  const dailyEarn = cars * rate;
  const dailyFuel = Math.round(cars * fuelPerCar);
  const dailyNet = dailyEarn - dailyFuel;

  const acceptableEarn = acceptableCars * rate;

  // Monthly forecast: Urban Wash schedules 6 days/week (Monday is the platform's
  // fixed weekly off). Over a 30-day window that averages ~26 working days.
  // Commitment-driven totals — duration is the number of working days, so
  // everything scales with both hours (via `cars`) and the selected commitment.
  const planWorkingDays = duration;
  const planServices = planWorkingDays * cars;
  const planGrossEarn = planServices * rate;
  const planFuel = fuelEnabled ? Math.round(planServices * fuelPerCar) : 0;
  const planNetEarn = planGrossEarn - planFuel;

  const fullyAvailable = preview && availableInArea >= cars;
  const partialAvailable = preview && availableInArea > 0 && availableInArea < cars;
  const noneAvailable = preview && availableInArea === 0;
  const growthPct = cars > 0 ? Math.min(100, Math.round((availableInArea / cars) * 100)) : 0;

  const estKm = Math.max(1, Math.round(cars * 0.35 * 10) / 10);
  const avgMinPerCustomer = Math.max(1, Math.round((hours * 60) / Math.max(1, cars)));
  const animCars = useAnimatedNumber(cars);
  const animEarn = useAnimatedNumber(dailyEarn);
  const commitment = commitmentLabel(duration, minDays, maxDays);

  return (
    <div className="mx-auto max-w-md px-5 pt-5 pb-32">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Build Today's Route</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose your working hours. We'll build the best route automatically.
          </p>
        </div>
        <Link to="/app/area" className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
          <MapPin className="h-3 w-3" />{partner.home_area}
        </Link>
      </div>

      {/* Work today — single consolidated card */}
      <Card className="mt-5 p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Work today</p>
          <p className="text-3xl font-semibold tracking-tight">{hours}<span className="ml-1 text-base text-muted-foreground">Hours</span></p>
        </div>
        <Slider value={[hours]} min={minHours} max={maxHours} step={1} onValueChange={(v) => setHours(v[0])} className="mt-4" />
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          <span>{minHours}h</span><span>{maxHours}h</span>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4">
          <div>
            <p className="text-2xl font-bold tabular-nums">{animCars}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Customers</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold tabular-nums text-primary">₹{animEarn.toLocaleString("en-IN")}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Earnings</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums">~{estKm}<span className="ml-0.5 text-sm font-normal text-muted-foreground">km</span></p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Distance</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Clock className="h-3.5 w-3.5" />Working time</span>
          <span className="font-semibold tabular-nums">{formatTime12(startTime)} – {formatTime12(finishTime)}</span>
        </div>
        {isFetching && <p className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Updating estimate…</p>}
      </Card>

      {/* Commitment — compact */}
      <Card className="mt-3 p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Commitment</p>
            <p className={`mt-1 text-[11px] font-medium ${
              commitment.tone === "max" ? "text-primary"
              : commitment.tone === "reco" ? "text-[color:var(--success)]"
              : "text-muted-foreground"
            }`}>{commitment.label}</p>
          </div>
          <p className="text-3xl font-semibold tracking-tight">{duration}<span className="ml-1 text-base text-muted-foreground">Days</span></p>
        </div>
        <Slider value={[duration]} min={minDays} max={maxDays} step={1} onValueChange={(v) => { setDurationTouched(true); setDuration(v[0]); }} className="mt-4" />
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>{minDays} days</span><span>{maxDays} days</span></div>
        <p className="mt-3 text-[11px] text-muted-foreground">Weekly payout · Priority customers · {offDayFull}s off</p>
      </Card>

      {previewError && (
        <Card className="mt-3 border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{friendlyError(previewError)}</span></div>
        </Card>
      )}

      {/* Today's availability — simplified */}
      {preview && (
        <Card className={`mt-3 p-5 ${fullyAvailable ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5"}`}>
          {fullyAvailable ? (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <p><span className="font-semibold">{cars} customers ready</span> in {partner.home_area}</p>
            </div>
          ) : partialAvailable ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today's availability</p>
              <div className="mt-2 flex items-end justify-between">
                <div>
                  <p className="text-3xl font-bold tabular-nums">{availableInArea}</p>
                  <p className="text-[11px] text-muted-foreground">Customers ready</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold tabular-nums text-muted-foreground">Expected {cars}</p>
                </div>
              </div>
              <Progress value={growthPct} className="mt-3 h-2" />
              <p className="mt-2 text-[11px] text-muted-foreground">Customers keep joining until morning.</p>
              <Button asChild size="sm" variant="outline" className="mt-3 w-full">
                <Link to="/app/area"><MapPin className="mr-2 h-4 w-4" />Change area</Link>
              </Button>
            </div>
          ) : (
            <div>
              <div className="flex items-start gap-2">
                <TrendingUp className="mt-0.5 h-4 w-4 text-warning" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">Looking for customers…</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    We'll notify you instantly when routes become available in {partner.home_area}.
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/app/area"><Crosshair className="mr-2 h-4 w-4" />Use current location</Link>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/app/area"><MapPin className="mr-2 h-4 w-4" />Change area</Link>
                </Button>
                <Button size="sm" variant="ghost"
                  disabled={toggleNotify.isPending || partner.notify_when_customers_added}
                  onClick={() => toggleNotify.mutate(true)}>
                  <BellRing className="mr-2 h-4 w-4" />
                  {partner.notify_when_customers_added ? "We'll notify you" : "Notify me"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}




      {/* Nearby requests — only when relevant */}
      {(loadingBookings || bookingRequests.length > 0) && (
        <Card className="mt-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nearby requests</p>
              <h2 className="mt-1 text-base font-semibold">
                {bookingRequests.length > 0 ? `${bookingRequests.length} pending booking${bookingRequests.length === 1 ? "" : "s"}` : "Checking…"}
              </h2>
            </div>
            <Inbox className="h-5 w-5 text-primary" />
          </div>
          <div className="mt-3 space-y-2">
            {bookingRequests.slice(0, 4).map((b: any) => (
              <div key={b.booking_id} className="rounded-xl border border-border p-3">
                <div className="flex items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground"><UserRound className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{b.service_name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{b.customer_name} · {b.vehicle_label || "Vehicle"} {b.registration_number ? `· ${b.registration_number}` : ""}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{b.scheduled_date} · {b.scheduled_time || "Flexible"} · ₹{b.total_amount}</p>
                  </div>
                </div>
                <Button size="sm" className="mt-3 w-full" disabled={claimBooking.isPending} onClick={() => claimBooking.mutate(b.booking_id)}>
                  {claimBooking.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Accept booking
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {previewMessage && fullyAvailable && (
        <Card className="mt-3 border-warning/40 bg-warning/10 p-4 text-sm text-warning-foreground">{previewMessage}</Card>
      )}

      {/* First payout — slim info banner */}
      <button
        type="button"
        onClick={() => toast.message("First payout", {
          description: "We hold your first week's earnings to protect against chargebacks. Once you've completed 15 active service days, all held earnings are released to your account. From then on, payouts continue on your chosen weekly schedule.",
        })}
        className="mt-3 flex w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent/40"
      >
        <IndianRupee className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="flex-1">First payout releases after your first 15 active service days.</span>
        <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-primary">Learn more <ArrowRight className="h-3 w-3" /></span>
      </button>


      {/* Sticky CTA — always primary, action varies with availability */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-md p-4">
          {accept.isPending ? (
            <Button size="lg" className="h-auto w-full py-3" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating route…
            </Button>
          ) : isFetching && !preview ? (
            <Button size="lg" className="h-auto w-full py-3" variant="secondary" disabled>
              Checking customers…
            </Button>
          ) : noneAvailable ? (
            <Button
              size="lg"
              className="h-auto w-full py-3"
              disabled={toggleNotify.isPending || partner.notify_when_customers_added}
              onClick={() => toggleNotify.mutate(true)}
            >
              <span className="flex flex-col items-center leading-tight">
                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                  <BellRing className="h-4 w-4" />
                  {partner.notify_when_customers_added ? "We'll notify you" : "Notify me when routes open"}
                </span>
                <span className="text-[11px] font-normal opacity-90">Searching nearby in {partner.home_area}</span>
              </span>
            </Button>
          ) : partialAvailable ? (
            <Button
              size="lg"
              className="h-auto w-full py-3"
              onClick={() => accept.mutate(availableInArea)}
            >
              <span className="flex flex-col items-center leading-tight">
                <span className="inline-flex items-center gap-2 text-base font-semibold">
                  Start Route <ArrowRight className="h-4 w-4" />
                </span>
                <span className="mt-0.5 text-[11px] font-normal opacity-90">{availableInArea} customer{availableInArea === 1 ? "" : "s"} ready · ₹{acceptableEarn.toLocaleString("en-IN")}</span>
              </span>
            </Button>

          ) : (
            <Button
              size="lg"
              className="h-auto w-full py-3"
              onClick={() => accept.mutate(cars)}
            >
              <span className="flex flex-col items-center leading-tight">
                <span className="inline-flex items-center gap-2 text-base font-semibold">
                  Start Route <ArrowRight className="h-4 w-4" />
                </span>
                <span className="mt-0.5 text-[11px] font-normal opacity-90">{cars} customers · ₹{dailyEarn.toLocaleString("en-IN")} · {formatTime12(startTime)}</span>
              </span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}


