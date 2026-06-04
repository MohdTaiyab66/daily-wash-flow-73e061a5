import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/app/earnings")({
  component: EarningsPage,
});

function EarningsPage() {
  const { data: stats } = useQuery({
    queryKey: ["earnings-stats"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const id = u.user!.id;
      const today = new Date();
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const { data: services } = await supabase
        .from("services")
        .select("rate_per_car,status,completed_at,scheduled_date")
        .eq("partner_id", id)
        .eq("status", "completed");

      let todayE = 0, monthE = 0, lifetime = 0, todayN = 0, monthN = 0;
      const todayStr = today.toISOString().slice(0, 10);
      for (const s of services ?? []) {
        const r = Number(s.rate_per_car || 0);
        lifetime += r;
        if (s.scheduled_date >= monthStart) { monthE += r; monthN++; }
        if (s.scheduled_date === todayStr) { todayE += r; todayN++; }
      }
      return { todayE, monthE, lifetime, todayN, monthN };
    },
  });

  return (
    <div className="mx-auto max-w-md px-5 pt-6">
      <h1 className="text-2xl font-semibold tracking-tight">Earnings</h1>
      <p className="mt-1 text-sm text-muted-foreground">All payouts settle weekly on Mondays.</p>

      <Card className="mt-5 border-0 bg-foreground p-5 text-background">
        <p className="text-xs text-background/60">This month</p>
        <p className="mt-1 text-4xl font-semibold tracking-tight">₹{stats?.monthE ?? 0}</p>
        <p className="mt-1 text-xs text-background/60">{stats?.monthN ?? 0} cars completed</p>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Today</p>
          <p className="mt-1 text-2xl font-semibold">₹{stats?.todayE ?? 0}</p>
          <p className="text-[11px] text-muted-foreground">{stats?.todayN ?? 0} cars</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Lifetime</p>
          <p className="mt-1 text-2xl font-semibold">₹{stats?.lifetime ?? 0}</p>
          <p className="text-[11px] text-muted-foreground">all-time</p>
        </Card>
      </div>

      <h2 className="mt-7 text-sm font-semibold uppercase tracking-wider text-muted-foreground">How it works</h2>
      <Card className="mt-2 p-4 text-sm text-muted-foreground">
        Every completed car earns you ₹80. Weekly payouts hit your bank every Monday. Bonuses unlock for streaks, customer referrals and 5-star ratings.
      </Card>
    </div>
  );
}
