import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Loader2, MapPin, Timer, IndianRupee, CheckCircle2, Calendar, Sun, BellRing, Crosshair, AlertTriangle, Inbox, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { OfflineGuard } from "@/components/OfflineGuard";
import { useI18n } from "@/lib/i18n";
import { formatTime12 } from "@/lib/format";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

export const Route = createFileRoute("/_authenticated/app/assignments")({
  component: () => <OfflineGuard label="assignment builder"><AssignmentsPage /></OfflineGuard>,
});

function AssignmentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useI18n();

  const [cars, setCars] = useState(20);
  const [duration, setDuration] = useState(15);
  useRealtimeInvalidation(["platform_settings", "customers"], [["assignment-settings"], ["preview", cars, duration], ["me-partner-builder"]]);

  const { data: settings } = useQuery({
    queryKey: ["assignment-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("platform_settings").select("key,value").in("key", ["min_cars_required", "max_cars_allowed", "rate_per_car"]);
      const m: Record<string, number> = {};
      (data ?? []).forEach((s: any) => (m[s.key] = Number(s.value)));
      return { minCars: Math.max(1, m.min_cars_required ?? 1), maxCars: m.max_cars_allowed ?? 30, rate: m.rate_per_car ?? 17 };
    },
  });

  const minCars = settings?.minCars ?? 1;
  const maxCars = settings?.maxCars ?? 30;
  const rate = settings?.rate ?? 17;

  useEffect(() => {
    if (cars < minCars) setCars(minCars);
    if (cars > maxCars) setCars(maxCars);
  }, [cars, minCars, maxCars]);

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
      const { data } = await supabase
        .from("assignments")
        .select("id")
        .eq("partner_id", u.user.id)
        .eq("status", "active")
        .gte("end_date", today)
        .maybeSingle();
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

  // Accepted assignments live on the My Assignment page — redirect.
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

  // STEP 1 — Partner must pick an area first
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
  const acceptableCars = preview ? Math.min(cars, availableInArea) : 0;
  const workingDays = preview?.working_days ?? 0;
  const dailyEarn = acceptableCars * rate;
  const totalEarn = dailyEarn * workingDays;
  const radius = preview ? Number(preview.estimated_radius_km) : 0;
  const hours = preview ? Number(preview.estimated_hours) : 0;
  const startTime = preview?.expected_start_time ?? "07:00";

  const fullyAvailable = preview && availableInArea >= cars;
  const partialAvailable = preview && availableInArea > 0 && availableInArea < cars;
  const noneAvailable = preview && availableInArea === 0;

  return (
    <div className="mx-auto max-w-md px-5 pt-5 pb-32">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("build_your_assignment")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("builder_sub")}</p>
        </div>
        <Link to="/app/area" className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
          <MapPin className="h-3 w-3" />{partner.home_area}
        </Link>
      </div>

      {/* Cars slider */}
      <Card className="mt-5 p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("cars_per_day")}</p>
          <p className="text-3xl font-semibold tracking-tight">{cars}</p>
        </div>
        <Slider value={[cars]} min={minCars} max={maxCars} step={1} onValueChange={(v) => setCars(v[0])} className="mt-4" />
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>{minCars}</span><span>{maxCars}</span></div>
      </Card>

      {/* Duration slider */}
      <Card className="mt-3 p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("duration")}</p>
          <p className="text-3xl font-semibold tracking-tight">{duration} <span className="text-base text-muted-foreground">{t("days")}</span></p>
        </div>
        <Slider value={[duration]} min={7} max={30} step={1} onValueChange={(v) => setDuration(v[0])} className="mt-4" />
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>7</span><span>30</span></div>
      </Card>

      {previewError && (
        <Card className="mt-3 border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{(previewError as Error).message}</span></div>
        </Card>
      )}

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

      {/* Live calculation */}
      <Card className="mt-4 border-0 bg-foreground p-5 text-background">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-background/60">{t("total_earnings")}</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight">₹{totalEarn.toLocaleString("en-IN")}</p>
            <p className="mt-0.5 text-xs text-background/60">₹{dailyEarn}/{t("daily").toLowerCase()} · {workingDays} {t("days")}{partialAvailable ? ` · capped at ${availableInArea} cars` : ""}</p>
          </div>
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-background/60" />}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-background/10 pt-4 text-xs">
          <Mini icon={<Timer className="h-3 w-3" />} label={t("time")} value={`${hours}h`} />
          <Mini icon={<MapPin className="h-3 w-3" />} label={t("radius")} value={`${radius} km`} />
          <Mini icon={<Sun className="h-3 w-3" />} label={t("starts")} value={formatTime12(startTime)} />
        </div>
      </Card>

      {/* No / partial customers flow */}
      {preview && !fullyAvailable && (
        <Card className={`mt-3 p-4 ${noneAvailable ? "border-destructive/40 bg-destructive/10" : "border-warning/40 bg-warning/10"}`}>
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="flex-1">
              <p className="text-sm font-semibold">
                {noneAvailable
                  ? `No customers currently available in ${partner.home_area}.`
                  : `Only ${availableInArea} customer${availableInArea === 1 ? "" : "s"} currently available in ${partner.home_area}.`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {noneAvailable
                  ? "Pick another area or wait — we can ping you the moment a customer is added."
                  : `You can accept these ${availableInArea} cars now, change area, or wait for more customers.`}
              </p>
              <div className="mt-3 grid gap-2">
                {partialAvailable && (
                  <Button size="sm" onClick={() => accept.mutate(availableInArea)} disabled={accept.isPending}>
                    {accept.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Accept {availableInArea} car{availableInArea === 1 ? "" : "s"} · ₹{(availableInArea * rate * workingDays).toLocaleString("en-IN")}
                  </Button>
                )}
                <Button asChild size="sm" variant="outline">
                  <Link to="/app/area"><MapPin className="mr-2 h-4 w-4" />Change area</Link>
                </Button>
                {noneAvailable && (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/app/area"><Crosshair className="mr-2 h-4 w-4" />Use current location</Link>
                  </Button>
                )}
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

      {previewMessage && fullyAvailable && (
        <Card className="mt-3 border-warning/40 bg-warning/10 p-4 text-sm text-warning-foreground">{previewMessage}</Card>
      )}

      {/* Rules */}
      <Card className="mt-4 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("assignment_rules")}</p>
        <ul className="mt-3 space-y-2 text-xs">
          <Rule>Same customers for the full {duration} days · consistent quality</Rule>
          <Rule>Mondays are off — auto-excluded from working days</Rule>
          <Rule>Flat rate ₹{rate} per completed car · no tiered pricing</Rule>
          <Rule>Cancelling mid-assignment: ₹250 + that day's earnings deducted</Rule>
        </ul>
      </Card>

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
                  : `${t("accept")} · ${cars} × ${duration} ${t("days")} · ₹${totalEarn.toLocaleString("en-IN")}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Mini({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-background/60">{icon}<span>{label}</span></div>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Calendar className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
      <span className="text-muted-foreground">{children}</span>
    </li>
  );
}
