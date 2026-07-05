import { useQuery } from "@tanstack/react-query";
import { Sparkles, Infinity as InfinityIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  benefit_type: string;
  total_allocated: number | null;
  consumed: number;
  remaining: number | null;
  unlimited: boolean;
  subscription_id: string;
  cycle_end: string;
};

const LABELS: Record<string, string> = {
  interior: "Premium Interior",
  exterior_daily: "Daily Exterior",
  exterior_hydrophobic: "Hydrophobic Exterior",
  dusting: "Daily Dusting",
  tyre_polish: "Tyre Polish",
  paper_mats: "Paper Mats",
  fragrance: "Fragrance Spray",
};

export function PlanBalanceCard({ vehicleId }: { vehicleId: string | null }) {
  const q = useQuery({
    queryKey: ["vehicle-entitlements", vehicleId],
    enabled: !!vehicleId,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await (supabase as any).rpc("get_vehicle_entitlements", {
        p_vehicle_id: vehicleId,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  if (!vehicleId) return null;
  if (q.isLoading) return <div className="h-24 animate-pulse rounded-2xl bg-muted" />;
  const rows = q.data ?? [];
  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Plan balance (this vehicle)</h3>
      </div>
      <ul className="grid grid-cols-2 gap-2 text-xs">
        {rows.map((r) => {
          const label = LABELS[r.benefit_type] ?? r.benefit_type;
          const exhausted = !r.unlimited && (r.remaining ?? 0) <= 0;
          return (
            <li
              key={r.benefit_type}
              className={`rounded-lg border px-3 py-2 ${
                exhausted ? "border-destructive/40 bg-destructive/5" : "border-border bg-background"
              }`}
            >
              <div className="font-medium">{label}</div>
              <div className={`mt-0.5 ${exhausted ? "text-destructive" : "text-muted-foreground"}`}>
                {r.unlimited ? (
                  <span className="inline-flex items-center gap-1">
                    <InfinityIcon className="h-3 w-3" /> Unlimited
                  </span>
                ) : (
                  <>
                    {r.remaining} / {r.total_allocated} remaining
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
