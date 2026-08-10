import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { 
  ArrowLeft, Check, Clock, ChevronRight, Loader2, Sparkles, MapPin, 
  Car, ShieldCheck, CalendarClock, ChevronDown, Info,
  Star,
  Zap,
  CheckCircle2
} from "lucide-react";
import { getServiceImage, useServiceImages } from "@/lib/service-image-resolver";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { createRazorpayOrder, verifyRazorpayPayment } from "@/lib/payment.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Section, Surface, Muted, SectionTitle } from "@/components/customer/ui/kit";
import { cn } from "@/lib/utils";
import { openRazorpayCheckout } from "@/lib/paymentBridge";

export const Route = createFileRoute("/c/_authed/service/$slug")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    vehicleId: z.string().optional().parse(search.vehicleId),
  }),
  head: ({ params }) => ({ 
    meta: [{ title: `${params.slug.replace(/-/g, ' ').toUpperCase()} — Urban Wash` }] 
  }),
  component: ServiceDetail,
});

type Service = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_hatchback: number;
  price_sedan_suv: number;
  service_type: string;
  includes_hatchback: string[] | null;
  includes_sedan_suv: string[] | null;
  benefits: string[] | null;
  addons: any;
};

type Vehicle = {
  id: string;
  make: string;
  model: string;
  category: string;
  nickname?: string;
};

type Address = {
  id: string;
  label: string;
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
  const [submitting, setSubmitting] = useState(false);
  const [showAllAddons, setShowAllAddons] = useState(false);

  const serviceQ = useQuery({
    queryKey: ["service", slug],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_catalog").select("*").eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data as Service | null;
    }
  });

  const vehiclesQ = useQuery({
    queryKey: ["customer-vehicles"],
    queryFn: async () => {
      const { data } = await supabase.from("customer_vehicles").select("*");
      return (data ?? []) as Vehicle[];
    }
  });

  const addressesQ = useQuery({
    queryKey: ["customer-addresses"],
    queryFn: async () => {
      const { data } = await supabase.from("customer_addresses").select("*");
      return (data ?? []) as Address[];
    }
  });

  const addonsQ = useQuery({
    queryKey: ["service-addons", slug],
    queryFn: async () => {
      const { data } = await supabase.from("service_addons").select("*").eq("active", true);
      const allAddons = (data ?? []) as Addon[];
      return allAddons.filter((a) => !a.applies_to_slugs?.length || a.applies_to_slugs.includes(slug));
    }
  });

  const service = serviceQ.data;
  const vehicles = vehiclesQ.data ?? [];
  const address = addressesQ.data?.find(a => a.is_default) ?? addressesQ.data?.[0];
  
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

  const isSubscription = service?.service_type === "subscription" || slug === "daily-shine";

  const confirm = async () => {
    if (!service || !vehicle) {
      toast.error("Please select a vehicle to continue");
      return;
    }
    
    if (basePrice > 0 && totalPayable <= 0) {
      toast.error("Invalid price calculation. Please contact support.");
      return;
    }

    setSubmitting(true);

    try {
      const { data: bId, error } = await supabase.rpc("confirm_customer_booking", {
        p_service_id: service.id,
        p_vehicle_id: vehicle.id,
        p_address_id: address?.id || "",
        p_scheduled_date: new Date().toISOString().slice(0, 10),
        p_scheduled_time: slot,
        p_addons: selectedAddons.map(a => ({ id: a.id, quantity: 1 })),
      });
      if (error) throw error;
      
      const order = await useServerFn(createRazorpayOrder)({ data: { bookingId: bId } });
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

  if (!serviceQ.isLoading && !service) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-[#FFF9F3] px-6 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
          <Info className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-charcoal">Service Unavailable</h2>
        <p className="text-muted-foreground mt-2 mb-6">The selected service could not be found or is currently inactive.</p>
        <Button onClick={() => navigate({ to: "/c/home" })}>Go back to Home</Button>
      </div>
    );
  }

  const benefits = service?.benefits || (isSubscription ? ["Daily Exterior Cleaning", "Doorstep Service", "Scheduled Service", "Quality Assurance"] : ["Professional Care", "Doorstep Service", "Quality Check", "Service Proof"]);
  const inclusions = isSUV ? service?.includes_sedan_suv : service?.includes_hatchback;
  const description = service?.description || (isSubscription 
    ? "Daily Shine is Urban Wash's recurring doorstep car-care service designed to keep your vehicle clean every working day."
    : `Professional ${service?.name} service delivered at your doorstep for maximum convenience and quality.`);

  return (
    <div className="min-h-screen bg-[#FAF9F7] pb-32">
      {/* 1. COMPACT HEADER (📍 Kalyanpur (West) 🚙 Tata Harrier ▾) */}
      <header className="sticky top-0 z-50 bg-[#FAF9F7] px-4 py-4 flex items-center gap-4">
        <button onClick={() => navigate({ to: "/c/home" })} className="p-1">
          <ArrowLeft className="h-6 w-6 text-charcoal" />
        </button>
        
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-bold text-charcoal truncate pr-2 leading-tight">
            {service?.name}
          </div>
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5 opacity-60">
            SERVICE DETAILS
          </div>
        </div>
        
        <div className="bg-white px-3 py-2 rounded-2xl border border-black/[0.04] shadow-sm flex items-center gap-2 shrink-0">
          <div className="w-5 h-5 flex items-center justify-center">
            <img src="https://lovable-uploads.s3.us-west-2.amazonaws.com/b9e28f24-2c6c-4869-95e5-3914a1f33774.png" className="h-3.5 w-auto object-contain opacity-70 grayscale" alt="" />
          </div>
          <span className="text-[13px] font-bold text-charcoal max-w-[80px] truncate">{vehicle?.model || "Harrier"} ▾</span>
        </div>
      </header>

      {service && (
        <div className="px-4 space-y-6 pt-2 max-w-md mx-auto">
          {/* 2. PREMIUM HERO IMAGE */}
          <div className="relative overflow-hidden rounded-[24px] aspect-[16/8] bg-white shadow-sm border border-black/[0.03]">
             {imageObj.url ? (
                <img src={imageObj.url} className="w-full h-full object-cover" alt={service.name} />
              ) : (
                <div className="w-full h-full bg-primary/5 flex items-center justify-center">
                  <Sparkles className="h-10 w-10 text-primary/15" />
                </div>
              )}
          </div>

          {/* 3. SERVICE NAME & PRICE BLOCK */}
          <div className="bg-white p-5 rounded-[24px] border border-black/[0.04] shadow-sm flex justify-between items-center">
            <div className="flex-1 pr-4">
              <h1 className="text-[20px] font-bold text-charcoal leading-tight">
                {service.name}
              </h1>
              <p className="text-[13px] text-muted-foreground mt-1">
                {isSubscription ? "A cleaner car, every single day." : "Quality doorstep car wash without body polish."}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[24px] font-black text-[#EA580C]">
                ₹{basePrice}
              </div>
              <div className="text-[9px] font-black text-muted-foreground/60 uppercase tracking-widest mt-0.5 bg-black/[0.03] px-2 py-0.5 rounded-full inline-block">
                {isSubscription ? "MONTHLY" : "ONE-TIME"}
              </div>
            </div>
          </div>

          {/* 4. SERVICE INCLUDES (GRID 4 COLS) */}
          <div className="space-y-4">
            <h2 className="text-[15px] font-bold text-charcoal px-1">Service Includes</h2>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Exterior Wash", icon: "🚿" },
                { label: "Tyre & Rim Cleaning", icon: "🛞" },
                { label: "Glass Cleaning", icon: "🪟" },
                { label: "Drying & Finishing", icon: "🧺" }
              ].map((item) => (
                <div key={item.label} className="flex flex-col items-center gap-3 py-4 px-1 text-center bg-white/40 border border-black/[0.02] rounded-[20px]">
                  <div className="text-[24px]">{item.icon}</div>
                  <div className="text-[10px] font-bold text-charcoal leading-tight max-w-[60px]">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 5. SERVICE LOCATION (ORANGE PIN) */}
          <div className="bg-white flex items-center gap-4 p-5 rounded-[24px] border border-black/[0.04] shadow-sm">
            <div className="h-10 w-10 rounded-full bg-[#FFF1E6] flex items-center justify-center shrink-0">
              <MapPin className="h-5 w-5 text-[#EA580C]" />
            </div>
            <div className="flex-grow min-w-0">
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">Service Location</div>
              <div className="text-[15px] font-bold text-charcoal truncate mt-0.5">
                {address ? `${address.label}: ${address.area}` : "No address set"}
              </div>
            </div>
            <button className="text-[13px] font-bold text-[#EA580C] uppercase tracking-wide">
              Change
            </button>
          </div>

          {/* 6. CHOOSE A TIME (WHITE PILLS) */}
          <div className="space-y-3">
            <div className="px-1">
              <h2 className="text-[15px] font-bold text-charcoal">Choose a time</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">Select your preferred time slot</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {TIME_SLOTS.map(s => {
                const isSelected = slot === s;
                return (
                  <button 
                    key={s} 
                    onClick={() => setSlot(s)} 
                    className={cn(
                      "py-4 px-2 rounded-full border text-[12px] font-bold transition-all relative",
                      isSelected 
                        ? "border-[#EA580C] bg-[#EA580C]/[0.02] text-[#EA580C]" 
                        : "border-black/[0.03] bg-white text-charcoal/80"
                    )}
                  >
                    {s}
                    {isSelected && (
                      <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-4 h-4 rounded-full bg-[#EA580C] flex items-center justify-center border-2 border-[#FAF9F7]">
                        <Check className="h-2 w-2 text-white" strokeWidth={4} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 7. PREMIUM ADD-ONS (COMPACT ROWS) */}
          {addonsQ.data && addonsQ.data.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-end px-1">
                <div>
                  <h2 className="text-[15px] font-bold text-charcoal">Premium Add-ons</h2>
                  <p className="text-[12px] text-muted-foreground mt-0.5">Enhance your wash experience</p>
                </div>
                <button className="text-[12px] font-bold text-[#EA580C]">View all</button>
              </div>
              
              <div className="space-y-2">
                {(showAllAddons ? addonsQ.data : addonsQ.data.slice(0, 3)).map(a => {
                  const price = isSUV ? a.price_sedan_suv : a.price_hatchback;
                  const isSelected = !!addonQty[a.id];
                  return (
                    <div key={a.id} className="flex items-center gap-4 p-4 bg-white rounded-[22px] border border-black/[0.04] shadow-sm">
                       <div className="w-10 h-10 rounded-2xl bg-black/[0.02] flex items-center justify-center shrink-0">
                         {a.name.includes("Roof") ? "🚿" : a.name.includes("Seat") ? "💺" : "✨"}
                       </div>
                       <div className="flex-1 min-w-0">
                         <div className="font-bold text-[14px] text-charcoal">{a.name}</div>
                         <div className="text-[12px] font-black text-[#EA580C] mt-0.5">₹{price}</div>
                       </div>
                       <input 
                         type="checkbox" 
                         checked={isSelected}
                         onChange={() => setAddonQty(p => ({...p, [a.id]: isSelected ? 0 : 1}))}
                         className="h-5 w-5 rounded border-black/10 text-[#EA580C] focus:ring-[#EA580C]"
                       />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 8. BILL DETAILS (FLAT CARD) */}
          <div className="space-y-4">
            <h2 className="text-[15px] font-bold text-charcoal px-1">Bill Details</h2>
            <div className="bg-white p-6 rounded-[24px] border border-black/[0.04] shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[13px] text-muted-foreground font-medium">Service Amount</span>
                <span className="text-[13px] font-bold text-charcoal">₹{basePrice}</span>
              </div>
              
              {selectedAddons.map(a => (
                <div key={a.id} className="flex justify-between items-center">
                  <span className="text-[13px] text-muted-foreground font-medium">{a.name}</span>
                  <span className="text-[13px] font-bold text-charcoal">₹{isSUV ? a.price_sedan_suv : a.price_hatchback}</span>
                </div>
              ))}

              <div className="h-px bg-black/[0.03]" />
              
              <div className="flex justify-between items-center">
                <span className="text-[15px] font-bold text-charcoal uppercase tracking-wide">Total Payable</span>
                <span className="text-[20px] font-black text-[#EA580C]">₹{totalPayable}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 9. STICKY PAYMENT BAR (₹449  PROCEED TO PAY ->) */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white p-5 pb-8 border-t border-black/[0.04] flex items-center justify-between safe-area-bottom shadow-[0_-8px_30px_rgba(0,0,0,0.04)]">
        <div>
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">TOTAL</div>
          <div className="text-[22px] font-black text-charcoal">₹{totalPayable}</div>
        </div>
        <button 
          onClick={confirm} 
          disabled={submitting} 
          className="bg-[#EA580C] text-white h-14 w-64 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-3 shadow-lg shadow-[#EA580C]/20 active:scale-[0.98] transition-transform"
        >
           {submitting ? (
             <Loader2 className="h-5 w-5 animate-spin" />
           ) : (
             <>
               PROCEED TO PAY <ArrowLeft className="h-4 w-4 rotate-180" strokeWidth={3} />
             </>
           )}
        </button>
      </div>
    </div>

  );
}
