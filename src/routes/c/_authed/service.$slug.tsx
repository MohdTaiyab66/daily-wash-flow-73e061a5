import { z } from "zod";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Calendar, Car, ChevronRight, Loader2, MapPin, Plus, RefreshCw, Sparkles, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  createRazorpayOrder,
  verifyRazorpayPayment,
  logPaymentAttempt,
  getBookingPaymentStatus,
  acquireCheckoutHold,
  releaseCheckoutHold,
} from "@/lib/payment.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { validateExactGps, GPS_INVALID_MESSAGE } from "@/lib/gps";
import { traceVehicle } from "@/lib/vehicle-trace";
import { INCLUDED_PLAN_MESSAGE, exhaustedEntitlementMessage, normalizeBookingPreview } from "@/lib/entitlements";
import {
  clearPendingCheckout,
  readPendingCheckout,
  savePendingCheckout,
  type CheckoutEvent,
} from "@/lib/pending-checkout-store";
import { PaymentTimeline } from "@/components/customer/PaymentTimeline";
import { openRazorpayCheckout } from "@/lib/paymentBridge";
import { PageTitle, SectionTitle, Muted, Section, Surface, ListGroup, ListRow, StatusChip, Meter } from "@/components/customer/ui/kit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/c/_authed/service/$slug")({
  ssr: false,
  validateSearch: z.object({ vehicleId: z.string().optional().catch(undefined) }),
  head: () => ({ meta: [{ title: "Book service — Urban Wash" }] }),
  component: ServiceDetail,
});

type Service = {
  id: string; slug: string; name: string; description: string; banner_url: string | null;
  price_hatchback: number; price_sedan_suv: number; service_type: string; benefits: string[] | null;
  duration_minutes: number | null;
};
type Vehicle = {
  id: string;
  make: string;
  model: string;
  category: string;
  registration_number: string;
  is_default?: boolean | null;
  discount_approved?: boolean | null;
  created_at?: string | null;
};
type Address = { id: string; label: string; address_line: string; area: string; pincode: string | null; latitude?: number | null; longitude?: number | null };
type Addon = { id: string; name: string; description: string | null; price_hatchback: number; price_sedan_suv: number; applies_to_slugs: string[] };

const TIME_SLOTS = ["Before 7 AM", "Before 8 AM", "Before 9 AM", "Before 10 AM", "Before 11 AM", "Before 12 PM"];

function toIsoDate(d: Date) { return d.toISOString().slice(0, 10); }
function isMondayIso(iso: string) { return new Date(`${iso}T12:00:00`).getDay() === 1; }
function nextBookableDateIso(start = new Date()) {
  const d = new Date(start); d.setDate(d.getDate() + 1);
  while (d.getDay() === 1) d.setDate(d.getDate() + 1);
  return toIsoDate(d);
}

function ServiceDetail() {
  const { slug } = useParams({ from: "/c/_authed/service/$slug" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createOrder = useServerFn(createRazorpayOrder);
  const verifyPayment = useServerFn(verifyRazorpayPayment);
  const logAttemptFn = useServerFn(logPaymentAttempt);
  const getStatusFn = useServerFn(getBookingPaymentStatus);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(() => nextBookableDateIso());
  const [slot, setSlot] = useState<string>(TIME_SLOTS[3]);
  const [notes, setNotes] = useState("");
  const [addrOpen, setAddrOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; percent: number } | null>(null);
  const [paying, setPaying] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [resumable, setResumable] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<CheckoutEvent[]>([]);
  const [holdBlocked, setHoldBlocked] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [recoveryNonce, setRecoveryNonce] = useState(0);

  const vehiclesQ = useQuery({ queryKey: ["customer-vehicles"], queryFn: async () => (await (supabase as any).from("vehicles").select("*").order("created_at")).data as Vehicle[] });
  const serviceQ = useQuery({ queryKey: ["service", slug], queryFn: async () => (await (supabase as any).from("services").select("*").eq("slug", slug).maybeSingle()).data as Service });
  const addressesQ = useQuery({ queryKey: ["customer-addresses"], queryFn: async () => (await (supabase as any).from("customer_addresses").select("*").order("created_at")).data as Address[] });
  const addonsQ = useQuery({ queryKey: ["service-addons", slug], queryFn: async () => { const { data } = await (supabase as any).from("service_addons").select("*").eq("active", true).order("sort_order"); return ((data ?? []) as Addon[]).filter((a) => !a.applies_to_slugs?.length || a.applies_to_slugs.includes(slug)); } });
  const vehicleSubQ = useQuery({ queryKey: ["vehicle-open-subscription", vehicleId], enabled: !!vehicleId, queryFn: async () => { const { data } = await (supabase as any).from("subscriptions").select("id,status").eq("vehicle_id", vehicleId).in("status", ["active", "awaiting_partner_assignment", "assigned"]).limit(1).maybeSingle(); return data; } });

  const service = serviceQ.data;
  const vehicle = vehiclesQ.data?.find((v) => v.id === vehicleId);
  const isSUV = vehicle?.category === "sedan_suv";
  const isDailyShine = service?.service_type === "subscription" || service?.slug?.startsWith("daily-shine");
  const vehicleCount = vehiclesQ.data?.length ?? 1;
  const firstVehicleId = vehiclesQ.data?.[0]?.id ?? null;
  const isFirstVehicle = !!vehicleId && vehicleId === firstVehicleId;

  const uniqueAddresses = useMemo(() => {
    const seen = new Set<string>();
    return (addressesQ.data ?? []).filter((addr) => {
      const key = `${addr.address_line.trim().toLowerCase()}|${addr.area.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [addressesQ.data]);

  const selectedAddons = useMemo(() => Object.entries(addonQty).filter(([, q]) => q > 0).map(([id, q]) => ({ id, quantity: q })), [addonQty]);

  const previewQ = useQuery({
    queryKey: ["booking-preview", service?.id, vehicleId, addressId, date, slot, appliedCoupon?.code ?? null, selectedAddons],
    enabled: !!service?.id && !!vehicleId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("preview_customer_booking", {
        p_service_id: service!.id, p_vehicle_id: vehicleId, p_address_id: addressId,
        p_scheduled_date: date, p_scheduled_time: slot, p_addons: selectedAddons, p_coupon_code: appliedCoupon?.code ?? null,
      });
      if (error) throw error;
      return normalizeBookingPreview(data);
    },
  });

  const preview = previewQ.data ?? null;
  const previewReady = !!preview && !previewQ.isError;
  const previewPayable = previewReady ? Number(preview.payable ?? 0) : 0;
  const previewBase = Number(preview?.base_amount ?? previewPayable);
  const previewAddon = Number(preview?.addon_amount ?? 0);
  const previewDiscount = Number(preview?.discount_amount ?? 0);
  const isIncludedBooking = !!preview?.used_entitlement;
  const addonItemsCount = Object.values(addonQty).reduce((a, b) => a + b, 0);

  const eligibleCoupon = useMemo(() => {
    if (vehicleCount < 2 || (isFirstVehicle && !vehicle?.discount_approved)) return null;
    if (vehicleCount >= 4) return { code: "MULTI20", percent: 20 };
    if (vehicleCount === 3) return { code: "EXTRA15", percent: 15 };
    return { code: "EXTRA10", percent: 10 };
  }, [vehicleCount, isFirstVehicle, vehicle?.discount_approved]);

  const applyBestCoupon = () => { if (eligibleCoupon) setAppliedCoupon(eligibleCoupon); };
  const removeCoupon = () => setAppliedCoupon(null);
  const setQty = (id: string, q: number) => setAddonQty((prev) => ({ ...prev, [id]: Math.min(q, 20) }));

  if (serviceQ.isLoading) return <div className="px-5 pt-10"><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div>;
  if (!service) return <div className="px-5 pt-10 text-center"><p className="text-muted-foreground">Not found</p></div>;

  return (
    <div className="min-h-screen bg-[#FFF9F3] pb-[120px]">
      <header className="sticky top-0 z-20 flex items-center gap-4 bg-[#FFF9F3]/95 px-5 py-4 backdrop-blur">
        <button onClick={() => navigate({ to: "/c/home" })} className="grid h-9 w-9 place-items-center rounded-full bg-card shadow-sm"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0"><h1 className="text-[17px] font-bold text-foreground">{service.name}</h1><p className="text-[13px] text-muted-foreground">Your car, clean every day</p></div>
      </header>

      <div className="px-5 pb-6">
        <Surface className="relative overflow-hidden border-primary/10">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <h2 className="text-[20px] font-bold text-foreground">{service.name}</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">{service.description}</p>
              <div className="mt-3 flex items-baseline gap-2"><span className="text-[24px] font-bold text-primary">₹{isSUV ? service.price_sedan_suv : service.price_hatchback}</span><span className="text-[13px] text-muted-foreground">/ month</span></div>
            </div>
            <StatusChip tone="brand">BEST VALUE</StatusChip>
          </div>
        </Surface>

        <Section title="What's included">
          <Surface className="py-3">
             <ul className="space-y-2">{service.benefits?.slice(0, 3).map((b, i) => <li key={i} className="flex items-center gap-2 text-[14px] text-foreground"><Check className="h-4 w-4 text-success" /> {b}</li>)}</ul>
             <button className="mt-3 text-[13px] font-semibold text-primary">View all benefits ›</button>
          </Surface>
        </Section>

        <Section title="Your vehicle">
          <Surface className="flex items-center justify-between p-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-accent" />
              <div><div className="text-[14px] font-semibold">{vehicle?.make} {vehicle?.model}</div><div className="text-[12px] text-muted-foreground">{vehicle?.registration_number}</div></div>
            </div>
            <button className="text-[13px] font-semibold text-primary">Change ›</button>
          </Surface>
        </Section>

        <Section title="Service address">
          <div className="space-y-2">
            {uniqueAddresses.map((a) => (
              <button key={a.id} onClick={() => setAddressId(a.id)} className={cn("flex w-full items-start gap-3 rounded-2xl border bg-card p-3 text-left", addressId === a.id ? "border-primary" : "border-border")}>
                <div className={cn("mt-1 h-4 w-4 rounded-full border-2", addressId === a.id ? "border-primary" : "border-border")} />
                <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold">{a.label}</div><div className="text-[12px] text-muted-foreground">{a.address_line}, {a.area}</div></div>
              </button>
            ))}
            <button onClick={() => setAddrOpen(true)} className="flex w-full items-center gap-2 py-2 text-[14px] font-medium text-primary"><Plus className="h-4 w-4" /> Add a new service address</button>
          </div>
        </Section>

        <Section title="Your first service">
          <div className="mb-3 text-[14px] font-medium">Tomorrow · {date}</div>
          <div className="grid grid-cols-3 gap-2">{TIME_SLOTS.map((s) => <button key={s} onClick={() => setSlot(s)} className={cn("rounded-full border py-2 text-[12px] font-medium", slot === s ? "border-primary bg-primary/10 text-primary" : "border-border bg-card")}>{s}</button>)}</div>
        </Section>

        <Section title="Make it even better" action={<button className="text-[13px] font-semibold text-primary">View all ›</button>}>
           {addonsQ.data?.slice(0, 3).map((a) => {
             const p = isSUV ? a.price_sedan_suv : a.price_hatchback;
             return (<div key={a.id} className="mb-2 flex items-center justify-between rounded-2xl border border-border bg-card p-3"><div><div className="text-[14px] font-semibold">{a.name}</div><div className="text-[12px] text-muted-foreground">₹{p}</div></div><Button size="sm" variant="outline" className="rounded-full">+ Add</Button></div>)
           })}
        </Section>

        <Section title="Price summary">
           <Surface className="space-y-2 text-[14px]"><div className="flex justify-between text-muted-foreground"><span>Daily Shine</span><span>₹{previewBase}</span></div><div className="flex justify-between text-muted-foreground"><span>Add-ons</span><span>₹{previewAddon}</span></div><div className="flex justify-between text-success"><span>Discount</span><span>-₹{previewDiscount}</span></div><div className="flex justify-between pt-2 text-[16px] font-bold border-t"><span>Total</span><span>₹{previewPayable}</span></div></Surface>
        </Section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-5 py-4 backdrop-blur">
        <Button size="lg" className="h-14 w-full rounded-2xl text-[16px] font-bold" onClick={() => {}}>
           <div className="flex flex-col items-start gap-0.5"><span>Pay ₹{previewPayable}</span><span className="text-[10px] font-normal opacity-80">Secure payment via Razorpay</span></div>
           <ChevronRight className="ml-auto h-5 w-5" />
        </Button>
      </div>
      <AddressDialog open={addrOpen} onOpenChange={setAddrOpen} onCreated={(id) => { setAddressId(id); qc.invalidateQueries({ queryKey: ["customer-addresses"] }); }} />
    </div>
  );
}

function AddressDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: string) => void }) {
  const [label, setLabel] = useState("Home");
  const [line, setLine] = useState("");
  const [area, setArea] = useState("");
  const [pincode, setPincode] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any).from("customer_addresses").insert({ user_id: u.user?.id, label, address_line: line, area, pincode, is_default: true }).select("id").single();
    setSaving(false);
    if (!error) { onCreated(data.id); onOpenChange(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Add address</DialogTitle></DialogHeader><div className="space-y-3"><Input value={line} onChange={(e) => setLine(e.target.value)} placeholder="House, Street" /><Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area" /><Input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="Pincode" /></div><DialogFooter><Button onClick={save} disabled={saving}>Save</Button></DialogFooter></DialogContent>
    </Dialog>
  );
}
