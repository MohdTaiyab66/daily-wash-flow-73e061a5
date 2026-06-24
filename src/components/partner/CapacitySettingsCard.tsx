import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const OPTIONS = [15, 20, 25, 30, 35];

export function CapacitySettingsCard({ partnerId }: { partnerId: string | null }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["partner-capacity", partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("partners")
        .select("max_daily_cars, accepting_new").eq("id", partnerId).maybeSingle();
      return data as { max_daily_cars: number; accepting_new: boolean } | null;
    },
  });

  const [cap, setCap] = useState<number>(25);
  const [accepting, setAccepting] = useState<boolean>(true);
  useEffect(() => {
    if (data) { setCap(data.max_daily_cars); setAccepting(data.accepting_new); }
  }, [data]);

  const save = useMutation({
    mutationFn: async (vals: { max_daily_cars: number; accepting_new: boolean }) => {
      const { error } = await (supabase as any).from("partners").update(vals).eq("id", partnerId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["partner-capacity", partnerId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  return (
    <Card className="mt-4 p-4">
      <p className="text-sm font-semibold">Daily Shine capacity</p>
      <p className="mt-0.5 text-xs text-muted-foreground">We never offer beyond your cap.</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => { setCap(n); save.mutate({ max_daily_cars: n, accepting_new: accepting }); }}
            className={`rounded-full border px-3 py-1 text-xs ${cap === n ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
          >
            {n} cars
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <Label className="text-sm">Accept new offers</Label>
        <Switch
          checked={accepting}
          onCheckedChange={(v) => { setAccepting(v); save.mutate({ max_daily_cars: cap, accepting_new: v }); }}
        />
      </div>
    </Card>
  );
}
