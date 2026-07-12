import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

const MIN_CAP = 15;
const MAX_CAP = 35;
const STEP = 5;

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

  // Debounce so dragging the slider doesn't spam the DB.
  const debounceRef = useRef<number | null>(null);
  const persistCap = (next: number) => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      save.mutate({ max_daily_cars: next, accepting_new: accepting });
    }, 500);
  };

  return (
    <Card className="mt-4 p-5">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-sm font-semibold">Daily Capacity</p>
          <p className="mt-0.5 text-xs text-muted-foreground">We never offer beyond your cap.</p>
        </div>
        <p className="text-2xl font-semibold tabular-nums">
          {cap}<span className="ml-1 text-sm text-muted-foreground">Cars</span>
        </p>
      </div>

      <Slider
        className="mt-4"
        value={[cap]}
        min={MIN_CAP}
        max={MAX_CAP}
        step={STEP}
        onValueChange={(v) => { setCap(v[0]); persistCap(v[0]); }}
      />
      <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
        <span>{MIN_CAP}</span>
        <span>{MAX_CAP}</span>
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
