import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSettings, updateSetting } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/settings")({
  component: SettingsPage,
});

type FieldKind = "number" | "bool" | "text" | "select" | "csv";
type Field = { key: string; label: string; help?: string; kind?: FieldKind; options?: string[] };

const TIME_OPTS = ["06:00","07:00","08:00","09:00","10:00","11:00","12:00","13:00","all_day"];

const SECTIONS: { id: string; title: string; description: string; fields: Field[] }[] = [
  {
    id: "assignment",
    title: "Assignment",
    description: "Controls how partner assignments are built and dispatched.",
    fields: [
      { key: "min_cars_required", label: "Minimum cars required" },
      { key: "max_cars_allowed", label: "Maximum cars allowed" },
      { key: "min_assignment_days", label: "Minimum assignment days" },
      { key: "min_assignment_days_new", label: "Minimum days (new partner)" },
      { key: "max_assignment_days", label: "Maximum assignment days" },
      { key: "trial_mode", label: "Trial mode", kind: "bool" },
      { key: "manual_assignment_enabled", label: "Manual assignment", kind: "bool" },
      { key: "auto_assign_enabled", label: "Auto assignment", kind: "bool" },
      { key: "allow_partner_cancel", label: "Allow partner to cancel", kind: "bool" },
      { key: "allow_partner_rebuild", label: "Allow partner to rebuild", kind: "bool" },
      { key: "assignment_lock_days", label: "Assignment lock duration (days)" },
      { key: "area_lock_days", label: "Area lock duration (days)" },
      { key: "search_radius_km", label: "Initial search radius (km)" },
      { key: "radius_increment_km", label: "Radius increment (km)" },
      { key: "max_radius_km", label: "Maximum search radius (km)" },
      { key: "auto_assign_radius_steps", label: "Radius expansion steps (km, csv)", kind: "csv" },
      { key: "marketplace_timeout_sec", label: "Marketplace timeout (sec)" },
      { key: "auto_assign_timeout_sec", label: "Offer timeout (sec)" },
      { key: "retry_attempts", label: "Retry attempts" },
      { key: "broadcast_interval_sec", label: "Broadcast interval (sec)" },
      { key: "auto_assign_max_per_partner", label: "Max cars per partner" },
    ],
  },
  {
    id: "earnings",
    title: "Earnings",
    description: "Per-service and bonus rates. Wallet calculations reflect these instantly.",
    fields: [
      { key: "rate_per_car", label: "Daily Shine per car (INR)" },
      { key: "deep_clean_rate", label: "Deep Clean (INR)" },
      { key: "onetime_rate", label: "One-time wash (INR)" },
      { key: "interior_rate", label: "Interior (INR)" },
      { key: "exterior_rate", label: "Exterior (INR)" },
      { key: "addon_rate", label: "Add-on service (INR)" },
      { key: "dirty_reward", label: "Dirty vehicle reward (INR)" },
      { key: "unavailable_compensation", label: "Unavailable vehicle reward (INR)" },
      { key: "complaint_deduction", label: "Complaint deduction (INR)" },
      { key: "cancel_penalty", label: "Cancellation penalty (INR)" },
      { key: "reliability_bonus", label: "Reliability bonus (INR)" },
      { key: "monthly_bonus", label: "Monthly bonus (INR)" },
      { key: "attendance_bonus", label: "Attendance bonus (INR)" },
      { key: "corporate_bonus", label: "Corporate customer bonus (INR)" },
      { key: "vip_bonus", label: "VIP customer bonus (INR)" },
      { key: "hold_amount_days", label: "Hold amount duration (days)" },
      { key: "referral_partner_reward", label: "Partner referral reward (INR)" },
      { key: "referral_customer_reward", label: "Customer referral reward (INR)" },
    ],
  },
  {
    id: "visibility",
    title: "Service Visibility",
    description: "When partners see today’s route.",
    fields: [
      { key: "route_visibility_until", label: "Today’s route visible from", kind: "select", options: TIME_OPTS },
      { key: "auto_notify_partners_on_new_customer", label: "Auto-notify on new customers", kind: "bool" },
    ],
  },
  {
    id: "route",
    title: "Route Optimization",
    description: "Weights and limits for the route optimizer.",
    fields: [
      { key: "opt_cluster_first", label: "Cluster-first mode", kind: "bool" },
      { key: "opt_distance_weight", label: "Distance weight" },
      { key: "opt_time_weight", label: "Time weight" },
      { key: "opt_soft_window_weight", label: "Soft time-window weight" },
      { key: "opt_hard_window_weight", label: "Hard time-window weight" },
      { key: "opt_emergency_weight", label: "Emergency priority" },
      { key: "opt_locked_weight", label: "Locked customer priority" },
      { key: "opt_corporate_weight", label: "Corporate priority" },
      { key: "opt_vip_weight", label: "VIP priority" },
      { key: "opt_complaint_weight", label: "Complaint priority" },
      { key: "opt_max_deviation_m", label: "Max route deviation (m)" },
      { key: "opt_max_travel_km", label: "Max travel distance (km)" },
      { key: "opt_max_travel_min", label: "Max travel time (min)" },
      { key: "opt_default_speed_kmh", label: "Default speed (km/h)" },
      { key: "opt_avg_service_min", label: "Average service duration (min)" },
    ],
  },
  {
    id: "attendance",
    title: "Attendance",
    description: "Check-in / check-out rules.",
    fields: [
      { key: "attendance_radius_m", label: "Attendance radius (m)" },
      { key: "late_tolerance_min", label: "Late tolerance (min)" },
      { key: "checkin_distance_m", label: "Check-in distance (m)" },
      { key: "checkout_distance_m", label: "Check-out distance (m)" },
      { key: "gps_verification", label: "GPS verification", kind: "bool" },
      { key: "selfie_required", label: "Selfie required", kind: "bool" },
      // background_tracking hidden until native build supports it
    ],
  },
  {
    id: "capacity",
    title: "Partner Capacity",
    description: "Per-partner caps used by the optimizer and marketplace.",
    fields: [
      { key: "default_cars_per_day", label: "Cars per day" },
      { key: "max_working_hours", label: "Max working hours" },
      { key: "partner_max_travel_km", label: "Max travel distance (km)" },
      { key: "max_subscriptions", label: "Max subscriptions" },
      { key: "max_onetime", label: "Max one-time bookings" },
      // auto_capacity_calc hidden — depends on historical analytics not yet implemented
    ],
  },
  {
    id: "marketplace",
    title: "Marketplace",
    description: "Scoring weights and offer behaviour.",
    fields: [
      { key: "offer_priority_mode", label: "Offer priority mode", kind: "select", options: ["score","distance","round_robin"] },
      { key: "weight_reliability", label: "Reliability weight" },
      { key: "weight_distance", label: "Distance weight" },
      { key: "weight_capacity", label: "Capacity weight" },
      { key: "weight_urgency", label: "Urgency weight" },
      { key: "weight_route_impact", label: "Route impact weight" },
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "Toggle notification categories and UX behaviour.",
    fields: [
      { key: "notify_offer", label: "Offer notification", kind: "bool" },
      { key: "notify_assignment", label: "Assignment notification", kind: "bool" },
      { key: "notify_completion", label: "Completion notification", kind: "bool" },
      { key: "notify_wallet", label: "Wallet notification", kind: "bool" },
      { key: "notify_attendance", label: "Attendance notification", kind: "bool" },
      { key: "notify_reminder", label: "Reminder notification", kind: "bool" },
      { key: "sound_enabled", label: "Sound", kind: "bool" },
      { key: "vibration_enabled", label: "Vibration", kind: "bool" },
      { key: "autopopup_enabled", label: "Auto-popup offers", kind: "bool" },
    ],
  },
  {
    id: "maps",
    title: "Maps",
    description: "Map providers, layers and refresh intervals.",
    fields: [
      { key: "map_provider", label: "Map provider", kind: "select", options: ["google","mapbox","osm"] },
      { key: "navigation_mode", label: "Navigation mode", kind: "select", options: ["driving","walking","bicycling"] },
      { key: "traffic_layer", label: "Traffic layer", kind: "bool" },
      { key: "satellite_layer", label: "Satellite layer", kind: "bool" },
      { key: "cluster_view", label: "Cluster view", kind: "bool" },
      { key: "heat_map", label: "Heat map", kind: "bool" },
      { key: "partner_location_interval_sec", label: "Partner location interval (sec)" },
      { key: "customer_refresh_sec", label: "Customer refresh interval (sec)" },
      { key: "route_refresh_sec", label: "Route refresh interval (sec)" },
    ],
  },
];

function inferKind(f: Field, raw: any): FieldKind {
  if (f.kind) return f.kind;
  if (typeof raw === "boolean") return "bool";
  if (Array.isArray(raw)) return "csv";
  if (typeof raw === "string") return "text";
  return "number";
}

function SettingsPage() {
  const listFn = useServerFn(listSettings);
  const updateFn = useServerFn(updateSetting);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["platform-settings"], queryFn: () => listFn() });
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    const m: Record<string, string> = {};
    data.forEach((s: any) => {
      m[s.key] = Array.isArray(s.value)
        ? s.value.join(",")
        : typeof s.value === "string" ? s.value
        : JSON.stringify(s.value);
    });
    setValues(m);
  }, [data]);

  const byKey: Record<string, any> = {};
  (data ?? []).forEach((s: any) => (byKey[s.key] = s));

  const mut = useMutation({
    mutationFn: (v: { key: string; value: number | string | boolean }) => updateFn({ data: v }),
    onSuccess: () => {
      toast.success("Setting updated");
      qc.invalidateQueries({ queryKey: ["platform-settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const save = (f: Field) => {
    const raw = byKey[f.key]?.value;
    const kind = inferKind(f, raw);
    const str = values[f.key] ?? "";
    let v: any = str;
    if (kind === "bool") v = str === "true";
    else if (kind === "number") v = Number(str);
    else if (kind === "csv") v = str.split(",").map((p) => Number(p.trim())).filter((n) => !isNaN(n));
    mut.mutate({ key: f.key, value: v });
  };

  const renderField = (f: Field) => {
    const row = byKey[f.key];
    if (!row) {
      return (
        <Card key={f.key} className="flex items-center gap-4 p-4 opacity-60">
          <div className="flex-1">
            <p className="text-sm font-medium">{f.label}</p>
            <p className="text-xs text-muted-foreground">Not yet seeded — refresh page</p>
          </div>
        </Card>
      );
    }
    const kind = inferKind(f, row.value);
    const current = values[f.key] ?? "";
    const originalStr = Array.isArray(row.value)
      ? row.value.join(",")
      : typeof row.value === "string" ? row.value
      : JSON.stringify(row.value);
    const dirty = current !== originalStr;
    return (
      <Card key={f.key} className="flex items-center gap-4 p-4">
        <div className="flex-1">
          <p className="text-sm font-medium">{f.label}</p>
          <p className="text-xs text-muted-foreground">{row.description ?? f.key}</p>
        </div>
        {kind === "bool" ? (
          <select
            className="h-10 w-28 rounded-md border border-input bg-background px-3 text-sm"
            value={current || "false"}
            onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
          >
            <option value="true">ON</option>
            <option value="false">OFF</option>
          </select>
        ) : kind === "select" ? (
          <select
            className="h-10 w-40 rounded-md border border-input bg-background px-3 text-sm"
            value={current}
            onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
          >
            {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : kind === "csv" ? (
          <Input className="w-48" value={current} onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))} />
        ) : kind === "text" ? (
          <Input className="w-48" value={current} onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))} />
        ) : (
          <Input type="number" className="w-32" value={current} onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))} />
        )}
        <Button size="sm" disabled={!dirty || mut.isPending} onClick={() => save(f)}>Save</Button>
      </Card>
    );
  };

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Partner Operations Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Central control for assignment, earnings, route, attendance, capacity, marketplace, notifications and maps.
      </p>

      <Tabs defaultValue={SECTIONS[0].id} className="mt-6">
        <TabsList className="flex flex-wrap h-auto">
          {SECTIONS.map((s) => (
            <TabsTrigger key={s.id} value={s.id}>{s.title}</TabsTrigger>
          ))}
        </TabsList>
        {SECTIONS.map((s) => (
          <TabsContent key={s.id} value={s.id} className="mt-4">
            <p className="mb-3 text-sm text-muted-foreground">{s.description}</p>
            <div className="grid gap-3">{s.fields.map(renderField)}</div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
