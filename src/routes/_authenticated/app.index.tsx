import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Car, CheckCircle2, Clock, MapPin, Star, Timer, Award, Briefcase, Navigation } from "lucide-react";
import { toast } from "sonner";
import { usePartner, useToggleOnline } from "@/hooks/use-partner";
import { useI18n } from "@/lib/i18n";
import { formatTime12 } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/")({
  component: HomePage,
});

const RATE = 17;

function HomePage() {
  const { data: partner } = usePartner();
  const toggle = useToggleOnline();
  const online = partner?.availability === "online";
  const { t } = useI18n();

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
      const { data } = await supabase
        .from("services")
        .select("id,status,started_at,completed_at,rate_per_car")
        .eq("scheduled_date", d);
      return data ?? [];
    },
  });

  const completed = (today ?? []).filter((s) => s.status === "completed").length;
  const total = today?.length ?? 0;
  const remaining = total - completed;
  const earnings = completed * RATE;

  const started = (today ?? []).map((s) => s.started_at).filter(Boolean).sort();
  const ended = (today ?? []).map((s) => s.completed_at).filter(Boolean).sort();
  const hours = started.length && ended.length
    ? ((new Date(ended[ended.length - 1]!).getTime() - new Date(started[0]!).getTime()) / 3.6e6).toFixed(1)
    : "0.0";

  const handleToggle = async (on: boolean) => {
    await toggle(on);
    toast.success(on ? t("online") : t("offline"));
  };

  // Day X of Y based on assignment start_date
  let dayLabel = "";
  if (assignment) {
    const start = new Date(assignment.start_date);
    const dayNum = Math.floor((Date.now() - start.getTime()) / 86400000) + 1;
    dayLabel = t("day_of")(Math.max(1, Math.min(dayNum, assignment.duration_days)), assignment.duration_days);
  }

  const remDistance = assignment ? (assignment.estimated_distance_km * (total ? remaining / total : 0)).toFixed(1) : "0";
  const remTime = assignment ? (assignment.estimated_hours * (total ? remaining / total : 0)).toFixed(1) : "0";

  return (
    <div className="mx-auto max-w-md px-5 pt-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{t("good_morning")}</p>
          <h1 className="text-xl font-semibold tracking-tight">{partner?.full_name ?? t("partner")}</h1>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{partner?.partner_code}</span>
            <Badge className="border-0 bg-accent text-accent-foreground capitalize">
              <Award className="mr-1 h-3 w-3" /> {partner?.level ?? "Bronze"}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2">
          <span className={`h-2 w-2 rounded-full ${online ? "bg-[color:var(--success)]" : "bg-muted-foreground"}`} />
          <span className="text-xs font-medium">{online ? t("online") : t("offline")}</span>
          <Switch checked={online} onCheckedChange={handleToggle} />
        </div>
      </header>

      {/* Assignment summary card */}
      {assignment ? (
        <Card className="mt-5 border-0 bg-foreground p-5 text-background">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-background/60">{t("current_assignment")}</p>
              <p className="mt-1 text-lg font-semibold">{assignment.area}</p>
              <p className="mt-0.5 text-xs text-background/60">{dayLabel} · {t("starts")} {formatTime12(assignment.expected_start_time)} · ETA {formatTime12("10:00")}</p>
            </div>
            <Badge className="border-0 bg-primary text-primary-foreground">{t("active")}</Badge>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-background/10 pt-4 text-xs">
            <div><p className="text-background/60">{t("assigned")}</p><p className="mt-0.5 text-base font-semibold">{total}</p></div>
            <div><p className="text-background/60">{t("done")}</p><p className="mt-0.5 text-base font-semibold">{completed}</p></div>
            <div><p className="text-background/60">{t("left")}</p><p className="mt-0.5 text-base font-semibold">{remaining}</p></div>
            <div><p className="text-background/60">{t("distance")}</p><p className="mt-0.5 text-base font-semibold">{remDistance} km</p></div>
            <div><p className="text-background/60">{t("eta")}</p><p className="mt-0.5 text-base font-semibold">{remTime}h</p></div>
            <div><p className="text-background/60">{t("earned")}</p><p className="mt-0.5 text-base font-semibold">₹{earnings}</p></div>
          </div>
          <div className="mt-4 h-1.5 rounded-full bg-background/15">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${total ? (completed / total) * 100 : 0}%` }} />
          </div>
          <Button asChild variant="secondary" className="mt-4 w-full">
            <Link to="/app/live"><Navigation className="mr-2 h-4 w-4" />{t("view_todays_route")}</Link>
          </Button>
        </Card>
      ) : (
        <Card className="mt-5 flex flex-col items-center gap-3 p-8 text-center">
          <Briefcase className="h-6 w-6 text-muted-foreground" />
          <div>
            <p className="font-medium">{t("no_active_assignment")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("build_hint")}</p>
          </div>
          <Button asChild><Link to="/app/assignments">{t("build_assignment")}</Link></Button>
        </Card>
      )}

      {/* Stats row */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat icon={<Car className="h-4 w-4" />} label={t("today")} value={`₹${earnings}`} />
        <Stat icon={<Star className="h-4 w-4" />} label={t("rating")} value={Number(partner?.rating ?? 5).toFixed(2)} />
        <Stat icon={<CheckCircle2 className="h-4 w-4" />} label={t("lifetime")} value={String(partner?.total_cars_completed ?? 0)} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat icon={<Timer className="h-4 w-4" />} label={t("hours")} value={`${hours}h`} />
        <Stat icon={<MapPin className="h-4 w-4" />} label={t("distance")} value={`${assignment?.estimated_distance_km ?? 0} km`} />
        <Stat icon={<Award className="h-4 w-4" />} label={t("level")} value={partner?.level ?? "Bronze"} />
      </div>

      <div className="mt-6">
        <Button asChild className="w-full"><Link to="/app/live"><Navigation className="mr-2 h-4 w-4" />{t("todays_route")}</Link></Button>
      </div>

      <div className="h-4" />
      <p className="mb-2 text-center text-[10px] text-muted-foreground"><Clock className="mr-1 inline h-3 w-3" />{t("locations_online_note")}</p>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-1.5 text-xl font-semibold tracking-tight">{value}</p>
    </Card>
  );
}
