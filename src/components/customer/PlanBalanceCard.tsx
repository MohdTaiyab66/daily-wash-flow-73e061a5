import { useQuery } from "@tanstack/react-query";
import { Sparkles, Infinity as InfinityIcon, Droplets, Wrench, Plus } from "lucide-react";
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

/**
 * Customer-facing plan balance.
 * Collapses the 7 raw benefit rows into 4 lines the customer actually cares about:
 *   • Daily Exterior           (from `exterior_daily`)
 *   • Included Wash            (from `interior` — the monthly Interior+Exterior wash)
 *   • Extra Exterior           (only shown if a monthly add-on is active — remaining > 0 or allocated > 0 excluding the baseline)
 *   • Extra Interior           (same rule)
 *
 * Everything else (Hydrophobic, Paper Mats, Fragrance, Tyre Polish) is hidden
 * from the customer view — those are partner/ops-facing benefits.
 */
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

  const byType = new Map(rows.map((r) => [r.benefit_type, r]));
  const dailyExterior = byType.get("exterior_daily");
  const includedWash = byType.get("interior");
  const extraExterior = byType.get("extra_exterior");
  const extraInterior = byType.get("extra_interior");

  type Line = { label: string; row: Row | undefined; icon: typeof Sparkles };
  const lines: Line[] = [
    { label: "Daily Exterior", row: dailyExterior, icon: Droplets },
    { label: "Included Wash", row: includedWash, icon: Sparkles },
  ];
  if (extraExterior) lines.push({ label: "Extra Exterior", row: extraExterior, icon: Plus });
  if (extraInterior) lines.push({ label: "Extra Interior", row: extraInterior, icon: Wrench });

  const visible = lines.filter((l) => l.row);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">This month</h3>
      </div>
      <ul className="space-y-2">
        {visible.map(({ label, row, icon: Icon }) => {
          const r = row!;
          const exhausted = !r.unlimited && (r.remaining ?? 0) <= 0;
          return (
            <li
              key={r.benefit_type}
              className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${
                exhausted ? "border-destructive/40 bg-destructive/5" : "border-border bg-background"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className={`grid h-8 w-8 place-items-center rounded-lg ${exhausted ? "bg-destructive/10 text-destructive" : "bg-accent text-primary"}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium">{label}</span>
              </div>
              <span className={`text-sm font-semibold tabular-nums ${exhausted ? "text-destructive" : "text-foreground"}`}>
                {r.unlimited ? (
                  <span className="inline-flex items-center gap-1 text-primary">
                    <InfinityIcon className="h-3.5 w-3.5" /> Unlimited
                  </span>
                ) : (
                  <>
                    {r.remaining} / {r.total_allocated}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
