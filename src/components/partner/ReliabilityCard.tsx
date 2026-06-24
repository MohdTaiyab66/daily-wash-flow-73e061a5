import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ShieldCheck, TrendingUp, TrendingDown } from "lucide-react";

const LABELS: Record<string, string> = {
  assignment_accepted: "Accepted a customer",
  service_completed: "Completed service",
  on_time_service: "On-time service",
  customer_complaint: "Customer complaint",
  missed_service: "Missed service",
  assignment_cancelled: "Cancelled assignment",
  repeated_unavailability: "Repeated unavailability",
};

export function ReliabilityCard({ partnerId, score }: { partnerId: string; score: number }) {
  const { data: events } = useQuery({
    queryKey: ["reliability-events", partnerId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("partner_reliability_events")
        .select("id, event_type, delta, created_at")
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: false })
        .limit(5);
      return (data ?? []) as Array<{ id: string; event_type: string; delta: number; created_at: string }>;
    },
  });

  const tone = score >= 85 ? "text-success" : score >= 70 ? "text-amber-500" : "text-destructive";
  const ring = score >= 85 ? "border-success/40 bg-success/5" : score >= 70 ? "border-amber-500/40 bg-amber-500/5" : "border-destructive/40 bg-destructive/5";

  return (
    <Card className={`mt-4 p-5 ${ring}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className={`h-5 w-5 ${tone}`} />
          <p className="text-sm font-semibold">Reliability Score</p>
        </div>
        <p className={`text-2xl font-bold ${tone}`}>{score}<span className="text-sm text-muted-foreground">/100</span></p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Acceptance, completion, and on-time service raise this. Complaints and misses lower it.
      </p>
      {events && events.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
          {events.map((e) => (
            <div key={e.id} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{LABELS[e.event_type] ?? e.event_type}</span>
              <span className={`inline-flex items-center gap-0.5 font-semibold ${e.delta >= 0 ? "text-success" : "text-destructive"}`}>
                {e.delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {e.delta >= 0 ? `+${e.delta}` : e.delta}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
