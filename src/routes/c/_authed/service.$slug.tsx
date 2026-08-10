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
    <div className="min-h-screen bg-[#FFFDFB] pb-40">
      {/* Redesigned Header */}
      <header className="sticky top-0 z-30 bg-[#FFFDFB]/95 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-black/[0.04]">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button onClick={() => navigate({ to: "/c/home" })} className="p-2 -ml-2 text-charcoal">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="font-bold text-[15px] text-charcoal truncate pr-2 leading-tight">
              {service?.name}
            </div>
            <div className="text-[10px] font-black text-muted-foreground/80 uppercase tracking-widest mt-0.5">
              SERVICE DETAILS
            </div>
          </div>
        </div>
        
        <div className="bg-white/70 px-3 py-1.5 rounded-full border border-black/[0.06] shadow-sm flex items-center gap-2 shrink-0">
          <Car className="h-3.5 w-3.5 text-primary" />
          <span className="text-[12px] font-bold text-charcoal max-w-[80px] truncate">{vehicle?.nickname || vehicle?.model || "Vehicle"} ▾</span>
        </div>
      </header>

      {service && (
        <div className="px-4 space-y-7 pt-4 max-w-md mx-auto">
          {/* Integrated Hero Section */}
          <div className="relative overflow-hidden rounded-[28px] aspect-[16/10] bg-white shadow-sm border border-black/[0.03]">
             {imageObj.url ? (
                <img src={imageObj.url} className="w-full h-full object-cover" alt={service.name} />
              ) : (
                <div className="w-full h-full bg-primary/5 flex items-center justify-center">
                  <Sparkles className="h-10 w-10 text-primary/15" />
                </div>
              )}
             <div className="absolute inset-0 bg-black/5 pointer-events-none" />
          </div>

          {/* Premium Service Summary Card */}
          <Surface className="p-6 rounded-[28px] bg-white border-black/[0.04] shadow-[0_8px_30px_rgba(0,0,0,0.02)]">
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1 pr-4">
                <h1 className="text-[20px] font-black text-charcoal uppercase leading-tight tracking-tight">
                  {service.name}
                </h1>
                <div className="flex items-center gap-2 mt-2.5">
                  <div className="text-2xl font-black text-primary">
                    ₹{basePrice}
                  </div>
                  <div className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-wider">
                    {isSubscription ? "MONTHLY" : "ONE-TIME"}
                  </div>
                </div>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-[#FFF1E6] flex items-center justify-center text-primary shadow-sm border border-primary/10 shrink-0">
                <Zap className="h-6 w-6" fill="currentColor" />
              </div>
            </div>
            <div className="h-px bg-black/[0.03] my-4" />
            <p className="text-[14px] font-bold text-charcoal/70 leading-relaxed italic">
              {isSubscription ? "A cleaner car, every single day." : "Quality doorstep car wash & detail."}
            </p>
          </Surface>

          {/* Service Overview */}
          <div className="space-y-3">
            <SectionTitle className="text-[17px] tracking-tight text-charcoal">Service Overview</SectionTitle>
            <Surface className="p-5 bg-white border-black/[0.03] rounded-[24px]">
              <p className="text-[14px] font-bold text-charcoal/80 leading-relaxed">
                {description}
              </p>
            </Surface>
          </div>

          {/* Included Services */}
          {inclusions && inclusions.length > 0 && (
            <div className="space-y-3">
              <SectionTitle className="text-[17px] tracking-tight text-charcoal">Service Includes</SectionTitle>
              <div className="grid grid-cols-1 gap-2.5">
                {inclusions.map((item: string) => (
                  <Surface key={item} className="p-4 bg-white border-black/[0.03] rounded-[20px] flex items-center gap-3.5">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <span className="text-[14px] font-bold text-charcoal">{item}</span>
                  </Surface>
                ))}
              </div>
            </div>
          )}

          {/* Service Benefits */}
          <div className="space-y-3">
            <SectionTitle className="text-[17px] tracking-tight text-charcoal">Why choose Urban Wash?</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              {benefits.map((bLabel, idx) => {
                const Icon = [Sparkles, ShieldCheck, CalendarClock, MapPin][idx % 4] || Star;
                return (
                  <Surface key={bLabel} className="p-4 flex flex-col gap-2.5 bg-white border-black/[0.03] rounded-[22px] min-h-[90px]">
                    <Icon className="h-5 w-5 text-primary" />
                    <div className="text-[12px] font-black text-charcoal leading-tight">{bLabel}</div>
                  </Surface>
                );
              })}
            </div>
          </div>

          {/* Location */}
          <div className="space-y-3">
            <SectionTitle className="text-[17px] tracking-tight text-charcoal">Service Location</SectionTitle>
            <Surface className="flex items-center gap-4 p-5 bg-white border-black/[0.03] rounded-[24px]">
              <div className="h-10 w-10 rounded-full bg-[#FFF1E6] flex items-center justify-center text-primary shrink-0">
                <MapPin className="h-5 w-5" />
              </div>
              <div className="flex-grow min-w-0">
                <div className="text-[14px] font-black text-charcoal truncate">
                  {address ? `${address.label}: ${address.area}` : "No address set"}
                </div>
                <div className="text-[11px] font-bold text-muted-foreground mt-0.5">Your primary service address</div>
              </div>
              <button className="text-[11px] font-black text-primary uppercase bg-primary/5 px-3 py-1.5 rounded-full border border-primary/10 active:scale-95 transition-transform shrink-0">
                Change
              </button>
            </Surface>
          </div>

          {/* Schedule */}
          <div className="space-y-3">
            <div className="flex flex-col gap-0.5">
              <SectionTitle className="text-[17px] tracking-tight text-charcoal">Choose a time</SectionTitle>
              <p className="text-[12px] font-bold text-muted-foreground">Select your preferred time slot</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {TIME_SLOTS.map(s => {
                const isSelected = slot === s;
                return (
                  <button 
                    key={s} 
                    onClick={() => setSlot(s)} 
                    className={cn(
                      "py-4 px-3 rounded-[20px] border-2 font-black text-[13px] flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97]",
                      isSelected 
                        ? "border-primary bg-primary/[0.04] text-primary shadow-[0_4px_12px_rgba(255,107,0,0.08)]" 
                        : "border-black/[0.04] bg-white text-charcoal/60"
                    )}
                  >
                    {s}
                    {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Add-ons */}
          {addonsQ.data && addonsQ.data.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-col gap-0.5">
                <SectionTitle className="text-[17px] tracking-tight text-charcoal">Premium Add-ons</SectionTitle>
                <p className="text-[12px] font-bold text-muted-foreground">Enhance your service with optional extras</p>
              </div>
              <div className="space-y-3">
                {(showAllAddons ? addonsQ.data : addonsQ.data.slice(0, 3)).map(a => {
                  const price = isSUV ? a.price_sedan_suv : a.price_hatchback;
                  const isSelected = !!addonQty[a.id];
                  return (
                    <Surface key={a.id} className="flex justify-between items-center p-4 bg-white border-black/[0.03] rounded-[22px]">
                       <div className="flex-1 pr-3">
                         <div className="font-bold text-[14px] text-charcoal">{a.name}</div>
                         <div className="text-[12px] font-black text-primary mt-1 flex items-center gap-1.5">
                            ₹{price}
                            <span className="text-[10px] text-muted-foreground/60 font-black">EXTRA</span>
                         </div>
                       </div>
                       <Button 
                         onClick={() => setAddonQty(p => ({...p, [a.id]: isSelected ? 0 : 1}))}
                         className={cn(
                           "h-9 rounded-full px-5 text-[11px] font-black shadow-sm transition-all",
                           isSelected 
                            ? "bg-success text-white border-none" 
                            : "bg-white text-primary border border-primary/20 hover:bg-primary/5"
                         )}
                       >
                         {isSelected ? "ADDED" : "+ ADD"}
                       </Button>
                    </Surface>
                  );
                })}
              </div>
              {addonsQ.data.length > 3 && !showAllAddons && (
                <button 
                  onClick={() => setShowAllAddons(true)}
                  className="w-full mt-2 text-[12px] font-black text-primary uppercase bg-primary/[0.03] py-3 rounded-2xl border border-primary/5 active:scale-98 transition-transform"
                >
                  View all add-ons
                </button>
              )}
            </div>
          )}

          {/* Bill Details */}
          <div className="space-y-3">
            <SectionTitle className="text-[17px] tracking-tight text-charcoal">Bill Details</SectionTitle>
            <Surface className="p-6 bg-white border-black/[0.03] rounded-[28px] shadow-sm">
              <div className="space-y-3.5">
                <div className="flex justify-between items-center text-[14px]">
                  <span className="font-bold text-charcoal/60 uppercase text-[12px] tracking-tight">
                    {isSubscription ? "Subscription" : "Service Amount"}
                  </span>
                  <span className="font-black text-charcoal">₹{basePrice}</span>
                </div>
                
                {selectedAddons.length > 0 && (
                  <div className="space-y-3.5 pt-3.5 border-t border-black/[0.03]">
                    {selectedAddons.map(a => (
                      <div key={a.id} className="flex justify-between items-center text-[14px]">
                        <span className="font-bold text-charcoal/60 uppercase text-[12px] tracking-tight">{a.name}</span>
                        <span className="font-black text-charcoal">₹{isSUV ? a.price_sedan_suv : a.price_hatchback}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="h-px bg-black/[0.05] my-2" />
                
                <div className="flex justify-between items-center pt-1">
                  <span className="text-[14px] font-black uppercase tracking-tight text-charcoal">Total Payable</span>
                  <span className="text-[22px] font-black text-primary">₹{totalPayable}</span>
                </div>
              </div>
            </Surface>
          </div>
        </div>
      )}

      {/* Sticky Bottom Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md p-4 pb-6 border-t border-black/[0.06] shadow-[0_-12px_40px_rgba(0,0,0,0.06)] flex items-center justify-between safe-area-bottom">
        <div>
          <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1.5">TOTAL PAYABLE</div>
          <div className="text-[22px] font-black leading-none text-charcoal">₹{totalPayable}</div>
        </div>
        <Button 
          onClick={confirm} 
          disabled={submitting} 
          className="h-13 w-52 rounded-[20px] font-black text-[15px] shadow-xl shadow-primary/20 active:scale-[0.98] transition-transform"
        >
           {submitting ? (
             <Loader2 className="h-5 w-5 animate-spin" />
           ) : (
             <div className="flex items-center gap-2">
               PROCEED TO PAY <ArrowLeft className="h-4 w-4 rotate-180" strokeWidth={3} />
             </div>
           )}
        </Button>
      </div>
    </div>
  );
}
