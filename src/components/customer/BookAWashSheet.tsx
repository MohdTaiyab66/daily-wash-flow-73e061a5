import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Sparkles, Plus, Loader2, CheckCircle2, ShoppingBag, AlertTriangle, RotateCcw, Info, Calendar, MapPin, Clock, X, ChevronRight, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { toast } from "sonner";
import { traceVehicle } from "@/lib/vehicle-trace";
import { cn } from "@/lib/utils";
import { Surface } from "./ui/kit";

/**
 * Gated Book-a-Wash flow.
 *
 * Only the monthly *Included Wash* (interior + exterior) is bookable here.
 * Daily Exterior runs automatically every day while the subscription is
 * active — the customer must never book it manually, so it is not rendered.
 *
 * Every async path is defensive: nothing in this component may throw during
 * render or leave an unhandled rejection, because an uncaught error inside the
 * Android WebView tears down the whole app.
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

const log = (event: string, payload?: Record<string, unknown>) => {
  try {
    console.log(`[uw-booking] ${event}`, payload ?? {});
  } catch {
    /* logging must never break the flow */
  }
};

/**
 * Daily Shine skips Mondays. Pick tomorrow, or the next non-Monday if tomorrow is Monday.
 */
function formatDateHuman(iso: string) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);

  const formatter = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
  });
  const dateStr = formatter.format(d);

  if (diff === 0) return `Today · ${dateStr}`;
  if (diff === 1) return `Tomorrow · ${dateStr}`;
  return dateStr;
}

function nextServiceableDate(): string {
  try {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 1) d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function bumpOffMonday(iso: string): string {
  if (!iso) return iso;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  if (d.getDay() === 1) d.setDate(d.getDate() + 1);
  try {
    return d.toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

/** The only customer-bookable benefit. Daily Exterior is automatic. */
const INCLUDED = {
  benefitType: "interior",
  label: "Included Wash",
  hint: "Full interior + exterior — once a month",
  slug: "daily-shine-interior",
};

type Phase = "idle" | "booking" | "confirmed";

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
  const [date, setDate] = useState(() => nextServiceableDate());
  const [slot, setSlot] = useState(SLOT_OPTIONS[3]);
  const [addressId, setAddressId] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const entQ = useQuery({
    queryKey: ["vehicle-entitlements", vehicleId],
    enabled: !!vehicleId && open,
    retry: 1,
    queryFn: async (): Promise<EntitlementRow[]> => {
      const { data, error: e } = await (supabase as any).rpc("get_vehicle_entitlements", {
        p_vehicle_id: vehicleId,
      });
      if (e) throw e;
      return Array.isArray(data) ? (data as EntitlementRow[]) : [];
    },
  });

  const svcQ = useQuery({
    queryKey: ["book-wash-services"],
    enabled: open,
    retry: 1,
    queryFn: async (): Promise<ServiceRow[]> => {
      const { data, error: e } = await (supabase as any)
        .from("service_catalog")
        .select("id, slug, name, service_type")
        .eq("active", true)
        .eq("slug", INCLUDED.slug);
      if (e) throw e;
      return Array.isArray(data) ? (data as ServiceRow[]) : [];
    },
  });

  const addrQ = useQuery({
    queryKey: ["book-wash-addresses", userId],
    enabled: !!userId && open,
    retry: 1,
    queryFn: async (): Promise<AddrRow[]> => {
      const { data, error: e } = await (supabase as any)
        .from("customer_addresses")
        .select("id, label, area, is_default")
        .order("created_at");
      if (e) throw e;
      return Array.isArray(data) ? (data as AddrRow[]) : [];
    },
  });

  const subQ = useQuery({
    queryKey: ["book-wash-subscription", userId, vehicleId],
    enabled: !!userId && !!vehicleId && open,
    retry: 1,
    queryFn: async () => {
      const { data, error: e } = await (supabase as any)
        .from("subscriptions")
        .select("id, status, vehicle_id")
        .eq("user_id", userId)
        .eq("vehicle_id", vehicleId)
        .in("status", ["active", "assigned", "awaiting_partner_assignment"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e) throw e;
      return (data ?? null) as { id: string } | null;
    },
  });

  useEffect(() => {
    if (!open) return;
    const list = addrQ.data ?? [];
    if (!addressId && list.length > 0) {
      const chosen = list.find((a) => a?.is_default) ?? list[0];
      if (chosen?.id) setAddressId(chosen.id);
    }
  }, [open, addrQ.data, addressId]);

  // Reset transient state whenever the sheet is closed.
  useEffect(() => {
    if (!open) {
      setPhase("idle");
      setError(null);
    }
  }, [open]);

  const rows = entQ.data ?? [];
  const includedRow = useMemo(
    () => rows.find((r) => r?.benefit_type === INCLUDED.benefitType) ?? null,
    [rows]
  );

  const includedRemaining = includedRow?.unlimited
    ? Infinity
    : Number(includedRow?.remaining ?? 0);
  const canBookIncluded = !!includedRow && includedRemaining > 0;

  const loading = entQ.isLoading || subQ.isLoading;
  const noActivePlan = !loading && !subQ.data;
  const usedUpIncluded = !loading && !noActivePlan && !canBookIncluded;

  const today = (() => {
    try {
      return new Date().toISOString().slice(0, 10);
    } catch {
      return undefined;
    }
  })();

  const confirm = async () => {
    setError(null);

    const subscriptionId = subQ.data?.id;
    if (!subscriptionId) {
      setError("No active plan for this vehicle.");
      return;
    }
    if (!canBookIncluded) {
      setError("You've already used your included wash this month.");
      return;
    }
    if (!addressId) {
      setError("Add a service address first.");
      return;
    }
    if (!date) {
      setError("Pick a service date.");
      return;
    }
    const service = (svcQ.data ?? []).find((s) => s?.slug === INCLUDED.slug);
    if (!service?.id) {
      setError("Service unavailable right now. Please try again.");
      return;
    }

    setPhase("booking");
    log("Booking Started", { subscriptionId, vehicleId, date, slot, addressId });
    try {
      const { data: res, error: rpcError } = await (supabase as any).rpc("create_addon_request", {
        p_subscription_id: subscriptionId,
        p_service_id: service.id,
        p_preferred_date: date,
        p_preferred_time: slot,
        p_notes: `Booked from My Plan — ${INCLUDED.label}`,
        p_vehicle_id: vehicleId,
        p_address_id: addressId,
      });
      if (rpcError) throw rpcError;

      log("Booking Created", { addon_request_id: res?.addon_request_id ?? null, paid: res?.paid });
      log("Credit Deducted", { benefit: INCLUDED.benefitType });

      try {
        traceVehicle("create_addon", {
          addon_request_id: res?.addon_request_id ?? null,
          vehicle_id: vehicleId ?? undefined,
          details: {
            service_slug: service.slug,
            benefit_type: INCLUDED.benefitType,
            date,
            slot,
            paid: res?.paid,
            entitlement: res?.entitlement,
          },
        });
      } catch {
        /* tracing must never fail a confirmed booking */
      }

      setPhase("confirmed");
      toast.success(`${INCLUDED.label} scheduled for ${date} · ${slot}`);
      qc.invalidateQueries({ queryKey: ["vehicle-entitlements", vehicleId] });
      qc.invalidateQueries({ queryKey: ["customer-bookings-all"] });
      qc.invalidateQueries({ queryKey: ["customer-bookings"] });
      setTimeout(() => {
        try {
          onOpenChange(false);
        } catch {
          /* noop */
        }
      }, 700);
    } catch (err: any) {
      const message =
        typeof err?.message === "string" && err.message.trim()
          ? err.message
          : "Could not complete your booking. Please try again.";
      log("Booking Failed", { message });
      setPhase("idle");
      setError(message);
    }
  };

  const buttonLabel =
    phase === "booking" ? "Booking…" : phase === "confirmed" ? "Booking Confirmed" : "Book wash";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (phase !== "booking") onOpenChange(v); }}>
      <DialogContent className="max-w-md" aria-describedby="book-a-wash-desc">
        <DialogHeader>
          <DialogTitle>Book a wash</DialogTitle>
          <p id="book-a-wash-desc" className="text-xs text-muted-foreground">
            Your Daily Exterior wash runs automatically every day — no booking needed.
          </p>
        </DialogHeader>

        {loading && <div className="h-24 animate-pulse rounded-2xl bg-muted" />}

        {!loading && (entQ.isError || subQ.isError) && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-center">
            <AlertTriangle className="mx-auto h-5 w-5 text-destructive" />
            <p className="mt-2 text-sm font-semibold">Couldn't load your plan.</p>
            <Button
              variant="outline"
              className="mt-3 rounded-full"
              onClick={() => {
                entQ.refetch();
                subQ.refetch();
              }}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" /> Retry
            </Button>
          </div>
        )}

        {!loading && !entQ.isError && !subQ.isError && noActivePlan && (
          <div className="rounded-2xl border border-dashed border-border p-5 text-center">
            <p className="text-sm font-semibold">No active plan on this vehicle.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Subscribe to Daily Shine to start booking washes.
            </p>
            <Button asChild className="mt-4 rounded-full" onClick={() => onOpenChange(false)}>
              <Link to="/c/service/$slug" params={{ slug: "daily-shine" }}>
                See Daily Shine
              </Link>
            </Button>
          </div>
        )}

        {!loading && !entQ.isError && !subQ.isError && usedUpIncluded && (
          <div className="rounded-2xl border border-dashed border-border p-5 text-center">
            <p className="text-sm font-semibold">You've already used your included wash this month.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your Daily Exterior wash continues every day. Need another full wash?
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button asChild className="rounded-full" onClick={() => onOpenChange(false)}>
                <Link to="/c/service/$slug" params={{ slug: "daily-shine" }}>
                  <ShoppingBag className="mr-1.5 h-4 w-4" />
                  Buy more washes
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
                <Link to="/c/home">Browse one-time services</Link>
              </Button>
            </div>
          </div>
        )}

        {!loading && !entQ.isError && !subQ.isError && !noActivePlan && canBookIncluded && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Your wash</Label>
              <div className="mt-1.5 flex w-full items-center gap-3 rounded-2xl border border-primary bg-primary/5 p-3 text-left">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{INCLUDED.label}</div>
                  <div className="text-[11px] text-muted-foreground">{INCLUDED.hint}</div>
                </div>
                <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                  {includedRow?.unlimited ? "Unlimited" : `${includedRemaining} remaining`}
                </span>
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
                  onChange={(e) => setDate(bumpOffMonday(e.target.value))}
                  className="mt-1"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Mondays are our weekly rest day, so they're skipped.
                </p>
              </div>
              <div>
                <Label className="text-xs">Address</Label>
                <select
                  value={addressId}
                  onChange={(e) => setAddressId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                >
                  {(addrQ.data ?? []).length === 0 && <option value="">No saved address</option>}
                  {(addrQ.data ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label || "Address"} · {a.area}
                    </option>
                  ))}
                </select>
              </div>
            </div>

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

            {error && (
              <div
                data-testid="booking-error-banner"
                className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">{error}</p>
                  <button
                    type="button"
                    className="mt-1 inline-flex items-center gap-1 font-semibold underline"
                    onClick={() => void confirm()}
                  >
                    <RotateCcw className="h-3 w-3" /> Try again
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && !entQ.isError && !subQ.isError && !noActivePlan && canBookIncluded && (
          <DialogFooter>
            <Button variant="ghost" disabled={phase === "booking"} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              data-testid="book-wash-button"
              onClick={() => void confirm()}
              disabled={phase !== "idle" || !addressId || !date}
            >
              {phase === "booking" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {buttonLabel}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
