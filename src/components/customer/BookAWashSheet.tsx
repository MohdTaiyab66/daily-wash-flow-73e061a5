import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Sparkles, Plus, Loader2, CheckCircle2, ShoppingBag, AlertTriangle, RotateCcw, Info, Calendar, MapPin, Clock, X, ChevronRight, Check, Droplets } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
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
  label: "Premium Wash",
  hint: "Full interior + exterior — included in plan",
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

  console.log("BookAWashSheet render", { open, phase, error });

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);

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

  const selectedAddress = useMemo(() => addrQ.data?.find(a => a.id === addressId), [addrQ.data, addressId]);
  const isMonday = useMemo(() => {
    if (!date) return false;
    const d = new Date(`${date}T00:00:00`);
    return d.getDay() === 1;
  }, [date]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (phase !== "booking") onOpenChange(v); }}>
      <DialogContent className="max-h-[92vh] max-w-md overflow-hidden bg-[#FFF9F3] p-0 border-none shadow-2xl sm:rounded-[32px]" aria-describedby="book-a-wash-desc">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/5 bg-white px-6 py-5">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-[#1a1a1a]">Schedule a wash</h2>
            <div className="mt-1 flex items-center gap-2">
               <div className="h-1.5 w-1.5 rounded-full bg-primary" />
               <p className="text-[12px] font-bold uppercase tracking-widest text-muted-foreground/60">Included premium wash</p>
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#FFF9F3] shadow-sm border border-black/5 transition-transform active:scale-90"
          >
            <X className="h-5 w-5 text-[#1a1a1a]" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(92vh-88px)] space-y-8 px-6 py-6 pb-24">
          {/* Info context */}
          <div className="flex items-start gap-3 rounded-3xl bg-primary/5 p-4 border border-primary/10">
            <Info className="mt-0.5 h-4 w-4 text-primary shrink-0" />
            <p className="text-[12px] font-medium leading-relaxed text-[#1a1a1a]/70">
              <span className="font-bold text-primary">Daily cleaning</span> happens automatically every morning. Use this to schedule your monthly full interior + exterior wash.
            </p>
          </div>

          {loading && (
            <div className="space-y-4">
              <div className="h-40 animate-pulse rounded-[32px] bg-white border border-black/5 shadow-sm" />
              <div className="h-20 animate-pulse rounded-[24px] bg-white border border-black/5 shadow-sm" />
            </div>
          )}

          {!loading && (entQ.isError || subQ.isError) && (
            <div className="rounded-[32px] border border-black/5 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-[20px] bg-destructive/5 mb-6">
                 <AlertTriangle className="h-7 w-7 text-destructive" />
              </div>
              <p className="text-[16px] font-black text-[#1a1a1a]">Couldn't load your plan</p>
              <Button
                variant="outline"
                className="mt-6 h-12 rounded-2xl border-black/5 font-bold"
                onClick={() => {
                  entQ.refetch();
                  subQ.refetch();
                }}
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Retry
              </Button>
            </div>
          )}

          {!loading && !entQ.isError && !subQ.isError && noActivePlan && (
            <div className="rounded-[32px] border border-black/5 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-[20px] bg-primary/5 mb-6">
                 <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <p className="text-[16px] font-black text-[#1a1a1a]">No active plan</p>
              <p className="mt-2 text-[13px] font-medium text-muted-foreground/60">
                Subscribe to Daily Shine to start booking premium washes.
              </p>
              <Button asChild className="mt-8 h-14 w-full rounded-2xl font-black shadow-lg shadow-primary/20" onClick={() => onOpenChange(false)}>
                <Link to="/c/service/$slug" params={{ slug: "daily-shine" }} search={{ vehicleId: vehicleId ?? undefined }}>
                  See Daily Shine
                </Link>
              </Button>
            </div>
          )}

          {!loading && !entQ.isError && !subQ.isError && usedUpIncluded && (
            <div className="space-y-6">
              <div className="rounded-[32px] border border-black/5 bg-white p-8 text-center shadow-sm">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-[20px] bg-destructive/5 mb-6">
                   <AlertTriangle className="h-7 w-7 text-destructive" />
                </div>
                <p className="text-[16px] font-black text-[#1a1a1a]">No washes left</p>
                <p className="mt-2 text-[13px] font-medium text-muted-foreground/60 leading-relaxed">
                  You've already enjoyed your included wash for this cycle. Daily exterior cleaning continues as usual.
                </p>
              </div>
              <div className="space-y-3">
                <Button asChild className="h-14 w-full rounded-2xl font-black shadow-lg shadow-primary/20" onClick={() => onOpenChange(false)}>
                  <Link to="/c/service/$slug" params={{ slug: "daily-shine" }} search={{ vehicleId: vehicleId ?? undefined }}>
                    <ShoppingBag className="mr-2 h-5 w-5" />
                    Buy more washes
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {!loading && !entQ.isError && !subQ.isError && !noActivePlan && canBookIncluded && (
            <div className="space-y-8">
              {/* Wash Card */}
              <div>
                <div className="relative overflow-hidden rounded-[32px] bg-white border border-black/5 p-6 shadow-sm">
                  <div className="absolute top-0 right-0 h-24 w-24 -translate-y-8 translate-x-8 rounded-full bg-primary/5 blur-3xl" />
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 font-black text-primary">
                        <Sparkles className="h-5 w-5" />
                        <span className="text-[16px]">Included Wash</span>
                      </div>
                      <p className="mt-1 text-[13px] font-medium text-muted-foreground/60">Full Interior + Exterior</p>
                    </div>
                    <div className="rounded-full bg-success/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-success">
                      Free ✓
                    </div>
                  </div>
                  <div className="mt-6 flex items-baseline justify-between">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black tracking-tight text-[#1a1a1a]">
                        {includedRow?.unlimited ? "∞" : includedRemaining}
                      </span>
                      <span className="text-[13px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                        wash{includedRemaining !== 1 ? "es" : ""} left
                      </span>
                    </div>
                    <div className="flex -space-x-2">
                      {[1,2,3].map(i => (
                        <div key={i} className="h-8 w-8 rounded-full border-2 border-white bg-primary/10 flex items-center justify-center text-primary">
                          <Droplets className="h-4 w-4" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 px-1">
                  <button 
                    onClick={() => onOpenChange(false)}
                    className="text-[12px] font-black text-primary/60 hover:text-primary transition-colors block text-center"
                  >
                    Buy more washes
                  </button>
                    to="/c/service/$slug"
                    params={{ slug: "daily-shine" }}
                    search={{ vehicleId: vehicleId ?? undefined }}
                    className="flex items-center gap-1.5 text-[13px] font-black text-primary hover:opacity-80 transition-opacity"
                  >
                    Need another wash? <span className="underline underline-offset-4">Buy more</span>
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              {/* Selection Summary */}
              <div className="grid grid-cols-2 gap-4">
                {/* When */}
                <div className="space-y-2">
                  <Label className="ml-1 text-[11px] font-black uppercase tracking-widest text-muted-foreground/50">When</Label>
                  <button
                    onClick={() => setDatePickerOpen(true)}
                    className="flex w-full flex-col items-start gap-1 rounded-2xl border border-black/5 bg-white p-4 text-left shadow-sm transition-transform active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-2 text-[14px] font-black text-[#1a1a1a]">
                      <Calendar className="h-4 w-4 text-primary" />
                      {formatDateHuman(date) || "Select date"}
                    </div>
                    {isMonday && (
                      <div className="text-[10px] font-bold text-destructive uppercase tracking-tighter">Monday rest day</div>
                    )}
                  </button>
                </div>

                {/* Where */}
                <div className="space-y-2">
                  <Label className="ml-1 text-[11px] font-black uppercase tracking-widest text-muted-foreground/50">Where</Label>
                  <button
                    onClick={() => setAddressPickerOpen(true)}
                    className="flex w-full flex-col items-start gap-1 rounded-2xl border border-black/5 bg-white p-4 text-left shadow-sm transition-transform active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-2 text-[14px] font-black text-[#1a1a1a] w-full">
                      <MapPin className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate">{selectedAddress?.label || "Select area"}</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Time Slots */}
              <div className="space-y-4">
                <div>
                  <Label className="ml-1 text-[11px] font-black uppercase tracking-widest text-muted-foreground/50">Preferred time</Label>
                  <p className="mt-1 ml-1 text-[12px] font-medium text-muted-foreground/60">Choose your arrival window</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {SLOT_OPTIONS.map((s) => {
                    const isSelected = slot === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSlot(s)}
                        className={cn(
                          "relative flex h-14 items-center justify-center rounded-2xl border text-[14px] font-black transition-all active:scale-[0.98]",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                            : "border-black/5 bg-white text-[#1a1a1a] shadow-sm hover:bg-black/5"
                        )}
                      >
                        {s}
                        {isSelected && (
                          <div className="absolute top-2 right-2">
                            <Check className="h-3.5 w-3.5" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 rounded-2xl bg-black/5 px-4 py-3 text-[11px] font-bold text-muted-foreground/60">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Our partner may arrive anytime within this window.</span>
                </div>
              </div>

              {/* Success Indicator */}
              <div className="flex items-center justify-between rounded-2xl bg-success/10 px-5 py-4 text-[13px] border border-success/10">
                <div className="flex items-center gap-2.5 text-success">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-black uppercase tracking-wider">Plan Benefit</span>
                </div>
                <span className="font-black text-success">✓ Included</span>
              </div>

              {/* Premium Add-ons Suggestion */}
              <div className="space-y-4 pb-4">
                <div className="flex items-center justify-between px-1">
                  <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/50">Make it even better</Label>
                  <span className="text-[10px] font-bold text-primary uppercase tracking-tight">Premium upgrades</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button className="flex flex-col items-start gap-2 rounded-2xl border border-black/5 bg-white p-4 text-left shadow-sm active:scale-[0.98] transition-all">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-orange-50 text-orange-500">
                      <Droplets className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-[13px] font-black text-[#1a1a1a]">Body Polish</div>
                      <div className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-tighter">from ₹199</div>
                    </div>
                  </button>
                  <button className="flex flex-col items-start gap-2 rounded-2xl border border-black/5 bg-white p-4 text-left shadow-sm active:scale-[0.98] transition-all">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-500">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-[13px] font-black text-[#1a1a1a]">Deep Clean</div>
                      <div className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-tighter">from ₹499</div>
                    </div>
                  </button>
                </div>
                <p className="px-1 text-[11px] font-medium leading-relaxed text-muted-foreground/40 italic">
                  *Upgrades require separate booking and payment.
                </p>
              </div>

              {/* Error Banner */}
              {error && (
                <div className="flex items-start gap-3 rounded-2xl bg-destructive/5 p-4 text-[13px] text-destructive border border-destructive/10">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-black">{error}</p>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-black underline underline-offset-4"
                      onClick={() => void confirm()}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Try again
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>


        {/* Sticky CTA Bar */}
        {!loading && !entQ.isError && !subQ.isError && !noActivePlan && canBookIncluded && (
          <div className="absolute bottom-0 left-0 right-0 border-t border-black/5 bg-white p-6 pb-8 shadow-[0_-8px_32px_rgba(0,0,0,0.05)]">
            <Button
              data-testid="book-wash-button"
              onClick={() => void confirm()}
              disabled={phase !== "idle" || !addressId || !date || isMonday}
              className="h-15 w-full rounded-2xl text-lg font-black shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
            >
              {phase === "booking" ? (
                <div className="flex items-center gap-3">
                   <Loader2 className="h-5 w-5 animate-spin" />
                   <span>Scheduling...</span>
                </div>
              ) : (
                "Schedule a wash"
              )}
            </Button>
            <p className="mt-4 text-center text-[12px] font-bold text-muted-foreground/40 uppercase tracking-widest">
              Included with your plan · ₹0
            </p>
          </div>
        )}
      </DialogContent>

      {/* Date Picker Drawer */}
      <Drawer open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <DrawerContent className="px-6 pb-8">
            <DrawerHeader className="px-0">
              <DrawerTitle>Choose date</DrawerTitle>
            </DrawerHeader>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[...Array(14)].map((_, i) => {
                const d = new Date();
                d.setDate(d.getDate() + i + 1);
                const iso = d.toISOString().slice(0, 10);
                const day = d.getDate();
                const month = d.toLocaleDateString("en-IN", { month: "short" });
                const dayName = d.toLocaleDateString("en-IN", { weekday: "short" });
                const isMon = d.getDay() === 1;
                const isSelected = date === iso;

                return (
                  <button
                    key={iso}
                    disabled={isMon}
                    onClick={() => {
                      setDate(iso);
                      setDatePickerOpen(false);
                    }}
                    className={cn(
                      "uw-pressable flex flex-col items-center justify-center rounded-2xl border py-3 transition-all",
                      isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
                      isMon && "opacity-30"
                    )}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider">{dayName}</span>
                    <span className="my-0.5 text-lg font-black">{day}</span>
                    <span className="text-[10px] font-medium opacity-70">{month}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex items-center gap-2 rounded-xl bg-muted/40 p-3 text-[12px] text-muted-foreground">
              <Info className="h-4 w-4 shrink-0" />
              <span>Mondays are our weekly rest day. No services are scheduled on Mondays.</span>
            </div>
          </DrawerContent>
        </Drawer>

        {/* Address Picker Drawer */}
        <Drawer open={addressPickerOpen} onOpenChange={setAddressPickerOpen}>
          <DrawerContent className="px-6 pb-8">
            <DrawerHeader className="px-0">
              <DrawerTitle>Choose service location</DrawerTitle>
            </DrawerHeader>
            <div className="mt-2 space-y-3">
              {(addrQ.data ?? []).map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    setAddressId(a.id);
                    setAddressPickerOpen(false);
                  }}
                  className={cn(
                    "uw-pressable flex w-full items-center justify-between rounded-2xl border p-4 text-left transition-all",
                    addressId === a.id ? "border-primary bg-primary/5" : "border-border bg-card"
                  )}
                >
                  <div>
                    <div className="font-bold">{a.label || "Address"}</div>
                    <div className="text-[13px] text-muted-foreground">{a.area}</div>
                  </div>
                  {addressId === a.id && (
                    <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                </button>
              ))}
              <Button asChild variant="outline" className="w-full rounded-2xl py-6" onClick={() => setAddressPickerOpen(false)}>
                <Link to="/c/profile">
                  <Plus className="mr-2 h-4 w-4" /> Add new address
                </Link>
              </Button>
            </div>
          </DrawerContent>
        </Drawer>
    </Dialog>
  );
}
