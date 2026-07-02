import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Loader2, MapPin, IndianRupee, CheckCircle2, Sun, BellRing, Crosshair,
  AlertTriangle, Inbox, UserRound, Clock, Fuel, TrendingUp, CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { OfflineGuard } from "@/components/OfflineGuard";
import { useI18n } from "@/lib/i18n";
import { formatTime12 } from "@/lib/format";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

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
  const maxCars = settings?.maxCars ?? 30;
  const minCars = settings?.minCars ?? 1;
  const offDayKey = DAY_NAME_TO_KEY[settings?.weeklyOff ?? "monday"] ?? 1;
  const offDayFull = DAYS.find((d) => d.key === offDayKey)?.full ?? "Monday";

  const [hours, setHours] = useState(4);
  const [duration, setDuration] = useState(15);
  const [workingDays, setWorkingDays] = useState<Set<number>>(
    new Set([0, 2, 3, 4, 5, 6]), // Sunday + Tue–Sat by default, Monday off
  );

  // Keep hours within admin bounds when settings change
  useEffect(() => {
    setHours((h) => Math.min(maxHours, Math.max(minHours, h)));
  }, [minHours, maxHours]);

  // Ensure the off day is never selected
  useEffect(() => {
    setWorkingDays((prev) => {
      if (!prev.has(offDayKey)) return prev;
      const next = new Set(prev);
      next.delete(offDayKey);
      return next;
    });
  }, [offDayKey]);

  const cars = useMemo(() => {
    const raw = Math.round(hours * carsPerHour);
    return Math.max(minCars, Math.min(maxCars, raw));
  }, [hours, carsPerHour, minCars, maxCars]);

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

  useEffect(() => {
    if (active?.id) navigate({ to: "/app/my-assignment", replace: true });
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

  const accept = useMutation({
    mutationFn: async (acceptCars: number) => {
      const { data, error } = await supabase.rpc("accept_assignment_v2", { p_cars: acceptCars, p_duration: duration });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Assignment accepted · route optimised");
      qc.invalidateQueries();
      navigate({ to: "/app/my-assignment" });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not accept"),
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
  const acceptableFuel = Math.round(acceptableCars * fuelPerCar);
  const acceptableNet = acceptableEarn - acceptableFuel;

  const workingDayCount = workingDays.size;
  // Monthly forecast: approx working days in a 30-day window based on the weekly pattern.
  const monthlyWorkingDays = Math.round((workingDayCount / 7) * 30);
  const monthlyCars = monthlyWorkingDays * cars;
  const monthlyEarn = monthlyCars * rate; // gross, no deductions

  const fullyAvailable = preview && availableInArea >= cars;
  const partialAvailable = preview && availableInArea > 0 && availableInArea < cars;
  const noneAvailable = preview && availableInArea === 0;
  const growthPct = cars > 0 ? Math.min(100, Math.round((availableInArea / cars) * 100)) : 0;

  const toggleDay = (k: number) => {
    if (k === offDayKey) return;
    setWorkingDays((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-md px-5 pt-5 pb-32">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("build_your_assignment")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Choose how many hours you'd like to work each day. We'll automatically calculate your customers, route and earnings.</p>
        </div>
        <Link to="/app/area" className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
          <MapPin className="h-3 w-3" />{partner.home_area}
        </Link>
      </div>

      {/* Hours slider */}
      <Card className="mt-5 p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Hours per day</p>
          <p className="text-3xl font-semibold tracking-tight">{hours}<span className="ml-1 text-base text-muted-foreground">Hours</span></p>
        </div>
        <Slider value={[hours]} min={minHours} max={maxHours} step={1} onValueChange={(v) => setHours(v[0])} className="mt-4" />
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          <span>{minHours} Hours</span><span>{maxHours} Hours</span>
        </div>
      </Card>

      {/* Duration slider */}
      <Card className="mt-3 p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Assignment duration</p>
          <p className="text-3xl font-semibold tracking-tight">{duration} <span className="text-base text-muted-foreground">days</span></p>
        </div>
        <Slider value={[duration]} min={7} max={30} step={1} onValueChange={(v) => setDuration(v[0])} className="mt-4" />
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>7</span><span>30</span></div>
      </Card>

      {/* Today's plan */}
      <Card className="mt-4 border-0 bg-foreground p-5 text-background">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-background/60">Today's plan</p>
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-background/60" />}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Stat icon={<Clock className="h-3 w-3" />} label="Working hours" value={`${hours} Hours`} />
          <Stat icon={<CheckCircle2 className="h-3 w-3" />} label="Cars" value={String(cars)} />
          <Stat icon={<Sun className="h-3 w-3" />} label="Start" value={formatTime12(startTime)} />
          <Stat icon={<Clock className="h-3 w-3" />} label="Finish" value={formatTime12(finishTime)} />
        </div>
        <div className="mt-4 space-y-1.5 border-t border-background/10 pt-4 text-sm">
          <Row label="Estimated earnings" value={`₹${dailyEarn.toLocaleString("en-IN")}`} />
          {fuelEnabled && (
            <>
              <Row label="Estimated fuel cost" value={`− ₹${dailyFuel.toLocaleString("en-IN")}`} muted />
              <Row label="Estimated net earnings" value={`₹${dailyNet.toLocaleString("en-IN")}`} bold />
              <p className="pt-1 text-[10px] italic text-background/50">
                *Fuel estimate based on {avgMileage} km/L average bike mileage.
              </p>
            </>
          )}
        </div>
      </Card>

      {previewError && (
        <Card className="mt-3 border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{(previewError as Error).message}</span></div>
        </Card>
      )}

      {/* Capacity awareness */}
      {preview && (
        <Card className={`mt-3 p-5 ${fullyAvailable ? "border-success/40 bg-success/5" : noneAvailable ? "border-destructive/40 bg-destructive/5" : "border-warning/40 bg-warning/5"}`}>
          {fullyAvailable ? (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <p><span className="font-semibold">Available today</span> · {cars} cars ready in {partner.home_area}</p>
            </div>
          ) : partialAvailable ? (
            <div>
              <div className="flex items-start gap-2">
                <TrendingUp className="mt-0.5 h-4 w-4 text-warning" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">Your Route is Growing 🚀</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {availableInArea} of your target {cars} Daily Shine customers are available today.
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <MiniStat label="Today" value={`${availableInArea}`} />
                <MiniStat label="Target" value={`${cars}`} />
                <MiniStat label="Today ₹" value={`₹${acceptableEarn.toLocaleString("en-IN")}`} />
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Route growth</span><span>{availableInArea} / {cars} · {growthPct}%</span>
                </div>
                <Progress value={growthPct} className="mt-1.5 h-2" />
              </div>
              <p className="mt-3 rounded-lg bg-background/50 p-3 text-xs text-muted-foreground">
                We'll automatically add more customers as your area grows — keep your schedule active.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <TrendingUp className="mt-0.5 h-4 w-4 text-warning" />
              <div>
                <p className="text-sm font-semibold">Today's Route</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  No Daily Shine customers are available in {partner.home_area} yet. We'll automatically add customers as your area grows.
                </p>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Working days */}
      <Card className="mt-3 p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Working days</p>
          <span className="text-xs text-muted-foreground">{workingDayCount} day{workingDayCount === 1 ? "" : "s"}/week</span>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {DAYS.map((d) => {
            const isOff = d.key === offDayKey;
            const checked = workingDays.has(d.key);
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => toggleDay(d.key)}
                disabled={isOff}
                aria-disabled={isOff}
                className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] font-medium transition ${
                  isOff
                    ? "cursor-not-allowed border-dashed border-muted bg-muted/30 text-muted-foreground/60"
                    : checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50"
                }`}
              >
                <span>{d.label}</span>
                {isOff
                  ? <span className="text-[8px] uppercase tracking-wider leading-tight">Weekly Off</span>
                  : <Checkbox checked={checked} className="pointer-events-none h-3 w-3" />}
              </button>
            );
          })}
        </div>
        <p className="mt-3 rounded-lg bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
          {offDayFull} is Urban Wash's weekly off. Assignments are not scheduled on {offDayFull}s.
        </p>
      </Card>

      {/* Monthly forecast */}
      <Card className="mt-3 p-5">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Monthly forecast</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-muted-foreground">Working days</span><span className="text-right font-medium">{monthlyWorkingDays}</span>
          <span className="text-muted-foreground">Hours per day</span><span className="text-right font-medium">{hours} Hours</span>
          <span className="text-muted-foreground">Cars per day</span><span className="text-right font-medium">{cars}</span>
          <span className="text-muted-foreground">Monthly cars</span><span className="text-right font-medium">{monthlyCars}</span>
          <span className="text-foreground font-semibold">Estimated earnings</span><span className="text-right text-lg font-semibold">₹{monthlyEarn.toLocaleString("en-IN")}</span>
        </div>
      </Card>

      {/* Booking requests */}
      <Card className="mt-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer bookings</p>
            <h2 className="mt-1 text-base font-semibold">Ready to add to your route</h2>
          </div>
          <Inbox className="h-5 w-5 text-primary" />
        </div>
        <div className="mt-3 space-y-2">
          {loadingBookings && <p className="py-3 text-sm text-muted-foreground">Checking new bookings…</p>}
          {!loadingBookings && bookingRequests.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">No customer bookings waiting in {partner.home_area} right now.</p>
          )}
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

      {/* Partial / none flows */}
      {preview && partialAvailable && (
        <Card className="mt-3 border-warning/40 bg-warning/10 p-4">
          <div className="flex items-start gap-2">
            <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Today's Route</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {availableInArea} Daily Shine customer{availableInArea === 1 ? " is" : "s are"} available. We'll automatically add more customers as your area grows.
              </p>
              <div className="mt-3 grid gap-2">
                <Button size="sm" onClick={() => accept.mutate(availableInArea)} disabled={accept.isPending}>
                  {accept.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  <span className="flex flex-col items-center leading-tight">
                    <span>Start with {availableInArea} Customer{availableInArea === 1 ? "" : "s"}</span>
                    <span className="text-[10px] font-normal opacity-90">Earn ₹{acceptableEarn.toLocaleString("en-IN")} Today</span>
                  </span>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/app/area"><MapPin className="mr-2 h-4 w-4" />Change area</Link>
                </Button>
                <Button size="sm" variant="ghost"
                  disabled={toggleNotify.isPending || partner.notify_when_customers_added}
                  onClick={() => toggleNotify.mutate(true)}>
                  <BellRing className="mr-2 h-4 w-4" />
                  {partner.notify_when_customers_added
                    ? "We'll notify you when new customers arrive"
                    : "Notify me when customers become available"}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {preview && noneAvailable && (
        <Card className="mt-3 border-destructive/40 bg-destructive/10 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-semibold">No customers currently available in {partner.home_area}.</p>
              <div className="mt-3 grid gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/app/area"><Crosshair className="mr-2 h-4 w-4" />Use current location</Link>
                </Button>
                <Button size="sm" variant="ghost"
                  disabled={toggleNotify.isPending || partner.notify_when_customers_added}
                  onClick={() => toggleNotify.mutate(true)}>
                  <BellRing className="mr-2 h-4 w-4" />
                  {partner.notify_when_customers_added ? "We'll ping you" : "Notify me"}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {previewMessage && fullyAvailable && (
        <Card className="mt-3 border-warning/40 bg-warning/10 p-4 text-sm text-warning-foreground">{previewMessage}</Card>
      )}

      <Card className="mt-3 flex items-start gap-3 border-dashed p-4 text-xs">
        <IndianRupee className="mt-0.5 h-4 w-4 text-primary" />
        <div>
          <p className="font-semibold">First payout</p>
          <p className="mt-1 text-muted-foreground">First week's earnings are held as a security reserve and released after your first 15 active days.</p>
        </div>
      </Card>

      {/* Sticky CTA */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-md p-4">
          <Button
            size="lg"
            className="w-full"
            disabled={accept.isPending || !fullyAvailable}
            onClick={() => accept.mutate(cars)}
          >
            {accept.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            {isFetching && !preview
              ? "Checking customers…"
              : noneAvailable
                ? "No customers available — see options above"
                : partialAvailable
                  ? `Only ${availableInArea} available — see options above`
                  : `Accept · ${hours}h · ${cars} cars · net ₹${dailyNet.toLocaleString("en-IN")}/day`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-background/60">{icon}<span>{label}</span></div>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-background/${muted ? "50" : "70"} text-sm`}>{label}</span>
      <span className={`tabular-nums ${bold ? "text-lg font-semibold" : "text-sm"}`}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/80 p-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}
