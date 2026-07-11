import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Car,
  CheckCircle2,
  Clock,
  Flag,
  MapPin,
  Star,
  Navigation,
  PartyPopper,
  IndianRupee,
  MessageCircle,
  Phone,
  BookOpen,
  ArrowRight,
  Sparkles,
  Route as RouteIcon,
  Wallet,
} from "lucide-react";

/**
 * Rough per-partner finish estimate: start time + service time per remaining
 * customer + short travel buffer between stops. Kept intentionally simple —
 * real per-service durations aren't stored yet. Every partner still sees a
 * different value because it's driven by their own start time and stop count.
 */
const AVG_SERVICE_MIN = 12;
const AVG_TRAVEL_MIN = 3;
function estimateFinishTime(startHHMM?: string | null, stops = 0): string {
  if (!startHHMM || stops <= 0) return "";
  const m = /^(\d{1,2}):(\d{2})/.exec(startHHMM);
  if (!m) return "";
  const start = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const total = start + stops * AVG_SERVICE_MIN + Math.max(0, stops - 1) * AVG_TRAVEL_MIN;
  const hh = Math.floor((total / 60) % 24);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
import { toast } from "sonner";
import { usePartner, useToggleOnline } from "@/hooks/use-partner";
import { formatTime12 } from "@/lib/format";
import { MarketplaceOffersList } from "@/components/partner/MarketplaceOffersList";

export const Route = createFileRoute("/_authenticated/app/")({
  component: HomePage,
});

function HomePage() {
  const { data: partner } = usePartner();
  const toggle = useToggleOnline();
  const online = partner?.availability === "online";

  const { data: assignment } = useQuery({
    queryKey: ["active-assignment-summary"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("assignments")
        .select("*")
        .eq("partner_id", u.user!.id)
        .eq("status", "active")
        .gte("end_date", new Date().toISOString().slice(0, 10))
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: today } = useQuery({
    queryKey: ["today-services-mini"],
    queryFn: async () => {
      const d = new Date().toISOString().slice(0, 10);
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data } = await supabase
        .from("services")
        .select("id,status,started_at,completed_at,rate_per_car")
        .eq("partner_id", u.user.id)
        .eq("scheduled_date", d);
      return data ?? [];
    },
  });

  const completed = (today ?? []).filter((s) => s.status === "completed").length;
  const done = (today ?? []).filter(
    (s) => s.status === "completed" || s.status === "unavailable",
  ).length;
  const total = today?.length ?? 0;
  const remaining = total - done;
  const expectedEarnings = (today ?? []).reduce(
    (sum, s) => sum + Number(s.rate_per_car || 17),
    0,
  );
  const earnedSoFar = (today ?? [])
    .filter((s) => s.status === "completed" || s.status === "unavailable")
    .reduce(
      (sum, s) =>
        sum + (s.status === "unavailable" ? 12 : Number(s.rate_per_car || 0)),
      0,
    );

  const started = (today ?? []).map((s) => s.started_at).filter(Boolean).sort();
  const ended = (today ?? []).map((s) => s.completed_at).filter(Boolean).sort();
  const hours =
    started.length && ended.length
      ? (
          (new Date(ended[ended.length - 1]!).getTime() -
            new Date(started[0]!).getTime()) /
          3.6e6
        ).toFixed(1)
      : "0.0";

  const handleToggle = async (on: boolean) => {
    await toggle(on);
    toast.success(on ? "You're Online" : "You're Offline");
  };

  const firstName = (partner?.full_name ?? "Partner").split(" ")[0];
  const progressPct = total ? (done / total) * 100 : 0;
  const allDone = total > 0 && remaining === 0;

  const finishHHMM = estimateFinishTime(assignment?.expected_start_time, total);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mx-auto max-w-md px-5 pb-6 pt-3">
      {/* Greeting */}
      <header>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{greeting} 👋</p>
          <p className="text-[11px] text-muted-foreground">{dateStr}</p>
        </div>
        <h1 className="mt-0.5 text-3xl font-bold uppercase tracking-tight leading-tight">
          {firstName}
        </h1>
        {!assignment && total === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Ready to build your first route?</p>
        ) : null}
      </header>

      {/* Online status card — compact */}
      <Card className="mt-3 flex items-center justify-between gap-3 px-4 py-2">
        <div className="flex items-center gap-2.5">
          <span
            className={`grid h-7 w-7 place-items-center rounded-full ${
              online ? "bg-[color:var(--success)]/15" : "bg-muted"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                online ? "bg-[color:var(--success)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--success)_25%,transparent)]" : "bg-muted-foreground"
              } ${online ? "animate-pulse" : ""}`}
            />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">
              {online ? "Online" : "Offline"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {online ? "Available for assignments" : "You're not receiving assignments"}
            </p>
          </div>
        </div>
        <Switch checked={online} onCheckedChange={handleToggle} />
      </Card>

      <div className="mt-5">
        <MarketplaceOffersList />
      </div>

      {/* Hero: Today's Route */}
      {assignment ? (
        allDone ? (
          <Card className="mt-6 flex flex-col items-center gap-3 border-0 bg-foreground p-8 text-center text-background">
            <PartyPopper className="h-8 w-8 text-primary" />
            <p className="text-xl font-semibold">Great Job!</p>
            <p className="text-sm text-background/70">
              You've completed today's route. We'll notify you when new work
              becomes available.
            </p>
          </Card>
        ) : (
          <Card className="mt-5 overflow-hidden border-0 bg-foreground px-6 py-5 text-background">
            <p className="text-[11px] font-medium uppercase tracking-widest text-background/60">
              Today's Route
            </p>

            <div className="mt-1.5 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-semibold tracking-tight">{assignment.area}</h2>
            </div>

            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-background/60">
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--success)]" />
              Active Assignment
            </div>

            {/* Big trio */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              <HeroStat
                icon={<Car className="h-4 w-4" />}
                label="Today's Customers"
                value={total}
              />
              <HeroStat
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="Completed"
                value={done}
              />
              <HeroStat
                icon={<MapPin className="h-4 w-4" />}
                label="Remaining"
                value={remaining}
              />
            </div>

            {/* Progress */}
            <div className="mt-4">
              <p className="text-sm font-medium text-background/80">
                <span className="text-base font-semibold text-background">{done} / {total}</span>{" "}
                Customers Completed
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background/15">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Earnings + start-before */}
            <div className="mt-4 border-t border-background/10 pt-3">
              <p className="text-[11px] uppercase tracking-wider text-background/60">
                Today's Earnings
              </p>
              <p className="mt-0.5 flex items-center text-2xl font-bold text-primary">
                <IndianRupee className="h-5 w-5" />
                {expectedEarnings}
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-background/80">
                <Clock className="h-4 w-4 text-background/60" />
                Start Before {formatTime12(assignment.expected_start_time)}
              </p>
              {finishHHMM ? (
                <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-background/80">
                  <Flag className="h-4 w-4 text-background/60" />
                  Estimated Finish {formatTime12(finishHHMM)}
                </p>
              ) : null}
            </div>

            {/* Primary action */}
            <Button
              asChild
              size="lg"
              className="mt-4 h-16 w-full rounded-2xl bg-primary text-lg font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
            >
              <Link to="/app/live">
                <Navigation className="mr-2 h-5 w-5" />
                Start Today's Route
              </Link>
            </Button>

            {/* Support shortcut */}
            <div className="mt-3 text-center text-xs text-background/60">
              Need Help?{" "}
              <Link to="/app/profile" className="font-medium text-background underline-offset-4 hover:underline">
                Partner Support
              </Link>
            </div>
          </Card>
        )
      ) : total > 0 ? (
        <Card className="mt-6 border-0 bg-foreground p-6 text-background">
          <p className="text-[11px] font-medium uppercase tracking-widest text-background/60">
            Today's Route
          </p>
          <h2 className="mt-2 text-2xl font-semibold">
            {total} customer{total === 1 ? "" : "s"} today
          </h2>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <HeroStat
              icon={<Car className="h-4 w-4" />}
              label="Today's Customers"
              value={total}
            />
            <HeroStat
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Completed"
              value={done}
            />
            <HeroStat
              icon={<MapPin className="h-4 w-4" />}
              label="Remaining"
              value={remaining}
            />
          </div>

          <Button
            asChild
            size="lg"
            className="mt-6 h-16 w-full rounded-2xl bg-primary text-lg font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
          >
            <Link to="/app/live">
              <Navigation className="mr-2 h-5 w-5" />
              Start Today's Route
            </Link>
          </Button>

          <div className="mt-4 text-center text-xs text-background/60">
            Need Help?{" "}
            <Link to="/app/profile" className="font-medium text-background underline-offset-4 hover:underline">
              Partner Support
            </Link>
          </div>
        </Card>
      ) : (
        <>
          {/* Hero onboarding card */}
          <Card className="mt-5 overflow-hidden border-0 bg-foreground px-6 py-5 text-background">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
              <RouteIcon className="h-7 w-7" />
            </div>
            <p className="mt-3 text-center text-xl font-bold">No Assignment Yet</p>
            <p className="mt-1 text-center text-sm text-background/70">
              Let's create your first route. We'll calculate customers, earnings and route based on your availability.
            </p>

            <Button
              asChild
              size="lg"
              className="mt-4 h-12 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
            >
              <Link to="/app/assignments">
                <Car className="mr-2 h-5 w-5" />
                Create Today's Route
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>

            {/* Today's Potential */}
            <div className="mt-4 rounded-2xl bg-background/5 p-4">
              <p className="text-[10px] font-medium uppercase tracking-widest text-background/60">
                Today's Potential
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="flex items-center justify-center text-lg font-bold text-primary">
                    <IndianRupee className="h-4 w-4" />
                    350–600
                  </p>
                  <p className="mt-0.5 text-[10px] text-background/60">Earnings</p>
                </div>
                <div>
                  <p className="text-lg font-bold">20–35</p>
                  <p className="mt-0.5 text-[10px] text-background/60">Customers</p>
                </div>
                <div>
                  <p className="text-lg font-bold">3–5h</p>
                  <p className="mt-0.5 text-[10px] text-background/60">Hours</p>
                </div>
              </div>
              <p className="mt-2 text-center text-[10px] text-background/50">
                ≈ ₹17 per vehicle · varies by area
              </p>
            </div>
          </Card>

          {/* Benefits chips */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["Flexible Hours", "Weekly Payout", "Daily Income", "No Fixed Schedule"].map((b) => (
              <span key={b} className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                ✓ {b}
              </span>
            ))}
          </div>

          {/* Journey timeline */}
          <Card className="mt-4 p-4">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Your Journey Today
            </p>
            <ol className="mt-3 space-y-2.5">
              {[
                { n: 1, label: "Create Assignment", icon: RouteIcon },
                { n: 2, label: "Receive Customers", icon: Car },
                { n: 3, label: "Complete Services", icon: CheckCircle2 },
                { n: 4, label: "Get Paid", icon: Wallet },
              ].map((s) => {
                const Icon = s.icon;
                return (
                  <li key={s.n} className="flex items-center gap-3">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {s.n}
                    </span>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">{s.label}</p>
                  </li>
                );
              })}
            </ol>
          </Card>

          {/* Help card */}
          <Card className="mt-4 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Need help?</p>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <a
                href="tel:+919999999999"
                className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-2.5 text-center transition hover:border-primary"
              >
                <Phone className="h-4 w-4 text-primary" />
                <span className="text-[11px] font-medium">Support</span>
              </a>
              <a
                href="https://wa.me/919999999999"
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-2.5 text-center transition hover:border-primary"
              >
                <MessageCircle className="h-4 w-4 text-primary" />
                <span className="text-[11px] font-medium">WhatsApp</span>
              </a>
              <Link
                to="/app/training"
                className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-2.5 text-center transition hover:border-primary"
              >
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="text-[11px] font-medium">Training</span>
              </Link>
            </div>
          </Card>
        </>
      )}

      {/* Today's Stats — the 3 that matter each morning */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <MiniStat
          icon={<IndianRupee className="h-4 w-4 text-primary" />}
          label="Today's Earnings"
          value={`₹${earnedSoFar}`}
          accent
        />
        <MiniStat
          icon={<Star className="h-4 w-4" />}
          label="Rating"
          value={Number(partner?.rating ?? 5).toFixed(2)}
        />
        <MiniStat
          icon={<Car className="h-4 w-4" />}
          label="Today's Cars"
          value={String(completed)}
        />

      </div>
    </div>
  );
}

function HeroStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl bg-background/5 px-3 py-2.5">
      <div className="flex items-center gap-1 text-background/60">
        {icon}
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-[9px] uppercase tracking-wider text-background/60">
        {label}
      </p>
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
      </div>
      <p
        className={`mt-1.5 text-xl font-semibold tracking-tight ${
          accent ? "text-primary" : ""
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </Card>
  );
}
