import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/dar")({
  component: DarDashboard,
  head: () => ({ meta: [{ title: "Dynamic Assignment Recovery · Admin" }] }),
});

type EventRow = {
  id: string;
  partner_id: string;
  reason: string;
  status: string;
  affected_count: number;
  recovered_count: number;
  triggered_at: string;
  resolved_at: string | null;
};

function DarDashboard() {
  const qc = useQueryClient();

  const { data: metrics } = useQuery({
    queryKey: ["dar-metrics"],
    queryFn: async () => {
      const { data } = await supabase.rpc("dar_dashboard_metrics");
      return (data ?? {}) as Record<string, number>;
    },
    refetchInterval: 10000,
  });

  const { data: events } = useQuery({
    queryKey: ["dar-events"],
    queryFn: async () => {
      const { data } = await supabase
        .from("dar_events")
        .select("id,partner_id,reason,status,affected_count,recovered_count,triggered_at,resolved_at")
        .eq("scheduled_date", new Date().toISOString().slice(0, 10))
        .order("triggered_at", { ascending: false })
        .limit(50);
      return (data ?? []) as EventRow[];
    },
    refetchInterval: 8000,
  });

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("admin-dar-" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "dar_events" }, () => {
        qc.invalidateQueries({ queryKey: ["dar-metrics"] });
        qc.invalidateQueries({ queryKey: ["dar-events"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "dar_offers" }, () => {
        qc.invalidateQueries({ queryKey: ["dar-metrics"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const m = metrics ?? {};
  const cards = [
    { label: "Released customers", value: m.released_customers ?? 0 },
    { label: "Pending recovery", value: m.pending_recovery ?? 0 },
    { label: "Recovered", value: m.recovered_customers ?? 0 },
    { label: "Success rate", value: `${m.success_rate_pct ?? 0}%` },
    { label: "Avg recovery", value: `${Math.round((m.avg_recovery_sec ?? 0) / 60)} min` },
    { label: "Active events", value: m.active_events ?? 0 },
    { label: "Pending offers", value: m.pending_offers ?? 0 },
    { label: "Partner utilization", value: m.partner_utilization ?? 0 },
  ];

  return (
    <div data-testid="dar-dashboard">
      <h1 className="text-3xl font-semibold tracking-tight">Dynamic Assignment Recovery</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Realtime view of customer releases and recovery offers. Today only.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <p className="text-xs uppercase text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold">{c.value}</p>
          </Card>
        ))}
      </div>

      <h2 className="mt-8 text-lg font-semibold">Today's events</h2>
      <Card className="mt-3 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Triggered</th>
              <th className="px-4 py-2">Reason</th>
              <th className="px-4 py-2">Affected</th>
              <th className="px-4 py-2">Recovered</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(events ?? []).map((e) => (
              <tr key={e.id} className="border-t border-border">
                <td className="px-4 py-2">{new Date(e.triggered_at).toLocaleTimeString()}</td>
                <td className="px-4 py-2 capitalize">{e.reason}</td>
                <td className="px-4 py-2">{e.affected_count}</td>
                <td className="px-4 py-2">{e.recovered_count}</td>
                <td className="px-4 py-2">
                  <Badge variant={e.status === "recovered" ? "default" : e.status === "expired" ? "destructive" : "secondary"}>
                    {e.status}
                  </Badge>
                </td>
              </tr>
            ))}
            {events && events.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No recovery events today</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
