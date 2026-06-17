import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSettings, updateSetting } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/settings")({
  component: SettingsPage,
});

const LABELS: Record<string, string> = {
  rate_per_car: "Rate per car (₹)",
  unavailable_compensation: "Unavailable day compensation (₹)",
  hold_amount_days: "Hold amount duration (days)",
  area_lock_days: "Area lock duration (days)",
  min_cars_required: "Minimum cars required",
  max_cars_allowed: "Maximum cars allowed",
  min_assignment_days: "Minimum assignment days",
  min_assignment_days_new: "Minimum days (new partner)",
  max_assignment_days: "Maximum assignment days",
  cancel_penalty: "Cancellation penalty (₹)",
  referral_partner_reward: "Partner referral reward (₹)",
  referral_customer_reward: "Customer referral reward (₹)",
  route_visibility_until: "Route visibility time",
  auto_notify_partners_on_new_customer: "Auto-notify partners when new customers added",
};
const BOOL_KEYS = new Set(["auto_notify_partners_on_new_customer"]);

function SettingsPage() {
  const listFn = useServerFn(listSettings);
  const updateFn = useServerFn(updateSetting);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["platform-settings"], queryFn: () => listFn() });
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data) {
      const m: Record<string, string> = {};
      data.forEach((s: any) => (m[s.key] = String(s.value)));
      setValues(m);
    }
  }, [data]);

  const mut = useMutation({
    mutationFn: (v: { key: string; value: number | string }) => updateFn({ data: v }),
    onSuccess: () => {
      toast.success("Setting updated");
      qc.invalidateQueries({ queryKey: ["platform-settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Edit platform rates and rules.</p>

      <div className="mt-8 grid gap-3">
        {(data ?? []).map((s: any) => (
          <Card key={s.key} className="flex items-center gap-4 p-4">
            <div className="flex-1">
              <p className="text-sm font-medium">{LABELS[s.key] ?? s.key}</p>
              <p className="text-xs text-muted-foreground">{s.description ?? s.key}</p>
            </div>
            {s.key === "route_visibility_until" ? (
              <select className="h-10 w-32 rounded-md border border-input bg-background px-3 text-sm" value={values[s.key] ?? "all_day"} onChange={(e) => setValues((p) => ({ ...p, [s.key]: e.target.value }))}>
                {['10:00','11:00','12:00','13:00','all_day'].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            ) : BOOL_KEYS.has(s.key) ? (
              <select className="h-10 w-32 rounded-md border border-input bg-background px-3 text-sm" value={values[s.key] ?? "true"} onChange={(e) => setValues((p) => ({ ...p, [s.key]: e.target.value }))}>
                <option value="true">ON</option>
                <option value="false">OFF</option>
              </select>
            ) : (
              <Input type="number" className="w-32" value={values[s.key] ?? ""} onChange={(e) => setValues((p) => ({ ...p, [s.key]: e.target.value }))} />
            )}
            <Button
              size="sm"
              disabled={mut.isPending || String(s.value) === values[s.key]}
              onClick={() => mut.mutate({ key: s.key, value: s.key === "route_visibility_until" || BOOL_KEYS.has(s.key) ? values[s.key] : Number(values[s.key]) })}
            >
              Save
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
