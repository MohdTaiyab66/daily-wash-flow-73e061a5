import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  getMarketplaceSettings,
  updateMarketplaceSettings,
  getMarketplaceAnalytics,
} from "@/lib/marketplace.functions";

export const Route = createFileRoute("/admin/marketplace-settings")({
  component: MarketplaceSettingsPage,
});

function MarketplaceSettingsPage() {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getMarketplaceSettings);
  const saveSettings = useServerFn(updateMarketplaceSettings);
  const fetchAnalytics = useServerFn(getMarketplaceAnalytics);

  const settingsQ = useQuery({ queryKey: ["mp-settings"], queryFn: () => fetchSettings() });
  const analyticsQ = useQuery({ queryKey: ["mp-analytics"], queryFn: () => fetchAnalytics() });

  const [form, setForm] = useState<any>(null);
  useEffect(() => {
    if (settingsQ.data) setForm({ ...settingsQ.data });
  }, [settingsQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        base_incentive: Number(form.base_incentive),
        round_increments: (form.round_increments as any[]).map(Number),
        max_incentive: Number(form.max_incentive),
        round_duration_sec: Number(form.round_duration_sec),
        max_rounds: Number(form.max_rounds),
        broadcast_enabled: !!form.broadcast_enabled,
        expand_radius_enabled: !!form.expand_radius_enabled,
        radius_per_round_m: (form.radius_per_round_m as any[]).map((n) => Math.round(Number(n))),
        neighbour_polygon_expansion: !!form.neighbour_polygon_expansion,
        auto_assign_final_round: !!form.auto_assign_final_round,
      };
      await saveSettings({ data: payload });
    },
    onSuccess: () => {
      toast.success("Marketplace settings saved");
      qc.invalidateQueries({ queryKey: ["mp-settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  if (!form) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  const a = analyticsQ.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Marketplace V2 — Broadcast Settings</h1>
        <p className="text-sm text-muted-foreground">
          Controls the Daily Shine broadcast marketplace: incentive rounds, radius expansion, timeouts.
        </p>
      </div>

      {a && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card p-4 text-xs sm:grid-cols-4">
          <Stat label="Broadcasts (30d)" value={a.total} />
          <Stat label="Assigned" value={a.assigned} />
          <Stat label="Conversion" value={`${a.conversion}%`} />
          <Stat label="Avg accept time" value={`${a.avg_accept_seconds}s`} />
          <Stat label="Avg incentive" value={`₹${a.avg_incentive}`} />
          <Stat label="Expired / alert" value={a.expired} />
          <Stat label="Round 1 wins" value={a.accepted_by_round[1] ?? 0} />
          <Stat label="Later rounds" value={a.assigned - (a.accepted_by_round[1] ?? 0)} />
        </div>
      )}

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Base earning per customer (₹)">
            <Input type="number" value={form.base_incentive} onChange={(e) => setForm({ ...form, base_incentive: e.target.value })} />
          </Field>
          <Field label="Maximum incentive (₹)">
            <Input type="number" value={form.max_incentive} onChange={(e) => setForm({ ...form, max_incentive: e.target.value })} />
          </Field>
          <Field label="Round duration (seconds)">
            <Input type="number" value={form.round_duration_sec} onChange={(e) => setForm({ ...form, round_duration_sec: e.target.value })} />
          </Field>
          <Field label="Maximum rounds">
            <Input type="number" value={form.max_rounds} onChange={(e) => setForm({ ...form, max_rounds: e.target.value })} />
          </Field>
          <Field label="Round increments (comma-separated ₹)">
            <Input
              value={(form.round_increments ?? []).join(",")}
              onChange={(e) => setForm({ ...form, round_increments: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            />
          </Field>
          <Field label="Radius per round (comma-separated metres)">
            <Input
              value={(form.radius_per_round_m ?? []).join(",")}
              onChange={(e) => setForm({ ...form, radius_per_round_m: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Toggle label="Broadcast mode" checked={!!form.broadcast_enabled} onChange={(v) => setForm({ ...form, broadcast_enabled: v })} />
          <Toggle label="Expand radius per round" checked={!!form.expand_radius_enabled} onChange={(v) => setForm({ ...form, expand_radius_enabled: v })} />
          <Toggle label="Include neighbour polygons" checked={!!form.neighbour_polygon_expansion} onChange={(v) => setForm({ ...form, neighbour_polygon_expansion: v })} />
          <Toggle label="Auto-assign after final round" checked={!!form.auto_assign_final_round} onChange={(v) => setForm({ ...form, auto_assign_final_round: v })} />
        </div>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-background p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
