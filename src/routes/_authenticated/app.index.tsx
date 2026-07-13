import { createFileRoute, Link } from "@tanstack/react-router";
import { useTodayAssignment } from "@/hooks/use-today-assignment";
import { TodayAssignmentStatus, TodayAssignmentSkeleton } from "@/components/partner/TodayAssignmentStatus";
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
import { AnimatedNumber } from "@/components/partner/AnimatedNumber";

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

  // Single source of truth: shared today-assignment query. Every partner
  // screen (Home / Live / My Assignment) reads from the same cache so the
  // "customers today" number cannot drift between screens.
  const todayQuery = useTodayAssignment();
  const todayData = todayQuery.data;
  const hasData = todayData !== undefined;

  // Blocking loader on first load — never render "0 customers" while the
  // API is still fetching or retrying.
  if (!hasData && (todayQuery.isLoading || todayQuery.isFetching) && !todayQuery.isError) {
    return <TodayAssignmentSkeleton />;
  }

  const assignment = todayData?.assignment ?? null;
  const today = todayData?.today ?? [];



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
  const restDay = !!assignment && total === 0;
  const nextDate = todayData?.nextDate ?? null;
  const assignmentAll = todayData?.all ?? [];

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

      <TodayAssignmentStatus
        isError={todayQuery.isError}
        isFetching={todayQuery.isFetching}
        isRefetching={todayQuery.isRefetching}
        hasData={hasData}
        onRetry={() => todayQuery.refetch()}
        metrics={todayQuery.metrics}
        lastSuccessAt={todayQuery.data?.fetchedAt ?? todayQuery.lastGood?.fetchedAt ?? null}
      />

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
              } ${online ? "animate-pulse [animation-duration:2.4s]" : ""}`}
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
        restDay ? (() => {
          const todayStr = new Date().toISOString().slice(0, 10);
          const workingDaysRemaining = new Set(
            assignmentAll
              .map((s: any) => s.scheduled_date as string)
              .filter((d) => d && d > todayStr),
          ).size;
          return (
          <Card className="mt-6 border-0 bg-foreground p-6 text-background">
            <p className="text-[11px] font-medium uppercase tracking-widest text-background/60">
              Rest Day
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-semibold tracking-tight">{assignment.area}</h2>
            </div>
            <p className="mt-2 text-sm text-background/75">
              Enjoy your day off. Your assignment remains active.
            </p>

            <div className="mt-4 rounded-2xl bg-background/5 px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-widest text-background/60">
                Current Assignment
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xl font-semibold tracking-tight">
                    {assignment.target_cars}
                  </p>
                  <p className="mt-0.5 text-[11px] text-background/60">customers/day</p>
                </div>
                <div>
                  <p className="text-xl font-semibold tracking-tight">
                    {workingDaysRemaining}
                  </p>
                  <p className="mt-0.5 text-[11px] text-background/60">working days left</p>
                </div>
              </div>
            </div>

            {nextDate ? (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-background/80">
                <Clock className="h-4 w-4 text-background/60" />
                Next service:{" "}
                {new Date(nextDate).toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                })}
                {assignment.expected_start_time ? ` • ${formatTime12(assignment.expected_start_time)}` : ""}
              </p>
            ) : null}
            <Button
              asChild
              variant="secondary"
              size="lg"
              className="mt-4 h-12 w-full rounded-2xl bg-background/10 text-background hover:bg-background/15"
            >
              <Link to="/app/my-assignment">Assignment Details</Link>
            </Button>
          </Card>
          );
        })() : allDone ? (
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

            {/* Compact one-line summary */}
            <div className="mt-4 rounded-2xl bg-background/5 px-4 py-3">
              <p className="text-base font-semibold tracking-tight">
                {total} Customer{total === 1 ? "" : "s"}
              </p>
              <p className="mt-0.5 text-xs text-background/60">
                {done} Completed · {remaining} Remaining
              </p>
            </div>

            {/* Progress */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-widest text-background/60">
                  Today's Progress
                </p>
                <p className="text-xs font-medium text-background/80">
                  {done} of {total} Completed
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-background/15">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Earnings + start-before */}
            <div className="mt-4 border-t border-background/10 pt-3">
              <p className="text-[11px] uppercase tracking-wider text-background/60">
                Earn Today
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

          <div className="mt-4 rounded-2xl bg-background/5 px-4 py-3">
            <p className="text-base font-semibold tracking-tight">
              {total} Customer{total === 1 ? "" : "s"}
            </p>
            <p className="mt-0.5 text-xs text-background/60">
              {done} Completed · {remaining} Remaining
            </p>
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
            <p className="mt-3 text-center text-xl font-bold">Ready for today's route?</p>
            <p className="mt-1 text-center text-sm text-background/70">
              Let's build it together. We'll calculate customers, earnings and route based on your availability.
            </p>

            <Button
              asChild
              size="lg"
              className="mt-4 h-12 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
            >
              <Link to="/app/assignments">
                <Car className="mr-2 h-5 w-5" />
                Create Today's Route
                <ArrowRight className="ml-4 h-4 w-4" />
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
              <p className="mt-2 text-center text-[9px] text-background/50">
                ≈ ₹17 per vehicle · varies by area
              </p>
            </div>
          </Card>

          {/* Benefits chips */}
          <div className="mt-5 grid grid-cols-2 gap-1.5">
            {["Flexible Hours", "Weekly Payout", "Daily Income", "No Fixed Schedule"].map((b) => (
              <span key={b} className="rounded-full border border-border bg-card px-2.5 py-1 text-center text-[11px] font-medium text-muted-foreground">
                ✓ {b}
              </span>
            ))}
          </div>

          {/* Journey timeline */}
          <Card className="mt-5 p-4">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Your Journey Today
            </p>
            <ol className="relative mt-3 space-y-3">
              {/* connecting vertical line */}
              <span
                aria-hidden
                className="absolute left-[11px] top-3 bottom-3 w-px bg-border/60"
              />
              {[
                { n: 1, label: "Create Assignment", icon: RouteIcon },
                { n: 2, label: "Receive Customers", icon: Car },
                { n: 3, label: "Complete Services", icon: CheckCircle2 },
                { n: 4, label: "Get Paid", icon: Wallet },
              ].map((s) => {
                const Icon = s.icon;
                return (
                  <li key={s.n} className="relative flex items-center gap-3">
                    <span className="relative z-10 grid h-[22px] w-[22px] place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary ring-4 ring-card">
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
          <Card className="mt-5 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Need help?</p>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <a
                href="tel:+919999999999"
                className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-2.5 text-center transition hover:border-primary"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10">
                  <Phone className="h-4 w-4 text-primary" />
                </span>
                <span className="text-[11px] font-medium">Support</span>
                <span className="text-[10px] text-muted-foreground">Call our team</span>
              </a>
              <a
                href="https://wa.me/919999999999"
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-2.5 text-center transition hover:border-primary"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[color:var(--success)]/15">
                  <MessageCircle className="h-4 w-4 text-[color:var(--success)]" />
                </span>
                <span className="text-[11px] font-medium">WhatsApp</span>
                <span className="text-[10px] text-muted-foreground">Quick chat</span>
              </a>
              <Link
                to="/app/training"
                className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-2.5 text-center transition hover:border-primary"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-sky-500/15">
                  <BookOpen className="h-4 w-4 text-sky-500" />
                </span>
                <span className="text-[11px] font-medium">Training</span>
                <span className="text-[10px] text-muted-foreground">Learn the app</span>
              </Link>
            </div>
          </Card>

          {/* Community trust card */}
          <Card className="mt-5 flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10">
              <Star className="h-5 w-5 text-primary" fill="currentColor" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Urban Wash Community</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">4.9 ★</span> avg rating · <span className="font-semibold text-foreground">12,483</span> services this week
              </p>
            </div>
          </Card>
        </>
      )}

      {/* Today's Stats — the 3 that matter each morning */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <MiniStat
          icon={<IndianRupee className="h-4 w-4 text-primary" />}
          label="Earn Today"
          value={<><AnimatedNumber value={earnedSoFar} format={(n) => `₹${n}`} /></>}
          accent
        />
        <MiniStat
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Completed"
          value={String(completed)}
        />
        <MiniStat
          icon={<Sparkles className="h-4 w-4" />}
          label="Reliability"
          value={`${Math.round(Number((partner as any)?.reliability_score ?? 100))}%`}
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
  value: React.ReactNode;
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
