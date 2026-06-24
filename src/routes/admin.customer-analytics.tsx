import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, Sparkles, Calendar, IndianRupee, TrendingUp, BadgeCheck } from "lucide-react";

export const Route = createFileRoute("/admin/customer-analytics")({
  ssr: false,
  head: () => ({ meta: [{ title: "Customer Analytics — Urban Wash Admin" }] }),
  component: CustomerAnalytics,
});

type Stats = {
  totalCustomers: number;
  activeCustomers: number;
  activeSubscriptions: number;
  dailyShineCustomers: number;
  bookingsToday: number;
  revenueToday: number;
  revenueThisMonth: number;
};

function startOfTodayIso() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
}
function startOfMonthIso() {
  const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString();
}
function thirtyDaysAgoIso() {
  const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString();
}

function CustomerAnalytics() {
  const q = useQuery({
    queryKey: ["customer-analytics"],
    queryFn: async (): Promise<Stats> => {
      const todayIso = startOfTodayIso();
      const monthIso = startOfMonthIso();
      const recentIso = thirtyDaysAgoIso();

      const [
        custCount,
        subsActive,
        bookingsTodayQ,
        bookingsRecent,
        revenueTodayQ,
        revenueMonthQ,
      ] = await Promise.all([
        supabase.from("customer_profiles").select("*", { count: "exact", head: true }),
        supabase.from("bookings").select("user_id, service_type", { count: "exact" })
          .eq("service_type", "subscription").in("status", ["active", "in_progress", "scheduled"] as any),
        supabase.from("bookings").select("id", { count: "exact", head: true }).gte("created_at", todayIso),
        supabase.from("bookings").select("user_id").gte("created_at", recentIso),
        supabase.from("bookings").select("amount").gte("created_at", todayIso).eq("payment_status" as any, "paid"),
        supabase.from("bookings").select("amount").gte("created_at", monthIso).eq("payment_status" as any, "paid"),
      ]);

      const activeCustomers = new Set(((bookingsRecent.data ?? []) as Array<{ user_id: string }>).map(b => b.user_id)).size;
      const dailyShineCustomers = new Set(
        ((subsActive.data ?? []) as Array<{ user_id: string }>).map(b => b.user_id),
      ).size;
      const sum = (rows: any[] | null) => (rows ?? []).reduce((a, r) => a + (Number(r.amount) || 0), 0);

      return {
        totalCustomers: custCount.count ?? 0,
        activeCustomers,
        activeSubscriptions: subsActive.count ?? 0,
        dailyShineCustomers,
        bookingsToday: bookingsTodayQ.count ?? 0,
        revenueToday: sum(revenueTodayQ.data as any[]),
        revenueThisMonth: sum(revenueMonthQ.data as any[]),
      };
    },
  });

  const s = q.data;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Customer Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">Real-time view of customer growth and revenue.</p>
      </div>

      {q.isLoading && <div className="h-48 animate-pulse rounded-2xl bg-muted" />}
      {q.error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Failed to load: {(q.error as Error).message}</div>}

      {s && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Stat icon={Users} label="Total customers" value={s.totalCustomers} />
          <Stat icon={TrendingUp} label="Active customers (30d)" value={s.activeCustomers} />
          <Stat icon={Sparkles} label="Active subscriptions" value={s.activeSubscriptions} />
          <Stat icon={BadgeCheck} label="Daily Shine customers" value={s.dailyShineCustomers} />
          <Stat icon={Calendar} label="Bookings today" value={s.bookingsToday} />
          <Stat icon={IndianRupee} label="Revenue today" value={`₹${s.revenueToday.toLocaleString("en-IN")}`} />
          <Stat icon={IndianRupee} label="Revenue this month" value={`₹${s.revenueThisMonth.toLocaleString("en-IN")}`} />
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight">{value}</div>
    </div>
  );
}
