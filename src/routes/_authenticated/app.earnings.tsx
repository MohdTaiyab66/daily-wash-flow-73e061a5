import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CalendarDays, Lock, Car, Clock, MapPin } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";

const RATE = 17;

export const Route = createFileRoute("/_authenticated/app/earnings")({
  component: EarningsPage,
});

function startOfWeek(d: Date) {
  const day = (d.getDay() + 6) % 7;
  const m = new Date(d);
  m.setDate(d.getDate() - day);
  return m.toISOString().slice(0, 10);
}

function EarningsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"today" | "week" | "month" | "lifetime">("week");

  const { data: stats } = useQuery({
    queryKey: ["earnings-v3"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const id = u.user!.id;
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const weekStart = startOfWeek(today);

      const { data: services } = await supabase
        .from("services")
        .select("scheduled_date,rate_per_car,status")
        .eq("partner_id", id)
        .in("status", ["completed", "unavailable"]);

      const { data: analytics } = await supabase
        .from("service_analytics")
        .select("total_seconds,service_id");

      const acc = { today: 0, week: 0, month: 0, lifetime: 0, todayN: 0, weekN: 0, monthN: 0, lifetimeN: 0 };
      const days = new Set<string>();
      const UNAVAILABLE_RATE = 12;
      for (const s of services ?? []) {
        const r = s.status === "unavailable" ? UNAVAILABLE_RATE : Number(s.rate_per_car || RATE);
        acc.lifetime += r; acc.lifetimeN++;
        days.add(s.scheduled_date);
        if (s.scheduled_date >= monthStart) { acc.month += r; acc.monthN++; }
        if (s.scheduled_date >= weekStart) { acc.week += r; acc.weekN++; }
        if (s.scheduled_date === todayStr) { acc.today += r; acc.todayN++; }
      }
      const totalSeconds = (analytics ?? []).reduce((a, b) => a + (b.total_seconds || 0), 0);
      return { ...acc, daysActive: days.size, totalSeconds };
    },
  });

  const { data: partner } = useQuery({
    queryKey: ["me-partner-earn"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("partners").select("joined_on").eq("id", u.user!.id).maybeSingle();
      return data;
    },
  });

  const next = new Date();
  next.setDate(next.getDate() + ((1 + 7 - next.getDay()) % 7 || 7));
  const nextStr = next.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  // First payout only after 15 active days from joining
  const joined = partner?.joined_on ? new Date(partner.joined_on) : new Date();
  const daysSinceJoin = Math.floor((Date.now() - joined.getTime()) / 86400000);
  const firstPayoutReady = daysSinceJoin >= 15;

  const view = (label: string, total: number, n: number) => (
    <Card className="p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-4xl font-semibold tracking-tight">₹{total.toLocaleString("en-IN")}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
        <Mini icon={<Car className="h-3 w-3" />} label={t("cars")} value={String(n)} />
        <Mini icon={<Clock className="h-3 w-3" />} label={t("avg_day")} value={n ? `₹${Math.round(total / Math.max(1, stats?.daysActive ?? 1))}` : "₹0"} />
        <Mini icon={<MapPin className="h-3 w-3" />} label="Per car" value={`₹${RATE}`} />
      </div>
    </Card>
  );

  // Motivational milestone for today.
  const todayEarn = stats?.today ?? 0;
  const MILESTONES = [100, 250, 500, 750, 1000];
  const nextMilestone = MILESTONES.find((m) => m > todayEarn);
  const milestoneGap = nextMilestone ? nextMilestone - todayEarn : 0;

  return (
    <div className="mx-auto max-w-md px-5 pt-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t("earnings")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("earnings_sub")}</p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mt-5">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="today">{t("today")}</TabsTrigger>
          <TabsTrigger value="week">{t("week")}</TabsTrigger>
          <TabsTrigger value="month">{t("month")}</TabsTrigger>
          <TabsTrigger value="lifetime">{t("all")}</TabsTrigger>
        </TabsList>
        {nextMilestone && tab === "today" && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/8 px-3.5 py-2.5 text-[13px]">
            <span>🔥</span>
            <p className="flex-1 leading-tight">
              <span className="font-semibold">Earn ₹{milestoneGap} more today</span>
              <span className="text-muted-foreground"> to cross ₹{nextMilestone}</span>
            </p>
          </div>
        )}
        <TabsContent value="today" className="mt-4">{view(t("today"), stats?.today ?? 0, stats?.todayN ?? 0)}</TabsContent>
        <TabsContent value="week" className="mt-4">{view(t("this_week"), stats?.week ?? 0, stats?.weekN ?? 0)}</TabsContent>
        <TabsContent value="month" className="mt-4">{view(t("this_month"), stats?.month ?? 0, stats?.monthN ?? 0)}</TabsContent>
        <TabsContent value="lifetime" className="mt-4">{view(t("lifetime"), stats?.lifetime ?? 0, stats?.lifetimeN ?? 0)}</TabsContent>
      </Tabs>


      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("next_payout")}</h2>
      <Card className="mt-3 p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{t("settling_on")}</p>
            <p className="mt-1 text-lg font-semibold">{nextStr}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{t("amount")}</p>
            <p className="mt-1 text-lg font-semibold">₹{stats?.week ?? 0}</p>
          </div>
        </div>
        {!firstPayoutReady && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted p-3 text-xs">
            <Lock className="mt-0.5 h-3.5 w-3.5 text-primary" />
            <p className="text-muted-foreground">
              First payout releases after your first 15 active days ({15 - daysSinceJoin} days to go).
              Urban Wash holds your first week as a security reserve.
            </p>
          </div>
        )}
      </Card>

      <Card className="mt-4 p-4 text-xs text-muted-foreground">
        <CalendarDays className="mr-1 inline h-3.5 w-3.5" />Payouts run every Monday. Bonuses settle with the same cycle.
      </Card>
    </div>
  );
}

function Mini({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-muted-foreground">{icon}<span>{label}</span></div>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
