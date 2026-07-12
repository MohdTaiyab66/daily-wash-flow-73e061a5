import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Share2, Gift, Trophy, Users, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/rewards")({
  component: RewardsPage,
});

function RewardsPage() {
  const { data: partner } = useQuery({
    queryKey: ["me-partner-rewards"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("partners")
        .select("referral_code,full_name,total_cars_completed")
        .eq("id", u.user!.id)
        .maybeSingle();
      return data;
    },
  });

  const code = partner?.referral_code ?? "UW-PARTNER";
  const monthGoal = 600;
  const monthDone = Math.min(partner?.total_cars_completed ?? 0, monthGoal);
  const monthPct = Math.round((monthDone / monthGoal) * 100);

  // Bonus progress: what the partner has already earned vs total available across all bonuses.
  const streakEarned = 0; // wired to real ledger later
  const ratingEarned = 0;
  const challengeEarned = monthPct >= 100 ? 2000 : 0;
  const bonusEarned = streakEarned + ratingEarned + challengeEarned;
  const bonusPool = 2000 + 150 * 4 + 50 * 20; // monthly challenge + 4 weekly streaks + estimated 5-star pool
  const bonusRemaining = Math.max(0, bonusPool - bonusEarned);
  const bonusPct = Math.round((bonusEarned / bonusPool) * 100);


  const copy = () => {
    navigator.clipboard?.writeText(code);
    toast.success("Code copied");
  };

  return (
    <div className="mx-auto max-w-md px-5 pt-5">
      <h1 className="text-2xl font-semibold tracking-tight">Rewards</h1>
      <p className="mt-1 text-sm text-muted-foreground">Earn extra for referrals, streaks and monthly challenges.</p>

      <Card className="mt-5 overflow-hidden border-0 bg-foreground p-5 text-background">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-background/60">Refer a partner · earn</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">₹500</p>
            <p className="mt-1 text-[11px] text-background/60">
              Paid after they complete 30 days of Daily Shine.
            </p>
          </div>
          <div className="rounded-full bg-primary p-3"><Share2 className="h-5 w-5 text-primary-foreground" /></div>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-background/10 p-3">
          <code className="flex-1 font-mono text-sm tracking-widest">{code}</code>
          <Button size="sm" variant="secondary" onClick={copy}><Copy className="mr-1.5 h-3.5 w-3.5" />Copy</Button>
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-primary" />
          <div>
            <p className="font-semibold">Customer referral</p>
            <p className="text-xs text-muted-foreground">Earn ₹100 for every customer who subscribes via your code.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="mt-3 w-full">Share with customers</Button>
      </Card>

      <h2 className="mt-7 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Your Bonus Progress</h2>
      <Card className="mt-3 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-3xl font-semibold tracking-tight tabular-nums text-primary">₹{bonusEarned.toLocaleString("en-IN")}</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">Earned</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums">₹{bonusRemaining.toLocaleString("en-IN")}</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">Remaining</p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${bonusPct}%` }} />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Across referrals, monthly challenge, weekly streaks and 5-star bonuses.
        </p>
      </Card>

      <h2 className="mt-7 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Monthly Challenge</h2>

      <Card className="mt-3 p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold">600 cars this month</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Unlock a ₹2,000 bonus</p>
          </div>
          <Badge className="border-0 bg-accent text-accent-foreground"><Trophy className="mr-1 h-3 w-3" />Active</Badge>
        </div>
        <div className="mt-3">
          <div className="h-2 rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${monthPct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{monthDone} / {monthGoal} cars · {monthPct}%</p>
        </div>
      </Card>

      <h2 className="mt-7 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Other rewards</h2>
      <div className="mt-3 space-y-2">
        <Row icon={<Gift className="h-4 w-4" />} title="7-day streak" subtitle="₹150 weekly streak bonus" />
        <Row icon={<Trophy className="h-4 w-4" />} title="5-star rating" subtitle="₹50 per 5-star service" />
      </div>
    </div>
  );
}

function Row({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </Card>
  );
}
