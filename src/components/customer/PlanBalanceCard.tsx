import { useQuery } from "@tanstack/react-query";
import { Infinity as InfinityIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Meter } from "@/components/customer/ui/kit";

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
 * Collapses the raw benefit rows into the few lines the customer cares about.
 * Data/query behaviour is unchanged — presentation is a compact meter list.
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

  type Line = { label: string; row: Row | undefined };
  const lines: Line[] = [
    { label: "Exterior wash", row: dailyExterior },
    { label: "Interior wash", row: includedWash },
  ];
  if (extraExterior) lines.push({ label: "Extra exterior", row: extraExterior });
  if (extraInterior) lines.push({ label: "Extra interior", row: extraInterior });

  const visible = lines.filter((l) => l.row);

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <h3 className="text-[15px] font-semibold">This month</h3>
      <ul className="mt-3.5 space-y-4">
        {visible.map(({ label, row }) => {
          const r = row!;
          const total = r.total_allocated ?? 0;
          const used = Math.max(0, total - (r.remaining ?? 0));
          const exhausted = !r.unlimited && (r.remaining ?? 0) <= 0;
          return (
            <li key={r.benefit_type}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] font-medium">{label}</span>
                <span
                  className={`text-[13px] font-semibold tabular-nums ${
                    exhausted ? "text-muted-foreground" : "text-foreground"
                  }`}
                >
                  {r.unlimited ? (
                    <span className="inline-flex items-center gap-1 text-primary">
                      <InfinityIcon className="h-3.5 w-3.5" /> Unlimited
                    </span>
                  ) : (
                    <>
                      {used} / {total}
                    </>
                  )}
                </span>
              </div>
              {!r.unlimited && (
                <Meter className="mt-2" value={used} max={total} tone={exhausted ? "success" : "brand"} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
