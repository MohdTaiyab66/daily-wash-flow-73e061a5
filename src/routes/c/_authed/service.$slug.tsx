import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Car, Sparkles, Minus, Plus, Check, Clock, CheckCircle2, MapPin, ChevronRight, Loader2 } from "lucide-react";
import { z } from "zod";
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
import { normalizeBookingPreview } from "@/lib/entitlements";
import {
  appendCheckoutEvent,
  clearPendingCheckout,
  getCheckoutHolderId,
  readPendingCheckout,
  savePendingCheckout,
  type CheckoutEvent,
  type CheckoutStage,
} from "@/lib/pending-checkout-store";
import { Section, Surface, Muted } from "@/components/customer/ui/kit";
import { cn } from "@/lib/utils";
import { PremiumHero } from "@/components/customer/PremiumHero";
import { openRazorpayCheckout } from "@/lib/paymentBridge";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

export const Route = createFileRoute("/c/_authed/service/$slug")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    vehicleId: z.string().optional().parse(search.vehicleId),
  }),
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

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function isMondayIso(iso: string) {
  return new Date(`${iso}T12:00:00`).getDay() === 1;
}
function nextBookableDateIso(start = new Date()) {
  const d = new Date(start);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 1) d.setDate(d.getDate() + 1);
  return toIsoDate(d);
}

function ServiceDetail() {
  const { slug } = useParams({ from: "/c/_authed/service/$slug" });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const serviceImagesQ = useQuery({
    queryKey: ["customer-service-images"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_images")
        .select("service_slug, image_url, updated_at")
        .eq("status", "published")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const uniqueImages = new Map();
      data?.forEach(img => {
        if (!uniqueImages.has(img.service_slug)) {
          uniqueImages.set(img.service_slug, img.image_url);
        }
      });
      return Array.from(uniqueImages.entries()).map(([service_slug, image_url]) => ({
        service_slug,
        image_url
      }));
    },
    staleTime: 5000,
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
  });

  const getServiceImage = (serviceSlug: string) => {
    const custom = serviceImagesQ.data?.find(img => img.service_slug === serviceSlug);
    
    // TRACING LOG
    console.log(`[ServiceImages] Checkout Match for "${serviceSlug}":`, { found: !!custom, url: custom?.image_url });

    if (custom) return custom.image_url;
    
    const mapping: Record<string, string> = {
      "one-time-wash-premium": "https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&q=80&w=800",
      "one-time-wash-basic": "https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&q=80&w=800",
      "deep-clean": "https://images.unsplash.com/photo-1552933529-e359b2477262?auto=format&fit=crop&q=80&w=800",
      "interior-deep-clean": "https://images.unsplash.com/photo-1599256621730-535171e28e50?auto=format&fit=crop&q=80&w=800",
    };
    return mapping[serviceSlug];
  };

  const createOrder = useServerFn(createRazorpayOrder);
  const verifyPayment = useServerFn(verifyRazorpayPayment);
  const logAttemptFn = useServerFn(logPaymentAttempt);
  const getStatusFn = useServerFn(getBookingPaymentStatus);

  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(() => nextBookableDateIso());
  const [slot, setSlot] = useState<string>(TIME_SLOTS[3]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; percent: number } | null>(null);
  const [vehDrawerOpen, setVehDrawerOpen] = useState(false);
  const [addrDrawerOpen, setAddrDrawerOpen] = useState(false);
  const [addrDialogOpen, setAddrDialogOpen] = useState(false);
  const [payDrawerOpen, setPayDrawerOpen] = useState(false);
  const [billExpanded, setBillExpanded] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState({ id: 'phonepe', name: 'PhonePe UPI', icon: '🟣' });
  const [paying, setPaying] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Data fetching
  const serviceQ = useQuery({ queryKey: ["service", slug], queryFn: async () => { const { data } = await (supabase as any).from("service_catalog").select("*").eq("slug", slug).eq("active", true).maybeSingle(); return data as Service | null; } });
  const vehiclesQ = useQuery({ queryKey: ["customer-vehicles"], queryFn: async () => { const { data } = await (supabase as any).from("customer_vehicles").select("*").order("created_at"); return (data ?? []) as Vehicle[]; } });
  const addressesQ = useQuery({ queryKey: ["customer-addresses"], queryFn: async () => { const { data } = await (supabase as any).from("customer_addresses").select("*").order("created_at"); return (data ?? []) as Address[]; } });
  const addonsQ = useQuery({ queryKey: ["service-addons", slug], queryFn: async () => { const { data } = await (supabase as any).from("service_addons").select("*").eq("active", true).order("sort_order"); return ((data ?? []) as Addon[]).filter((a) => !a.applies_to_slugs?.length || a.applies_to_slugs.includes(slug)); } });
  const vehicleSubQ = useQuery({ queryKey: ["vehicle-open-subscription", vehicleId], enabled: !!vehicleId, queryFn: async () => { const { data } = await (supabase as any).from("subscriptions").select("id,status").eq("vehicle_id", vehicleId).in("status", ["active", "awaiting_partner_assignment", "assigned"]).limit(1).maybeSingle(); return data ?? null; } });

  const service = serviceQ.data;
  const vehicles = vehiclesQ.data ?? [];
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const address = addressesQ.data?.find((a) => a.id === addressId);
  const isSUV = vehicle?.category === "sedan_suv";
  const isDailyShine = service?.service_type === "subscription" || service?.slug?.startsWith("daily-shine");
  const isVehicleSubActive = vehicleSubQ.data?.status === 'active';
  
  const selectedAddons = useMemo(() => Object.entries(addonQty).filter(([, q]) => q > 0).map(([id, quantity]) => ({ id, quantity })), [addonQty]);

  const previewQ = useQuery({
    queryKey: ["booking-preview", service?.id, vehicleId, addressId, date, slot, appliedCoupon?.code ?? null, selectedAddons],
    enabled: !!service?.id && !!vehicleId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("preview_customer_booking", {
        p_service_id: service!.id, p_vehicle_id: vehicleId, p_address_id: addressId, p_scheduled_date: date, p_scheduled_time: slot, p_addons: selectedAddons, p_coupon_code: appliedCoupon?.code ?? null,
      });
      if (error) throw error;
      const normalized = normalizeBookingPreview(data);
      if (isVehicleSubActive && !normalized.used_entitlement && isDailyShine) { normalized.base_amount = 0; normalized.payable = Number(normalized.addon_amount ?? 0); }
      else if (isVehicleSubActive && !normalized.used_entitlement && !isDailyShine) { normalized.payable = Number(normalized.total_amount ?? 0); }
      return normalized;
    },
  });

  const preview = previewQ.data ?? null;
  const previewReady = !!preview && !previewQ.isError;
  const previewPayable = previewReady ? Number(preview.payable ?? 0) : 0;
  const previewBase = Number(preview?.base_amount ?? previewPayable);
  const previewAddon = Number(preview?.addon_amount ?? 0);
  const previewDiscount = Number(preview?.discount_amount ?? 0);
  const purchaseMode = useMemo(() => {
    if (!service) return 'new_subscription';
    if (preview?.used_entitlement) return 'included_wash';
    if (isVehicleSubActive) { return isDailyShine ? 'included_wash' : 'paid_add_on'; }
    return service.service_type === 'subscription' ? 'new_subscription' : 'one_time_service';
  }, [service, preview?.used_entitlement, isVehicleSubActive, isDailyShine]);

  const confirm = async () => {
    if (submitting || paying || !previewReady) return;
    setSubmitting(true);
    try {
      const { data: bookingId, error } = await (supabase as any).rpc("confirm_customer_booking", {
        p_service_id: service!.id, p_vehicle_id: vehicle!.id, p_address_id: addressId, p_scheduled_date: date, p_scheduled_time: slot, p_addons: selectedAddons, p_notes: notes || null,
      });
      if (error) throw error;
      
      const { data: booking } = await supabase.from("bookings").select("total_amount, payment_status").eq("id", bookingId).single();
      const payable = Number(booking?.total_amount ?? 0);
      if (payable <= 0) {
        toast.success("Booking confirmed!");
        await navigate({ to: "/c/booking-success", search: { bookingId: String(bookingId), service: service?.name, date, vehicle: `${vehicle?.make} ${vehicle?.model}` } });
        return;
      }

      const order = await createOrder({ data: { bookingId: String(bookingId) } });
      const result = await openRazorpayCheckout({
        keyId: order.keyId, orderId: order.orderId, amount: order.amount, currency: order.currency, description: service?.name || "Service", bookingId: String(bookingId),
      });
      if (result.status === "success") {
        await verifyPayment({ data: { bookingId: String(bookingId), razorpayOrderId: result.orderId, razorpayPaymentId: result.paymentId, razorpaySignature: result.signature } });
        await navigate({ to: "/c/booking-success", search: { bookingId: String(bookingId), plan: isDailyShine ? true : undefined } });
      }
    } catch (e: any) { toast.error(e.message); } finally { setSubmitting(false); }
  };

  const setQty = (id: string, q: number) => {
    if (q > 1) return; // Prevent multiple quantities for services/add-ons in this flow
    setAddonQty((prev) => ({ ...prev, [id]: Math.max(0, q) }));
  };

  const uniqueAddresses = useMemo(() => {
    const seen = new Set<string>();
    return (addressesQ.data ?? []).filter((addr) => {
      const key = `${addr.address_line.trim().toLowerCase()}|${addr.area.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [addressesQ.data]);

  if (serviceQ.isLoading) return <div className="p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-[#FFF9F3] pb-40">
      <header className="sticky top-0 z-30 flex items-center gap-4 bg-[#FFF9F3]/95 px-5 py-4 backdrop-blur">
        <button onClick={() => navigate({ to: "/c/home" })} className="grid h-8 w-8 place-items-center rounded-full bg-card shadow-sm active:scale-90"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1"><h1 className="text-[17px] font-black text-foreground truncate leading-none mb-1">{service?.name}</h1></div>
      </header>

      <div className="px-5 pb-6 space-y-8">
        {service && (
          <PremiumHero 
            service={service} 
            vehicleSubActive={isVehicleSubActive} 
            previewPayable={previewPayable} 
            purchaseMode={purchaseMode} 
            vehicle={vehicle} 
            address={address} 
            onVehicleClick={() => setVehDrawerOpen(true)} 
            onAddressClick={() => setAddrDrawerOpen(true)} 
          />
        )}

        <Section title={<><Clock className="h-4 w-4 text-primary" /> <span className="text-[15px] font-black">Choose a time</span></>}>
          <div className="mb-4 text-[14px] font-black text-foreground px-1">{date} · {slot}</div>
          <div className="grid grid-cols-2 gap-2">
            {TIME_SLOTS.map((s) => (
              <button key={s} onClick={() => setSlot(s)} className={cn("rounded-xl border py-3 text-[12px] font-black", slot === s ? "border-primary bg-primary/10 text-primary" : "border-black/5 bg-white text-muted-foreground")}>{s}</button>
            ))}
          </div>
        </Section>

        {addonsQ.data && addonsQ.data.length > 0 && (
          <Section title={<><Sparkles className="h-4 w-4 text-primary" /> <span className="text-[15px] font-black">Add more to your service</span></>}>
            <div className="space-y-3">
              {addonsQ.data.slice(0, 3).map((a) => (
                <Surface key={a.id} className="flex items-center justify-between p-3 border-black/5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-black">{a.name}</div>
                    <div className="text-[12px] font-bold text-primary">₹{isSUV ? a.price_sedan_suv : a.price_hatchback}</div>
                  </div>
                  <button 
                    onClick={() => setQty(a.id, addonQty[a.id] ? 0 : 1)} 
                    className={cn(
                      "h-9 px-4 rounded-lg text-[12px] font-black transition-colors",
                      addonQty[a.id] ? "bg-success text-white" : "bg-primary text-white"
                    )}
                  >
                    {addonQty[a.id] ? <Check className="h-4 w-4" /> : "+ Add"}
                  </button>
                </Surface>
              ))}
            </div>
          </Section>
        )}

        <Section title={<span className="text-[15px] font-black">Your services</span>}>
          <Surface className="border-none bg-white p-4 space-y-4">
            <div className="flex justify-between items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-black">{purchaseMode === 'included_wash' ? 'Daily Shine — Included wash' : service?.name}</div>
                <div className="text-[12px] font-medium text-muted-foreground/60">{vehicle?.make} {vehicle?.model}</div>
              </div>
              <div className="text-[14px] font-black">{purchaseMode === 'included_wash' ? 'Included' : `₹${previewBase}`}</div>
            </div>
            {selectedAddons.map(({ id, quantity }) => {
              const addon = addonsQ.data?.find(a => a.id === id);
              if (!addon) return null;
              return (
                <div key={id} className="flex justify-between items-start gap-4">
                  <div className="text-[14px] font-black">{addon.name} (x{quantity})</div>
                  <div className="text-[14px] font-black">₹{(isSUV ? addon.price_sedan_suv : addon.price_hatchback) * quantity}</div>
                </div>
              );
            })}
          </Surface>
        </Section>

        <Section>
          <button onClick={() => setBillExpanded(!billExpanded)} className="w-full flex items-center justify-between py-1">
            <span className="text-[15px] font-black">Bill details</span>
            <div className="flex items-center gap-2">{!billExpanded && <span className="text-[15px] font-black text-primary">₹{previewPayable}</span>}<ChevronRight className={cn("h-4 w-4 transition-transform", billExpanded && "rotate-90")} /></div>
          </button>
          {billExpanded && (
            <Surface className="mt-4 border-none bg-black/[0.02] p-4 space-y-2.5">
              <div className="flex justify-between text-[13px]"><span className="font-medium text-muted-foreground">Services total</span><span className="font-black">₹{previewBase + previewAddon}</span></div>
              {previewDiscount > 0 && <div className="flex justify-between text-[13px] text-success"><span>Discount</span><span>-₹{previewDiscount}</span></div>}
              <div className="pt-2.5 border-t border-black/5 flex justify-between text-[14px] font-black"><span>Grand total</span><span className="text-primary">₹{previewPayable}</span></div>
            </Surface>
          )}
        </Section>

        <Section>
          <div className="flex items-center justify-between py-1">
            <div className="flex items-start gap-3"><MapPin className="mt-1 h-4 w-4 text-primary" /><div><div className="text-[14px] font-black">Serving at {address?.label || 'Home'}</div><div className="text-[12px] font-medium text-muted-foreground/60">{address?.address_line}</div></div></div>
            <button onClick={() => setAddrDrawerOpen(true)} className="text-[13px] font-black text-primary">Change</button>
          </div>
        </Section>

        <Section>
          <button onClick={() => setPayDrawerOpen(true)} className="w-full flex items-center justify-between py-1">
            <div><div className="text-[15px] font-black">Payment method</div><div className="text-[13px] font-bold text-muted-foreground/60">{selectedPaymentMethod.icon} {selectedPaymentMethod.name}</div></div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
          </button>
        </Section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-xl border-t border-black/5 px-5 py-5 safe-area-bottom">
        <div className="flex items-center justify-between gap-4 max-w-lg mx-auto">
          <div><div className="text-[11px] font-bold text-muted-foreground uppercase tracking-tight">Total Payable</div><div className="text-[20px] font-black">₹{previewPayable}</div></div>
          <Button onClick={confirm} disabled={submitting || paying || !previewReady} className="flex-1 h-14 rounded-2xl bg-primary text-white font-black shadow-lg shadow-primary/20 active:scale-[0.98]">
            {submitting || paying ? <Loader2 className="animate-spin" /> : <span>{purchaseMode === 'included_wash' ? 'Confirm Booking' : `Pay ₹${previewPayable}`}</span>}
          </Button>
        </div>
      </div>

      {/* Drawers */}
      <Drawer open={vehDrawerOpen} onOpenChange={setVehDrawerOpen}>
        <DrawerContent className="p-4">
          <DrawerHeader><DrawerTitle>Select Vehicle</DrawerTitle></DrawerHeader>
          <div className="space-y-2">
            {vehicles.map(v => (
              <button key={v.id} onClick={() => { setVehicleId(v.id); setVehDrawerOpen(false); }} className={cn("w-full text-left p-4 rounded-xl border", vehicleId === v.id ? "border-primary bg-primary/5" : "border-black/5")}>
                <div className="font-black">{v.make} {v.model}</div><div className="text-xs">{v.registration_number}</div>
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={addrDrawerOpen} onOpenChange={setAddrDrawerOpen}>
        <DrawerContent className="p-4">
          <DrawerHeader><DrawerTitle>Select Location</DrawerTitle></DrawerHeader>
          <div className="space-y-2">
            {uniqueAddresses.map(addr => (
              <button key={addr.id} onClick={() => { setAddressId(addr.id); setAddrDrawerOpen(false); }} className={cn("w-full text-left p-4 rounded-xl border", addressId === addr.id ? "border-primary bg-primary/5" : "border-black/5")}>
                <div className="font-black">{addr.label}</div><div className="text-xs">{addr.address_line}</div>
              </button>
            ))}
            <Button onClick={() => setAddrDialogOpen(true)} variant="outline" className="w-full">Add new address</Button>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={payDrawerOpen} onOpenChange={setPayDrawerOpen}>
        <DrawerContent className="p-4">
          <DrawerHeader><DrawerTitle>Select Payment Method</DrawerTitle></DrawerHeader>
          <div className="space-y-3">
            {[ { id: 'gpay', name: 'Google Pay UPI', icon: '🟢' }, { id: 'phonepe', name: 'PhonePe UPI', icon: '🟣' }, { id: 'paytm', name: 'Paytm UPI', icon: '🔵' } ].map((m) => (
              <button key={m.id} onClick={() => { setSelectedPaymentMethod(m); setPayDrawerOpen(false); }} className="w-full flex items-center gap-3 p-4 rounded-xl bg-black/[0.02] border border-black/[0.04]">
                <span className="text-xl">{m.icon}</span><span className="font-black">{m.name}</span>
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      <AddressDialog open={addrDialogOpen} onOpenChange={setAddrDialogOpen} onCreated={(id) => { setAddressId(id); qc.invalidateQueries({ queryKey: ["customer-addresses"] }); }} />
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
    if (line.trim().length < 4) { toast.error("Enter a valid address"); return; }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); return; }
    const { data, error } = await (supabase as any).from("customer_addresses").insert({ user_id: u.user.id, label, address_line: line.trim(), area: area.trim(), pincode, is_default: true }).select("id").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Address saved");
    onCreated(data.id);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add new address</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <Input value={line} onChange={(e) => setLine(e.target.value)} placeholder="Flat / House / Street" />
          <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area" />
          <Input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="Pincode" />
        </div>
        <DialogFooter><Button onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
