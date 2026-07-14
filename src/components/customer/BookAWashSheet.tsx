import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Sparkles, Droplets, Wrench, Plus, Loader2, CheckCircle2, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { traceVehicle } from "@/lib/vehicle-trace";

/**
 * Gated Book-a-Wash flow (Phase 3).
 *
 * The customer never sees exhausted benefits — they simply do not render.
 * If nothing is left, only "Buy More Washes" is shown.
 *
 * Benefits are mapped to Daily Shine service slugs so the existing
 * `create_addon_request` RPC can materialise the booking. Wallet and
 * credit accounting is invisible; the app enforces silently.
 */

type EntitlementRow = {
  benefit_type: string;
  total_allocated: number | null;
  consumed: number;
  remaining: number | null;
  unlimited: boolean;
  subscription_id: string;
  cycle_end: string;
};

type ServiceRow = {
  id: string;
  slug: string;
  name: string;
  service_type: string;
};

type AddrRow = {
  id: string;
  label: string;
  area: string;
  is_default: boolean | null;
};

const SLOT_OPTIONS = [
  "Before 7 AM",
  "Before 8 AM",
  "Before 9 AM",
  "Before 10 AM",
  "Before 11 AM",
  "Before 12 PM",
];

type BookableKey = "interior" | "exterior_daily" | "extra_exterior" | "extra_interior";

const BOOKABLE_ORDER: BookableKey[] = [
  "interior",
  "exterior_daily",
  "extra_exterior",
  "extra_interior",
];

const CONFIG: Record<
  BookableKey,
  {
    label: string;
    hint: string;
    slug: string;
    icon: typeof Sparkles;
  }
> = {
  interior: {
    label: "Included Wash",
    hint: "Full interior + exterior — once a month",
    slug: "daily-shine-interior",
    icon: Sparkles,
  },
  exterior_daily: {
    label: "Daily Exterior",
    hint: "Quick outside rinse — daily",
    slug: "daily-shine-exterior",
    icon: Droplets,
  },
  extra_exterior: {
    label: "Extra Exterior Wash",
    hint: "From your monthly add-on",
    slug: "daily-shine-exterior",
    icon: Plus,
  },
  extra_interior: {
    label: "Extra Interior Wash",
    hint: "From your monthly add-on",
    slug: "daily-shine-interior",
    icon: Wrench,
  },
};

export function BookAWashSheet({
  open,
  onOpenChange,
  vehicleId,
  userId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vehicleId: string | null;
  userId: string | null;
}) {
  const qc = useQueryClient();
  const [pickedKey, setPickedKey] = useState<BookableKey | null>(null);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [slot, setSlot] = useState(SLOT_OPTIONS[3]);
  const [addressId, setAddressId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const entQ = useQuery({
    queryKey: ["vehicle-entitlements", vehicleId],
    enabled: !!vehicleId && open,
    queryFn: async (): Promise<EntitlementRow[]> => {
      const { data, error } = await (supabase as any).rpc("get_vehicle_entitlements", {
        p_vehicle_id: vehicleId,
      });
      if (error) throw error;
      return (data ?? []) as EntitlementRow[];
    },
  });

  const svcQ = useQuery({
    queryKey: ["book-wash-services"],
    enabled: open,
    queryFn: async (): Promise<ServiceRow[]> => {
      const { data } = await (supabase as any)
        .from("service_catalog")
        .select("id, slug, name, service_type")
        .eq("active", true)
        .in("slug", [
          "daily-shine-interior",
          "daily-shine-exterior",
        ]);
      return (data ?? []) as ServiceRow[];
    },
  });

  const addrQ = useQuery({
    queryKey: ["book-wash-addresses", userId],
    enabled: !!userId && open,
    queryFn: async (): Promise<AddrRow[]> => {
      const { data } = await (supabase as any)
        .from("customer_addresses")
        .select("id, label, area, is_default")
        .order("created_at");
      return (data ?? []) as AddrRow[];
    },
  });

  const subQ = useQuery({
    queryKey: ["book-wash-subscription", userId, vehicleId],
    enabled: !!userId && !!vehicleId && open,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("subscriptions")
        .select("id, status, vehicle_id")
        .eq("user_id", userId)
        .eq("vehicle_id", vehicleId)
        .in("status", ["active", "assigned", "awaiting_partner_assignment"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { id: string } | null;
    },
  });

  useEffect(() => {
    if (!open) return;
    if (!addressId && addrQ.data?.length) {
      setAddressId((addrQ.data.find((a) => a.is_default) ?? addrQ.data[0]).id);
    }
  }, [open, addrQ.data, addressId]);

  // Reset selection whenever the sheet is closed.
  useEffect(() => {
    if (!open) {
      setPickedKey(null);
      setSaving(false);
    }
  }, [open]);

  const rows = entQ.data ?? [];
  const byType = useMemo(() => new Map(rows.map((r) => [r.benefit_type, r])), [rows]);

  const available = useMemo(
    () =>
      BOOKABLE_ORDER
        .map((key) => ({ key, row: byType.get(key) }))
        .filter((x): x is { key: BookableKey; row: EntitlementRow } => {
          if (!x.row) return false;
          if (x.row.unlimited) return true;
          return (x.row.remaining ?? 0) > 0;
        }),
    [byType]
  );

  const nothingLeft = !entQ.isLoading && available.length === 0;

  const picked = pickedKey ? CONFIG[pickedKey] : null;
  const isMonday = new Date(date).getDay() === 1;
  const today = new Date().toISOString().slice(0, 10);

  const confirm = async () => {
    if (!pickedKey || !picked) {
      toast.error("Pick a service");
      return;
    }
    if (!subQ.data) {
      toast.error("No active plan for this vehicle.");
      return;
    }
    if (!addressId) {
      toast.error("Add a service address first.");
      return;
    }
    if (isMonday) {
      toast.error("Daily Shine does not run on Mondays. Pick another date.");
      return;
    }
    const service = (svcQ.data ?? []).find((s) => s.slug === picked.slug);
    if (!service) {
      toast.error("Service unavailable — please try again in a moment.");
      return;
    }

    setSaving(true);
    try {
      const { data: res, error } = await (supabase as any).rpc("create_addon_request", {
        p_subscription_id: subQ.data.id,
        p_service_id: service.id,
        p_preferred_date: date,
        p_preferred_time: slot,
        p_notes: `Booked from My Plan — ${picked.label}`,
        p_vehicle_id: vehicleId,
        p_address_id: addressId,
      });
      if (error) throw error;
      traceVehicle("create_addon", {
        addon_request_id: res?.addon_request_id ?? null,
        vehicle_id: vehicleId ?? undefined,
        details: {
          service_slug: service.slug,
          benefit_type: pickedKey,
          date,
          slot,
          paid: res?.paid,
          entitlement: res?.entitlement,
        },
      });
      toast.success(`₹0 — ${picked.label} scheduled for ${date} · ${slot}`);
      qc.invalidateQueries({ queryKey: ["vehicle-entitlements", vehicleId] });
      qc.invalidateQueries({ queryKey: ["customer-bookings-all"] });
      qc.invalidateQueries({ queryKey: ["customer-bookings"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not book.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" aria-describedby="book-a-wash-desc">
        <DialogHeader>
          <DialogTitle>Book a wash</DialogTitle>
          <p id="book-a-wash-desc" className="text-xs text-muted-foreground">
            Only services with remaining credit are shown.
          </p>
        </DialogHeader>

        {entQ.isLoading && (
          <div className="h-24 animate-pulse rounded-2xl bg-muted" />
        )}

        {!entQ.isLoading && nothingLeft && (
          <div className="rounded-2xl border border-dashed border-border p-5 text-center">
            <p className="text-sm font-semibold">You've used all your washes this month.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add more washes or book a one-time premium service.
            </p>
            <Button asChild className="mt-4 rounded-full">
              <Link to="/c/service/$slug" params={{ slug: "daily-shine" }}>
                <ShoppingBag className="mr-1.5 h-4 w-4" />
                Buy More Washes
              </Link>
            </Button>
          </div>
        )}

        {!entQ.isLoading && available.length > 0 && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Choose service</Label>
              <div className="mt-1.5 space-y-2">
                {available.map(({ key, row }) => {
                  const cfg = CONFIG[key];
                  const Icon = cfg.icon;
                  const selected = pickedKey === key;
                  const remainingLabel = row.unlimited
                    ? "Unlimited"
                    : `${row.remaining} remaining`;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPickedKey(key)}
                      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <span
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                          selected ? "bg-primary text-primary-foreground" : "bg-accent text-primary"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{cfg.label}</div>
                        <div className="text-[11px] text-muted-foreground">{cfg.hint}</div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          selected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {remainingLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 text-right">
                <Link
                  to="/c/service/$slug"
                  params={{ slug: "daily-shine" }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary"
                >
                  <Plus className="h-3 w-3" /> Buy more washes
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Date</Label>
                <Input
                  type="date"
                  min={today}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Address</Label>
                <select
                  value={addressId}
                  onChange={(e) => setAddressId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                >
                  {(addrQ.data ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label || "Address"} · {a.area}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isMonday && (
              <p className="text-[11px] text-destructive">
                Mondays are off-days for Daily Shine. Pick another date.
              </p>
            )}

            <div>
              <Label className="text-xs">Time slot</Label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {SLOT_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSlot(s)}
                    className={`rounded-xl border py-2 text-[11px] font-medium transition-colors ${
                      slot === s
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-success/10 px-3 py-2 text-xs text-success">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Included in your Daily Shine plan
              </span>
              <span className="font-semibold">₹0 Payable</span>
            </div>
          </div>
        )}

        {!nothingLeft && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirm}
              disabled={saving || !pickedKey || isMonday || !addressId}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Book wash
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
