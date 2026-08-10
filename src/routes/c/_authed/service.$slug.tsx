import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { ArrowLeft, Check, Clock, ChevronRight, Loader2, Sparkles, MapPin, Car, ShieldCheck, CalendarClock, ChevronDown } from "lucide-react";
import { getServiceImage, useServiceImages } from "@/lib/service-image-resolver";
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
  head: () => ({ meta: [{ title: "Daily Shine Subscription — Urban Wash" }] }),
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
  plan_benefits: string[] | null;
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
    
    if (basePrice > 0 && totalPayable <= 0) {
      toast.error("Invalid price calculation. Please contact support.");
      return;
    }

    setSubmitting(true);

    try {
      const { data: bId, error } = await (supabase as any).rpc("confirm_customer_booking", {
        p_service_id: service.id,
        p_vehicle_id: vehicle.id,
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

  return (
    <div className="min-h-screen bg-[#FFF9F3] pb-40">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#FFF9F3]/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-black/[0.05]">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate({ to: "/c/home" })} className="p-2 -ml-2 text-charcoal">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div>
            <div className="font-bold text-[14px] leading-none">DAILY SHINE</div>
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">Subscription details</div>
          </div>
        </div>
        <div className="bg-white/60 px-3 py-1.5 rounded-full border border-black/[0.05] shadow-sm flex items-center gap-2">
          <Car className="h-3.5 w-3.5 text-primary" />
          <span className="text-[12px] font-black">{vehicle?.nickname || vehicle?.model || "Vehicle"} ▾</span>
        </div>
      </header>

      {service && (
        <div className="px-4 space-y-6 pt-6 max-w-md mx-auto">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-[24px] aspect-[16/11] bg-white shadow-md">
             {imageObj.url ? (
                <img src={imageObj.url} className="w-full h-full object-cover" alt={service.name} />
              ) : (
                <div className="w-full h-full bg-primary/5 flex items-center justify-center">
                  <Sparkles className="h-12 w-12 text-primary/20" />
                </div>
              )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
            <div className="absolute bottom-5 left-5 text-white">
              <div className="px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-black uppercase tracking-widest border border-white/20 inline-block mb-1.5">PROFESSIONAL CARE</div>
              <h2 className="text-2xl font-black leading-tight">DAILY SHINE<br/>SUBSCRIPTION</h2>
              <p className="text-[12px] font-bold opacity-90 mt-1">A cleaner car, every single day.</p>
            </div>
          </div>

          {/* Price Summary Card */}
          <Surface className="p-5 rounded-[24px] bg-white border-0 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Daily Shine Subscription</div>
                <div className="text-3xl font-black text-primary mt-1">₹{basePrice}<span className="text-[14px] font-bold text-muted-foreground ml-1">/ month</span></div>
              </div>
              <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-black uppercase">Premium</div>
            </div>
          </Surface>

          {/* What is Daily Shine */}
          <Section title="What is Daily Shine?">
            <p className="text-[14px] font-bold text-charcoal/80 leading-relaxed">Daily Shine is Urban Wash's recurring doorstep car-care service designed to keep your vehicle clean every working day without the hassle of booking every wash separately.</p>
          </Section>

          {/* Benefits */}
          <Section title="Your Daily Shine Benefits">
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Sparkles, label: "Daily Exterior Cleaning" },
                { icon: MapPin, label: "Doorstep Service" },
                { icon: CalendarClock, label: "Scheduled Service" },
                { icon: ShieldCheck, label: "Quality Assurance" }
              ].map(b => (
                <Surface key={b.label} className="p-4 flex flex-col gap-2 bg-white">
                  <b.icon className="h-6 w-6 text-primary" />
                  <div className="text-[12px] font-black leading-tight">{b.label}</div>
                </Surface>
              ))}
            </div>
          </Section>

          {/* Included */}
          <Section title="What's included">
            <Surface className="p-5 bg-white space-y-4">
              {(isSUV ? service.includes_sedan_suv : service.includes_hatchback)?.map((item: string) => (
                <div key={item} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                    <Check className="h-3.5 w-3.5 text-success" />
                  </div>
                  <span className="text-[14px] font-bold">{item}</span>
                </div>
              ))}
            </Surface>
          </Section>

          {/* Location */}
          <Section title="Service Location">
            <Surface className="flex items-center gap-4 p-4 bg-white">
              <MapPin className="h-6 w-6 text-primary" />
              <div className="flex-grow text-[14px] font-bold truncate">
                {address ? `${address.label}: ${address.area}` : "No address set"}
              </div>
              <button className="text-[12px] font-black text-primary uppercase">Change</button>
            </Surface>
          </Section>

          {/* Schedule */}
          <Section title="Choose a schedule">
            <div className="text-[13px] font-bold text-muted-foreground mb-3">Choose the time window that works best for your vehicle.</div>
            <div className="grid grid-cols-2 gap-3">
              {TIME_SLOTS.map(s => (
                <button 
                  key={s} 
                  onClick={() => setSlot(s)} 
                  className={cn(
                    "py-3 px-3 rounded-2xl border-2 font-bold text-[13px] text-center transition-all",
                    slot === s ? "border-primary bg-primary/5 text-primary" : "border-black/[0.05] bg-white text-charcoal"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </Section>

          {/* Add-ons */}
          <Section title="Premium Add-ons">
            <div className="space-y-3">
              {addonsQ.data?.slice(0, 3).map(a => {
                const price = isSUV ? a.price_sedan_suv : a.price_hatchback;
                const isSelected = !!addonQty[a.id];
                return (
                  <Surface key={a.id} className="flex justify-between items-center p-4">
                     <div>
                       <div className="font-bold text-[14px]">{a.name}</div>
                       <div className="text-[12px] font-black text-primary mt-0.5">₹{price}</div>
                     </div>
                     <Button 
                       onClick={() => setAddonQty(p => ({...p, [a.id]: isSelected ? 0 : 1}))}
                       className={cn("h-8 rounded-full px-4 text-[11px] font-black", isSelected ? "bg-success" : "bg-primary")}
                     >
                       {isSelected ? "ADDED" : "+ ADD"}
                     </Button>
                  </Surface>
                );
              })}
            </div>
            <button className="w-full mt-3 text-[12px] font-bold text-primary uppercase underline">View all add-ons</button>
          </Section>
        </div>
      )}

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white p-5 border-t border-black/[0.05] shadow-[0_-8px_30px_rgba(0,0,0,0.08)] flex items-center justify-between safe-area-bottom">
        <div>
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest leading-none mb-1">TOTAL</div>
          <div className="text-[20px] font-black leading-none">₹{totalPayable}</div>
        </div>
        <Button onClick={confirm} disabled={submitting} className="h-14 w-48 rounded-[16px] font-black text-[15px] shadow-lg shadow-primary/20">
           {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <>PROCEED TO PAY →</>}
        </Button>
      </div>
    </div>
  );
}
