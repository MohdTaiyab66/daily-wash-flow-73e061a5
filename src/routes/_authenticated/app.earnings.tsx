import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CalendarDays, Lock, Car, Clock, MapPin } from "lucide-react";
import { useState } from "react";

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
        .eq("status", "completed");

      const { data: analytics } = await supabase
        .from("service_analytics")
        .select("total_seconds,service_id");

      const acc = { today: 0, week: 0, month: 0, lifetime: 0, todayN: 0, weekN: 0, monthN: 0, lifetimeN: 0 };
      const days = new Set<string>();
      for (const s of services ?? []) {
        const r = Number(s.rate_per_car || RATE);
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
        <Mini icon={<Car className="h-3 w-3" />} label="Cars" value={String(n)} />
        <Mini icon={<Clock className="h-3 w-3" />} label="Avg/day" value={n ? `₹${Math.round(total / Math.max(1, stats?.daysActive ?? 1))}` : "₹0"} />
        <Mini icon={<MapPin className="h-3 w-3" />} label="Rate" value={`₹${RATE}`} />
      </div>
    </Card>
  );

  return (
    <div className="mx-auto max-w-md px-5 pt-5">
      <h1 className="text-2xl font-semibold tracking-tight">Earnings</h1>
      <p className="mt-1 text-sm text-muted-foreground">₹{RATE} per completed car · paid every Monday.</p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mt-5">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="lifetime">All</TabsTrigger>
        </TabsList>
        <TabsContent value="today" className="mt-4">{view("Today", stats?.today ?? 0, stats?.todayN ?? 0)}</TabsContent>
        <TabsContent value="week" className="mt-4">{view("This week", stats?.week ?? 0, stats?.weekN ?? 0)}</TabsContent>
        <TabsContent value="month" className="mt-4">{view("This month", stats?.month ?? 0, stats?.monthN ?? 0)}</TabsContent>
        <TabsContent value="lifetime" className="mt-4">{view("Lifetime", stats?.lifetime ?? 0, stats?.lifetimeN ?? 0)}</TabsContent>
      </Tabs>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Next payout</h2>
      <Card className="mt-3 p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Settling on</p>
            <p className="mt-1 text-lg font-semibold">{nextStr}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Amount</p>
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
