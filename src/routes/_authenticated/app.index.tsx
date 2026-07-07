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
  MapPin,
  Star,
  Navigation,
  Briefcase,
  PartyPopper,
  IndianRupee,
} from "lucide-react";
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

  return (
    <div className="mx-auto max-w-md px-5 pb-6 pt-6">
      {/* Greeting */}
      <header>
        <p className="text-sm text-muted-foreground">Hello,</p>
        <h1 className="text-3xl font-semibold tracking-tight">{firstName} 👋</h1>
      </header>

      {/* Online status card */}
      <Card className="mt-5 flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span
            className={`grid h-10 w-10 place-items-center rounded-full ${
              online ? "bg-[color:var(--success)]/15" : "bg-muted"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                online ? "bg-[color:var(--success)]" : "bg-muted-foreground"
              } ${online ? "animate-pulse" : ""}`}
            />
          </span>
          <div>
            <p className="text-base font-semibold">
              {online ? "You're Online" : "You're Offline"}
            </p>
            <p className="text-xs text-muted-foreground">
              {online
                ? "Receiving new customer opportunities"
                : "Go online to receive work"}
            </p>
          </div>
        </div>
        <Switch
          checked={online}
          onCheckedChange={handleToggle}
          className="scale-110"
        />
      </Card>

      <div className="mt-4">
        <MarketplaceOffersList />
      </div>

      {/* Hero: Today's Route */}
      {assignment ? (
        allDone ? (
          <Card className="mt-5 flex flex-col items-center gap-3 border-0 bg-foreground p-8 text-center text-background">
            <PartyPopper className="h-8 w-8 text-primary" />
            <p className="text-xl font-semibold">Great job, {firstName}!</p>
            <p className="text-sm text-background/70">
              You've completed today's customers. We'll notify you when new work
              is available.
            </p>
          </Card>
        ) : (
          <Card className="mt-5 overflow-hidden border-0 bg-foreground p-6 text-background">
            <p className="text-[11px] font-medium uppercase tracking-widest text-background/60">
              Today's Route
            </p>

            <div className="mt-2 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-semibold">{assignment.area}</h2>
            </div>

            <div className="mt-1 flex items-center gap-1.5 text-xs text-background/70">
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--success)]" />
              Active Assignment
            </div>

            {/* Big trio */}
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

            {/* Progress */}
            <div className="mt-6">
              <div className="flex items-center justify-between text-xs text-background/70">
                <span>Today's Progress</span>
                <span>
                  {done} of {total} Completed
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-background/15">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Earnings + start-before */}
            <div className="mt-6 grid grid-cols-2 gap-3 border-t border-background/10 pt-5">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-background/60">
                  Expected Today
                </p>
                <p className="mt-1 flex items-center text-2xl font-semibold text-primary">
                  <IndianRupee className="h-5 w-5" />
                  {expectedEarnings}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-background/60">
                  Start Before
                </p>
                <p className="mt-1 flex items-center gap-1 text-2xl font-semibold">
                  <Clock className="h-5 w-5 text-background/70" />
                  {formatTime12(assignment.expected_start_time)}
                </p>
              </div>
            </div>

            {/* Primary action */}
            <Button
              asChild
              size="lg"
              className="mt-6 h-14 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Link to="/app/live">
                <Navigation className="mr-2 h-5 w-5" />
                Start Today's Route
              </Link>
            </Button>
          </Card>
        )
      ) : total > 0 ? (
        <Card className="mt-5 border-0 bg-foreground p-6 text-background">
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
            className="mt-6 h-14 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Link to="/app/live">
              <Navigation className="mr-2 h-5 w-5" />
              Start Today's Route
            </Link>
          </Button>
        </Card>
      ) : (
        <Card className="mt-5 flex flex-col items-center gap-3 p-8 text-center">
          <Briefcase className="h-6 w-6 text-muted-foreground" />
          <div>
            <p className="font-medium">No active assignment</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Build your own assignment — choose cars and duration.
            </p>
          </div>
          <Button asChild>
            <Link to="/app/assignments">Build assignment</Link>
          </Button>
        </Card>
      )}

      {/* Today's Stats — the 3 that matter each morning */}
      <div className="mt-5 grid grid-cols-3 gap-3">
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
          icon={<Clock className="h-4 w-4" />}
          label="Hours"
          value={`${hours}h`}
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
    <div className="rounded-2xl bg-background/5 p-3">
      <div className="flex items-center gap-1 text-background/60">
        {icon}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-background/60">
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
