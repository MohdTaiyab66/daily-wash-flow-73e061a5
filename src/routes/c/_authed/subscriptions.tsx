import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Pause, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/c/_authed/subscriptions")({
  ssr: false,
  head: () => ({ meta: [{ title: "Subscriptions — Urban Wash" }] }),
  component: SubscriptionsPage,
});

type Row = {
  id: string;
  scheduled_date: string;
  status: string;
  total_amount: number;
  service_catalog: { name: string; service_type: string } | null;
};

function SubscriptionsPage() {
  const q = useQuery({
    queryKey: ["customer-subscriptions"],
    queryFn: async (): Promise<Row[]> => {
      const { data } = await (supabase as any)
        .from("bookings")
        .select("id, scheduled_date, status, total_amount, service_catalog:service_id(name, service_type)")
        .order("scheduled_date", { ascending: false })
        .limit(50);
      const rows = (data ?? []) as Row[];
      return rows.filter((r) => r.service_catalog?.service_type === "subscription");
    },
  });

  const items = q.data ?? [];

  return (
    <div className="px-5 pt-6">
      <h1 className="text-2xl font-semibold tracking-tight">My subscriptions</h1>
      <p className="mt-1 text-xs text-muted-foreground">Daily shine plans you've subscribed to.</p>

      <div className="mt-5 space-y-3">
        {q.isLoading && Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
        ))}

        {!q.isLoading && items.length === 0 && (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-border p-10 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">No active subscriptions.</p>
            <Button asChild className="mt-4 rounded-full"><Link to="/c/home">Browse plans</Link></Button>
          </div>
        )}

        {items.map((s) => (
          <div key={s.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{s.service_catalog?.name}</div>
                <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" /> Started {s.scheduled_date}
                </div>
              </div>
              <span className="rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-medium capitalize text-success">
                {s.status.replaceAll("_", " ")}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs">
              <span className="font-semibold">₹{s.total_amount}/mo</span>
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs">
                <Pause className="h-3 w-3" /> Pause
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
