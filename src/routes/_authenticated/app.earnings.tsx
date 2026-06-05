import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { CalendarDays, TrendingUp, Users, Award } from "lucide-react";

const RATE = 17;

export const Route = createFileRoute("/_authenticated/app/earnings")({
  component: EarningsPage,
});

function startOfWeek(d: Date) {
  const day = (d.getDay() + 6) % 7; // Monday-based
  const m = new Date(d);
  m.setDate(d.getDate() - day);
  return m.toISOString().slice(0, 10);
}

function EarningsPage() {
  const { data: stats } = useQuery({
    queryKey: ["earnings-stats-v2"],
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

      let todayE = 0, weekE = 0, monthE = 0, lifetime = 0;
      let todayN = 0, weekN = 0, monthN = 0, lifetimeN = 0;
      for (const s of services ?? []) {
        const r = Number(s.rate_per_car || RATE);
        lifetime += r; lifetimeN++;
        if (s.scheduled_date >= monthStart) { monthE += r; monthN++; }
        if (s.scheduled_date >= weekStart) { weekE += r; weekN++; }
        if (s.scheduled_date === todayStr) { todayE += r; todayN++; }
      }
      return { todayE, weekE, monthE, lifetime, todayN, weekN, monthN, lifetimeN };
    },
  });

  // Mock bonuses
  const referralEarnings = 500;
  const acquisitionEarnings = 250;
  const attendanceBonus = 200;

  // Next payout = upcoming Monday
  const next = new Date();
  next.setDate(next.getDate() + ((1 + 7 - next.getDay()) % 7 || 7));
  const nextStr = next.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="mx-auto max-w-md px-5 pt-5">
      <h1 className="text-2xl font-semibold tracking-tight">Earnings</h1>
      <p className="mt-1 text-sm text-muted-foreground">₹{RATE} per completed car · paid every Monday.</p>

      <Card className="mt-5 border-0 bg-foreground p-5 text-background">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-background/60">This week</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight">₹{stats?.weekE ?? 0}</p>
            <p className="mt-1 text-xs text-background/60">{stats?.weekN ?? 0} cars · settles {nextStr}</p>
          </div>
          <div className="rounded-full bg-primary/20 p-3"><CalendarDays className="h-5 w-5" /></div>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Today</p>
          <p className="mt-1 text-2xl font-semibold">₹{stats?.todayE ?? 0}</p>
          <p className="text-[11px] text-muted-foreground">{stats?.todayN ?? 0} cars</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">This month</p>
          <p className="mt-1 text-2xl font-semibold">₹{stats?.monthE ?? 0}</p>
          <p className="text-[11px] text-muted-foreground">{stats?.monthN ?? 0} cars</p>
        </Card>
        <Card className="col-span-2 p-4">
          <p className="text-xs text-muted-foreground">Lifetime</p>
          <p className="mt-1 text-2xl font-semibold">₹{stats?.lifetime ?? 0}</p>
          <p className="text-[11px] text-muted-foreground">{stats?.lifetimeN ?? 0} cars completed</p>
        </Card>
      </div>

      <h2 className="mt-7 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Bonuses & extras</h2>
      <div className="mt-3 space-y-2">
        <BonusRow icon={<Users className="h-4 w-4" />} label="Partner referral earnings" value={referralEarnings} />
        <BonusRow icon={<TrendingUp className="h-4 w-4" />} label="Customer acquisition earnings" value={acquisitionEarnings} />
        <BonusRow icon={<Award className="h-4 w-4" />} label="Attendance bonus" value={attendanceBonus} />
      </div>

      <Card className="mt-5 p-4 text-xs text-muted-foreground">
        Next weekly payout: <span className="font-medium text-foreground">{nextStr}</span>. Bonuses settle with the same payout cycle.
      </Card>
    </div>
  );
}

function BonusRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="flex items-center justify-between p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-accent-foreground">{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <span className="font-semibold">₹{value}</span>
    </Card>
  );
}
