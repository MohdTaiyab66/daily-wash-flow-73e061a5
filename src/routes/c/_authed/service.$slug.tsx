import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { ArrowLeft, Check, Clock, ChevronRight, Loader2, Sparkles, MapPin, Car, Info, ShieldCheck } from "lucide-react";
import { useServiceImages, getServiceImage } from "@/lib/service-image-resolver";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { createRazorpayOrder, verifyRazorpayPayment } from "@/lib/payment.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Section, Surface, Muted } from "@/components/customer/ui/kit";
import { cn } from "@/lib/utils";
import { openRazorpayCheckout } from "@/lib/paymentBridge";

export const Route = createFileRoute("/c/_authed/service/$slug")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    vehicleId: z.string().optional().parse(search.vehicleId),
  }),
  head: () => ({ meta: [{ title: "Book Service — Urban Wash" }] }),
  component: ServiceDetail,
});

type Service = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price_hatchback: number;
  price_sedan_suv: number;
  service_type: string;
  includes_hatchback: string[] | null;
  includes_sedan_suv: string[] | null;
};

type Vehicle = {
  id: string;
  make: string;
  model: string;
  category: string;
  registration_number: string;
  nickname?: string;
};

type Address = {
  id: string;
  label: string;
  address_line: string;
  area: string;
  is_default: boolean;
};

type Addon = {
  id: string;
  name: string;
  price_hatchback: number;
  price_sedan_suv: number;
  applies_to_slugs: string[] | null;
};

const TIME_SLOTS = ["Before 7 AM", "Before 8 AM", "Before 9 AM", "Before 10 AM", "Before 11 AM", "Before 12 PM"];

function ServiceDetail() {
  const { slug } = useParams({ from: "/c/_authed/service/$slug" });
  const navigate = useNavigate();
  const search = Route.useSearch();
  
  const [vehicleId, setVehicleId] = useState<string | null>(search.vehicleId || null);
  const [slot, setSlot] = useState(TIME_SLOTS[3]);
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [billExpanded, setBillExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const serviceQ = useQuery({
    queryKey: ["service", slug],
    queryFn: async () => {
      const { data } = await (supabase as any).from("service_catalog").select("*").eq("slug", slug).maybeSingle();
      return data as Service | null;
    }
  });

  const vehiclesQ = useQuery({
    queryKey: ["customer-vehicles"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("customer_vehicles").select("*");
      return (data ?? []) as Vehicle[];
    }
  });

  const addressesQ = useQuery({
    queryKey: ["customer-addresses"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("customer_addresses").select("*");
      return (data ?? []) as Address[];
    }
  });

  const addonsQ = useQuery({
    queryKey: ["service-addons", slug],
    queryFn: async () => {
      const { data } = await (supabase as any).from("service_addons").select("*").eq("active", true);
      return ((data ?? []) as Addon[]).filter((a) => !a.applies_to_slugs?.length || a.applies_to_slugs.includes(slug));
    }
  });

  const service = serviceQ.data;
  const vehicles = vehiclesQ.data ?? [];
  const address = addressesQ.data?.find(a => a.is_default) ?? addressesQ.data?.[0];
  
  // Set default vehicle if not selected
  const vehicle = useMemo(() => {
    if (vehicleId) return vehicles.find(v => v.id === vehicleId);
    return vehicles[0];
  }, [vehicles, vehicleId]);

  const isSUV = vehicle?.category === "sedan_suv";
  const basePrice = service ? (isSUV ? service.price_sedan_suv : service.price_hatchback) : 0;
  
  const selectedAddons = useMemo(() => {
    return (addonsQ.data ?? []).filter(a => addonQty[a.id] > 0);
  }, [addonsQ.data, addonQty]);

  const addonTotal = selectedAddons.reduce((sum, a) => sum + (isSUV ? a.price_sedan_suv : a.price_hatchback), 0);
  const totalPayable = basePrice + addonTotal;

  const imagesQ = useServiceImages();
  const imageObj = getServiceImage(slug, imagesQ.data);

  const confirm = async () => {
    if (!service || !vehicle) {
      toast.error("Please select a vehicle to continue");
      return;
    }
    setSubmitting(true);
    try {
      // 1. Create booking
      const { data: bId, error } = await (supabase as any).rpc("confirm_customer_booking", {
        p_service_id: service.id,
        p_vehicle_id: vehicle.id,
        p_scheduled_date: new Date().toISOString().slice(0, 10),
        p_scheduled_time: slot,
        p_addons: selectedAddons.map(a => ({ id: a.id, quantity: 1 })),
      });
      if (error) throw error;
      
      // 2. Create Razorpay order
      const order = await useServerFn(createRazorpayOrder)({ data: { bookingId: bId } });
      
      // 3. Open checkout
      const result = await openRazorpayCheckout({
        keyId: order.keyId,
        orderId: order.orderId,
        amount: order.amount,
        currency: "INR",
        description: service.name,
        bookingId: bId
      });
      
      if (result.status === "success") {
        await useServerFn(verifyRazorpayPayment)({
          data: {
            bookingId: bId,
            razorpayOrderId: result.orderId,
            razorpayPaymentId: result.paymentId,
            razorpaySignature: result.signature
          }
        });
        navigate({ to: "/c/booking-success", search: { bookingId: bId } });
      } else {
        toast.info("Payment was not completed.");
      }
    } catch (e: any) {
      console.error("Booking Error:", e);
      toast.error(e.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (serviceQ.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#FFF9F3]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF9F3] pb-40">
      {/* Premium Header */}
      <header className="sticky top-0 z-30 bg-[#FFF9F3]/90 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-black/[0.03]">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate({ to: "/c/home" })} 
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white shadow-sm border border-black/[0.05] active:scale-95 transition-transform"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="font-black text-[15px] leading-none uppercase tracking-tight">{service?.name}</h1>
            <Muted className="text-[11px] font-bold mt-1">STEP 1 OF 2: DETAILS</Muted>
          </div>
        </div>
        <div className="bg-white px-3 py-1.5 rounded-full border border-black/[0.05] shadow-sm flex items-center gap-2">
          <Car className="h-3.5 w-3.5 text-primary" />
          <span className="text-[12px] font-black">{vehicle?.nickname || vehicle?.model || "Select Car"}</span>
        </div>
      </header>

      {service && (
        <div className="px-4 space-y-6 pt-4 max-w-md mx-auto">
          {/* Hero Image */}
          <div className="relative overflow-hidden rounded-[28px] aspect-[16/10] shadow-xl group">
            {imageObj.url ? (
              <img src={imageObj.url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={service.name} />
            ) : (
              <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-12 w-12 text-primary/20" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute bottom-5 left-5 right-5">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/20 backdrop-blur-md rounded-full text-white text-[10px] font-black uppercase tracking-widest mb-2 border border-white/20">
                <Sparkles className="h-3 w-3" /> Professional Care
              </div>
              <h2 className="text-white text-2xl font-black leading-tight">{service.name}</h2>
            </div>
          </header>

          {/* Location Bar */}
          <Surface className="flex items-center gap-3 p-3 bg-white/50 border-dashed">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase text-muted-foreground tracking-wider">Service Location</div>
              <div className="text-[14px] font-bold truncate">{address ? `${address.label}: ${address.area}` : "No address set"}</div>
            </div>
            <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
          </Surface>
          
          {/* What's included */}
          <Section title="What's included">
            <Surface className="p-5 bg-white space-y-3">
              {(isSUV ? service.includes_sedan_suv : service.includes_hatchback)?.map((item: string) => (
                <div key={item} className="flex items-start gap-3">
                  <div className="mt-0.5 w-5 h-5 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                    <Check className="h-3 w-3 text-success" />
                  </div>
                  <span className="text-[14px] font-bold leading-tight">{item}</span>
                </div>
              ))}
              <div className="pt-3 border-t border-black/[0.05] flex items-center gap-2 text-[12px] font-bold text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Urban Wash Quality Guarantee
              </div>
            </Surface>
          </Section>

          {/* Schedule */}
          <Section title="Choose a schedule">
            <div className="grid grid-cols-2 gap-3">
              {TIME_SLOTS.map(s => (
                <button 
                  key={s} 
                  onClick={() => setSlot(s)} 
                  className={cn(
                    "relative py-4 px-3 rounded-2xl border-2 transition-all flex flex-col items-center gap-1",
                    slot === s 
                      ? "border-primary bg-primary/5 text-primary shadow-[0_4px_12px_-4px_rgba(var(--primary),0.2)]" 
                      : "border-black/[0.04] bg-white text-muted-foreground"
                  )}
                >
                  <Clock className={cn("h-4 w-4", slot === s ? "text-primary" : "text-muted-foreground/40")} />
                  <span className="text-[12px] font-black tracking-tight">{s}</span>
                  {slot === s && <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary text-white rounded-full flex items-center justify-center border-2 border-[#FFF9F3]"><Check className="h-3 w-3" /></div>}
                </button>
              ))}
            </div>
          </Section>

          {/* Add-ons */}
          <Section title="Premium Add-ons">
            <div className="space-y-3">
              {addonsQ.data?.map(a => {
                const price = isSUV ? a.price_sedan_suv : a.price_hatchback;
                const isSelected = !!addonQty[a.id];
                return (
                  <Surface 
                    key={a.id} 
                    onClick={() => setAddonQty(p => ({...p, [a.id]: p[a.id] ? 0 : 1}))}
                    className={cn(
                      "flex justify-between items-center p-4 transition-all duration-300",
                      isSelected ? "border-primary/30 bg-primary/[0.02]" : "bg-white"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-colors", isSelected ? "bg-primary/10 text-primary" : "bg-black/[0.03] text-muted-foreground")}>
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-black text-[14px] leading-none">{a.name}</div>
                        <div className="text-[12px] font-bold text-primary mt-1">₹{price}</div>
                      </div>
                    </div>
                    <Button 
                      variant="outline"
                      className={cn(
                        "rounded-full h-9 px-4 text-[12px] font-black border-2 transition-all",
                        isSelected 
                          ? "bg-success border-success text-white hover:bg-success hover:text-white" 
                          : "border-primary text-primary hover:bg-primary/5"
                      )}
                    >
                      {isSelected ? "ADDED" : "ADD"}
                    </Button>
                  </Surface>
                );
              })}
            </div>
          </Section>

          {/* Pricing Summary (Collapsible Bill) */}
          <Section>
            <Surface className="bg-white overflow-hidden p-0 border-none shadow-sm">
              <button 
                onClick={() => setBillExpanded(!billExpanded)} 
                className="flex items-center justify-between w-full px-5 py-4 font-black text-[15px]"
              >
                Bill Details
                <div className="flex items-center gap-2">
                  <span className="text-primary">₹{totalPayable}</span>
                  <ChevronRight className={cn("h-5 w-5 transition-transform", billExpanded && "rotate-90")} />
                </div>
              </button>
              
              {billExpanded && (
                <div className="px-5 pb-5 space-y-3 animate-in slide-in-from-top-2 duration-300">
                  <div className="flex justify-between text-[13px] font-bold text-muted-foreground">
                    <span>{service.name} ({isSUV ? "SUV" : "Hatchback"})</span>
                    <span>₹{basePrice}</span>
                  </div>
                  {selectedAddons.map(a => (
                    <div key={a.id} className="flex justify-between text-[13px] font-bold text-muted-foreground">
                      <span>{a.name}</span>
                      <span>₹{isSUV ? a.price_sedan_suv : a.price_hatchback}</span>
                    </div>
                  ))}
                  <div className="pt-3 border-t border-black/[0.05] flex justify-between text-[15px] font-black">
                    <span>Total Payable</span>
                    <span className="text-primary">₹{totalPayable}</span>
                  </div>
                </div>
              )}
            </Surface>
          </Section>
          
          <div className="flex items-center gap-2 justify-center py-4 opacity-40">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-[11px] font-black uppercase tracking-widest">Secure 256-bit SSL Payment</span>
          </div>
        </div>
      )}

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white p-5 border-t border-black/[0.05] shadow-[0_-8px_30px_rgba(0,0,0,0.08)] flex items-center justify-between safe-area-bottom">
        <div className="flex flex-col">
          <span className="text-[11px] font-black text-muted-foreground uppercase tracking-wider leading-none mb-1">Total Amount</span>
          <div className="text-[24px] font-black text-[#1a1a1a] leading-none">₹{totalPayable}</div>
        </div>
        <Button 
          onClick={confirm} 
          disabled={submitting}
          className="h-14 w-48 rounded-[18px] font-black text-[16px] shadow-lg shadow-primary/20 active:scale-95 transition-all"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <>PROCEED TO PAY <ChevronRight className="ml-1 h-5 w-5" /></>}
        </Button>
      </div>
    </div>
  );
}
