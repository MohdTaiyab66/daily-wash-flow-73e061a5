import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CalendarDays, Lock, Car, Clock, MapPin, IndianRupee } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { getTodayIST, formatBusinessDate } from "@/lib/date-utils";
import { PartnerShell } from "@/components/partner/PartnerShell";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

const RATE = 17;




export const Route = createFileRoute("/_authenticated/app/earnings")({
  component: () => (
    <PartnerShell>
      <EarningsPage />
    </PartnerShell>
  ),
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

  useRealtimeInvalidation(["services", "assignments", "partner_notifications", "wallet_ledger"], [
    ["earnings-v3"],
    ["today-assignment-for-earnings"],
    ["today-assignment"],
    ["partner-notifications-unread"],
    ["history"]
  ]);

  const { data: todayQuery } = useQuery({
    queryKey: ["today-assignment-for-earnings"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      
      const today = getTodayIST();
      const { data: a } = await supabase
        .from("assignments")
        .select("*")
        .eq("partner_id", u.user.id)
        .eq("status", "active")
        .gte("end_date", today)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!a) return null;

      const { data: services } = await supabase
        .from("services")
        .select("id,vehicle_id,status,scheduled_date")
        .eq("assignment_id", a.id);

      const all = (services ?? []).filter((s: any) => s.status !== "covered_by_booking");
      const assignmentTotalCustomers = new Set(all.filter(s => s.scheduled_date === today).map((s: any) => s.vehicle_id ?? s.id).filter(Boolean)).size;
      const ratePerCar = Number(a.rate_per_car || 17);
      
      const expectedDaily = assignmentTotalCustomers * ratePerCar;
      const expectedMonthly = expectedDaily * 26;

      return {
        daily: expectedDaily,
        monthly: expectedMonthly,
        rate: ratePerCar,
        count: assignmentTotalCustomers
      };
    }
  });

  const { data: stats } = useQuery({
    queryKey: ["earnings-v3"],
    staleTime: 0, // Ensure we always get fresh data when switching to this tab
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const id = u.user!.id;
      const today = new Date();
      const todayStr = getTodayIST();

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
      const NEED_WASH_RATE = 12;
      for (const s of services ?? []) {
        let r = Number(s.rate_per_car || RATE);
        if (s.status === "unavailable") {
          r = (s as any).unavailable_reason === 'dirty_vehicle' ? NEED_WASH_RATE : UNAVAILABLE_RATE;
        }
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
  const nextStr = formatBusinessDate(next).split("·")[0].trim();


  // First payout only after 15 active days from joining
  const joined = partner?.joined_on ? new Date(partner.joined_on) : new Date();
  const daysSinceJoin = Math.floor((Date.now() - joined.getTime()) / 86400000);
  const firstPayoutReady = daysSinceJoin >= 15;

  const view = (label: string, total: number, n: number) => (
    <Card className="p-6 border-neutral-100 shadow-sm bg-white rounded-3xl">
      <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">{label}</p>
      <p className="mt-1 text-4xl font-black tracking-tighter text-[#1A1A1A]">₹{total.toLocaleString("en-IN")}</p>
      <div className="mt-6 grid grid-cols-3 gap-4 border-t border-neutral-50 pt-5 text-xs">
        <Mini icon={<Car className="h-3.5 w-3.5" />} label={t("cars")} value={String(n)} />
        <Mini icon={<Clock className="h-3.5 w-3.5" />} label="Daily Avg" value={n ? `₹${Math.round(total / Math.max(1, stats?.daysActive ?? 1))}` : "₹0"} />
        <Mini icon={<IndianRupee className="h-3.5 w-3.5" />} label="Rate" value={`₹${RATE}`} />
      </div>
    </Card>
  );


  // Motivational milestone for today.
  const todayEarn = stats?.today ?? 0;
  const MILESTONES = [100, 250, 500, 750, 1000];
  const nextMilestone = MILESTONES.find((m) => m > todayEarn);
  const milestoneGap = nextMilestone ? nextMilestone - todayEarn : 0;

  return (
    <div className="mx-auto max-w-md px-5 pt-3 pb-32 space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight text-[#1A1A1A]">Wallet</h1>
        <p className="text-sm text-muted-foreground font-medium">Your earnings and payout history</p>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-12 bg-neutral-100 p-1 rounded-2xl">
          <TabsTrigger value="today" className="rounded-xl font-bold text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">{t("today")}</TabsTrigger>
          <TabsTrigger value="week" className="rounded-xl font-bold text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">{t("week")}</TabsTrigger>
          <TabsTrigger value="month" className="rounded-xl font-bold text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">{t("month")}</TabsTrigger>
          <TabsTrigger value="lifetime" className="rounded-xl font-bold text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">{t("all")}</TabsTrigger>
        </TabsList>
        
        {nextMilestone && tab === "today" && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#FF6B00]/10 px-4 py-3 border border-[#FF6B00]/5">
            <span className="text-xl">🔥</span>
            <p className="text-[13px] leading-tight font-bold text-[#1A1A1A]">
              Earn ₹{milestoneGap} more today
              <span className="text-muted-foreground block font-medium mt-0.5">to cross your next milestone of ₹{nextMilestone}</span>
            </p>
          </div>
        )}

        <TabsContent value="today" className="mt-6">{view(t("today"), stats?.today ?? 0, stats?.todayN ?? 0)}</TabsContent>
        <TabsContent value="week" className="mt-6">{view(t("this_week"), stats?.week ?? 0, stats?.weekN ?? 0)}</TabsContent>
        <TabsContent value="month" className="mt-6">{view(t("this_month"), stats?.month ?? 0, stats?.monthN ?? 0)}</TabsContent>
        <TabsContent value="lifetime" className="mt-6">{view(t("lifetime"), stats?.lifetime ?? 0, stats?.lifetimeN ?? 0)}</TabsContent>
      </Tabs>

      {todayQuery && (
        <section className="space-y-4">
          <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">Active Assignment</h2>
          <Card className="p-6 border-none shadow-xl bg-[#1A1A1A] text-white rounded-[32px] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF6B00]/10 rounded-full blur-3xl -mr-16 -mt-16" />
            <div className="space-y-5 relative z-10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Car className="h-5 w-5 text-[#FF6B00]" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-white/40 tracking-wider">Target</p>
                  <p className="text-lg font-black">{todayQuery.count} Customers</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-5">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-white/40 tracking-wider">Daily</p>
                  <p className="text-xl font-black text-[#FF6B00]">₹{todayQuery.daily.toLocaleString("en-IN")}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-white/40 tracking-wider">Monthly</p>
                  <p className="text-xl font-black text-white">₹{todayQuery.monthly.toLocaleString("en-IN")}</p>
                </div>
              </div>
            </div>
          </Card>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground px-1">{t("next_payout")}</h2>
        <Card className="p-6 border-neutral-100 shadow-sm bg-white rounded-3xl">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">{t("settling_on")}</p>
              <p className="mt-1 text-xl font-black text-[#1A1A1A]">{nextStr}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">{t("amount")}</p>
              <p className="mt-1 text-xl font-black text-[#FF6B00]">₹{(stats?.week ?? 0).toLocaleString("en-IN")}</p>
            </div>
          </div>
          {!firstPayoutReady && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl bg-neutral-50 p-4 border border-neutral-100/50">
              <Lock className="mt-0.5 h-4 w-4 text-[#FF6B00]" strokeWidth={3} />
              <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                First payout releases after your first 15 active days. <span className="font-bold text-[#1A1A1A]">({15 - daysSinceJoin} days remaining)</span>.
                Urban Wash holds your first week as a security reserve.
              </p>
            </div>
          )}
        </Card>
      </section>

      <div className="flex items-center gap-2 px-1 opacity-60">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Payouts run every Monday</p>
      </div>
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
