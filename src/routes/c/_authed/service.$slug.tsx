import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect, useCallback } from "react";
import { 
  ArrowLeft, Check, Clock, ChevronRight, Loader2, Sparkles, MapPin, 
  Car, ShieldCheck, CalendarClock, ChevronDown, Info,
  Star,
  Zap,
  CheckCircle2,
  X,
  Plus,
  Minus,
  Droplets,
  ZapIcon,
  Wind,
  Shield,
  Search
} from "lucide-react";
import { getServiceImage, useServiceImages } from "@/lib/service-image-resolver";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { createRazorpayOrder, verifyRazorpayPayment } from "@/lib/payment.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { openRazorpayCheckout } from "@/lib/paymentBridge";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import useEmblaCarousel from 'embla-carousel-react';

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
  registration_number: string;
  image_path?: string | null;
};

type Address = {
  id: string;
  label: string;
  area: string;
  is_default: boolean;
  address_line?: string | null;
};

type Addon = {
  id: string;
  name: string;
  price_hatchback: number;
  price_sedan_suv: number;
  applies_to_slugs: string[] | null;
  description?: string | null;
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
  const [showAddonDrawer, setShowAddonDrawer] = useState(false);
  const [showVehicleDrawer, setShowVehicleDrawer] = useState(false);

  useEffect(() => {
    if (!vehicleId) {
      const stored = localStorage.getItem("uw_customer_vehicle");
      if (stored) setVehicleId(stored);
    }
  }, [vehicleId]);

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
    queryKey: ["service-addons"],
    queryFn: async () => {
      const { data } = await supabase.from("service_addons").select("*").eq("active", true).order("sort_order");
      return (data ?? []) as Addon[];
    }
  });

  const service = serviceQ.data;
  const vehicles = vehiclesQ.data ?? [];
  const activeAddress = addressesQ.data?.find(a => a.is_default) ?? addressesQ.data?.[0];
  
  const vehicle = useMemo(() => {
    if (vehicleId) return vehicles.find(v => v.id === vehicleId);
    return vehicles[0];
  }, [vehicles, vehicleId]);

  const isSUV = vehicle?.category === "sedan_suv";
  const basePrice = service ? (isSUV ? service.price_sedan_suv : service.price_hatchback) : 0;
  
  const allAddons = addonsQ.data ?? [];
  const relevantAddons = useMemo(() => {
    return allAddons.filter(a => !a.applies_to_slugs?.length || a.applies_to_slugs.includes(slug));
  }, [allAddons, slug]);

  const selectedAddons = useMemo(() => {
    return relevantAddons.filter(a => addonQty[a.id] > 0);
  }, [relevantAddons, addonQty]);

  const addonTotal = selectedAddons.reduce((sum, a) => sum + (isSUV ? a.price_sedan_suv : a.price_hatchback), 0);
  const totalPayable = basePrice + addonTotal;

  const imagesQ = useServiceImages();
  const imageObj = getServiceImage(slug, imagesQ.data);

  const isSubscription = service?.service_type === "subscription" || slug === "daily-shine";

  const confirm = async () => {
    if (!service) {
      toast.error("Service not found");
      return;
    }
    if (!vehicle) {
      toast.error("Please select a vehicle to continue");
      setShowVehicleDrawer(true);
      return;
    }
    if (!activeAddress) {
      toast.error("Please set a service location");
      navigate({ to: "/c/location/search" });
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
        p_address_id: activeAddress.id,
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
      <div className="flex h-screen items-center justify-center bg-[#FAF9F7]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!serviceQ.isLoading && !service) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-[#FAF9F7] px-6 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
          <Info className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-charcoal">Service Unavailable</h2>
        <p className="text-muted-foreground mt-2 mb-6">The selected service could not be found or is currently inactive.</p>
        <Button onClick={() => navigate({ to: "/c/home" })}>Go back to Home</Button>
      </div>
    );
  }

  const inclusions = isSUV ? service?.includes_sedan_suv : service?.includes_hatchback;
  const description = service?.description || (isSubscription 
    ? "Daily Shine is Urban Wash's recurring doorstep car-care service designed to keep your vehicle clean every working day."
    : `Professional ${service?.name} service delivered at your doorstep for maximum convenience and quality.`);

  const handleAddonToggle = (id: string) => {
    setAddonQty(prev => ({
      ...prev,
      [id]: prev[id] ? 0 : 1
    }));
  };

  const handleVehicleChange = (id: string) => {
    setVehicleId(id);
    localStorage.setItem("uw_customer_vehicle", id);
    setShowVehicleDrawer(false);
  };

  return (
    <div className="min-h-screen bg-[#FAF9F7] pb-32">
      <header className="sticky top-0 z-50 bg-[#FAF9F7]/80 backdrop-blur-md px-4 py-4 flex items-center gap-4 border-b border-black/[0.03]">
        <button onClick={() => navigate({ to: "/c/home" })} className="p-1 active:scale-90 transition-transform">
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
        
        <button 
          onClick={() => setShowVehicleDrawer(true)}
          className="bg-white px-3 py-2 rounded-2xl border border-black/[0.04] shadow-sm flex items-center gap-2 shrink-0 active:scale-95 transition-transform"
        >
          <div className="w-5 h-5 flex items-center justify-center">
            <Car className="h-4 w-4 text-primary" />
          </div>
          <span className="text-[13px] font-bold text-charcoal max-w-[80px] truncate">{vehicle?.model || "Select Vehicle"}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </header>

      {service && (
        <div className="px-4 space-y-6 pt-2 max-w-md mx-auto">
          <div className="relative overflow-hidden rounded-[24px] aspect-[16/8] bg-white shadow-sm border border-black/[0.03]">
             {imageObj.url ? (
                <img src={imageObj.url} className="w-full h-full object-cover" alt={service.name} />
              ) : (
                <div className="w-full h-full bg-primary/5 flex items-center justify-center">
                  <Sparkles className="h-10 w-10 text-primary/15" />
                </div>
              )}
          </div>

          <div className="bg-white p-5 rounded-[24px] border border-black/[0.04] shadow-sm flex justify-between items-center">
            <div className="flex-1 pr-4">
              <h1 className="text-[20px] font-bold text-charcoal leading-tight">
                {service.name}
              </h1>
              <p className="text-[13px] text-muted-foreground mt-1">
                {description}
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

          {inclusions && inclusions.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-[15px] font-bold text-charcoal px-1">Service Includes</h2>
              <div className="grid grid-cols-4 gap-2">
                {inclusions.slice(0, 4).map((label, idx) => {
                  const icons = ["🚿", "🛞", "🪟", "🧺", "🧼", "✨"];
                  return (
                    <div key={label} className="flex flex-col items-center gap-3 py-4 px-1 text-center bg-white/40 border border-black/[0.02] rounded-[20px]">
                      <div className="text-[24px]">{icons[idx % icons.length]}</div>
                      <div className="text-[10px] font-bold text-charcoal leading-tight max-w-[60px]">{label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-white flex items-center gap-4 p-5 rounded-[24px] border border-black/[0.04] shadow-sm">
            <div className="h-10 w-10 rounded-full bg-[#FFF1E6] flex items-center justify-center shrink-0">
              <MapPin className="h-5 w-5 text-[#EA580C]" />
            </div>
            <div className="flex-grow min-w-0">
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">Service Location</div>
              <div className="text-[15px] font-bold text-charcoal truncate mt-0.5">
                {activeAddress ? `${activeAddress.label}: ${activeAddress.area}` : "No address set"}
              </div>
            </div>
            <button 
              onClick={() => navigate({ to: "/c/location/search" })}
              className="text-[13px] font-bold text-[#EA580C] uppercase tracking-wide active:opacity-60"
            >
              Change
            </button>
          </div>

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
                      "py-4 px-2 rounded-full border text-[12px] font-bold transition-all relative active:scale-95",
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

          {relevantAddons.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-end px-1">
                <div>
                  <h2 className="text-[15px] font-bold text-charcoal">Premium Add-ons</h2>
                  <p className="text-[12px] text-muted-foreground mt-0.5">Enhance your wash experience</p>
                </div>
                <button 
                  onClick={() => setShowAddonDrawer(true)}
                  className="text-[12px] font-bold text-[#EA580C] active:opacity-60"
                >
                  View all
                </button>
              </div>
              
              <div className="space-y-2">
                {relevantAddons.slice(0, 3).map(a => {
                  const price = isSUV ? a.price_sedan_suv : a.price_hatchback;
                  const isSelected = !!addonQty[a.id];
                  return (
                    <div 
                      key={a.id} 
                      onClick={() => handleAddonToggle(a.id)}
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-[22px] border transition-all active:scale-[0.98] cursor-pointer",
                        isSelected 
                          ? "bg-[#FFF8F4] border-[#EA580C]/20 shadow-sm" 
                          : "bg-white border-black/[0.04] shadow-sm"
                      )}
                    >
                       <div className="w-10 h-10 rounded-2xl bg-black/[0.02] flex items-center justify-center shrink-0 text-lg">
                         {a.name.includes("Roof") ? "🚿" : a.name.includes("Seat") ? "💺" : "✨"}
                       </div>
                       <div className="flex-1 min-w-0">
                         <div className="font-bold text-[14px] text-charcoal">{a.name}</div>
                         <div className="text-[12px] font-black text-[#EA580C] mt-0.5">₹{price}</div>
                       </div>
                       <div className={cn(
                         "h-5 w-5 rounded-md border flex items-center justify-center transition-colors",
                         isSelected ? "bg-[#EA580C] border-[#EA580C]" : "border-black/10 bg-white"
                       )}>
                         {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={4} />}
                       </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <h2 className="text-[15px] font-bold text-charcoal px-1">Bill Details</h2>
            <div className="bg-white p-6 rounded-[24px] border border-black/[0.04] shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[13px] text-muted-foreground font-medium">Service Amount</span>
                <span className="text-[13px] font-bold text-charcoal">₹{basePrice}</span>
              </div>
              
              {selectedAddons.map(a => (
                <div key={a.id} className="flex justify-between items-center animate-in fade-in slide-in-from-top-1 duration-200">
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

      <div className="fixed bottom-0 left-0 right-0 z-[60] bg-white p-5 pb-8 border-t border-black/[0.04] flex items-center justify-between safe-area-bottom shadow-[0_-8px_30px_rgba(0,0,0,0.04)]">
        <div>
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">TOTAL</div>
          <div className="text-[22px] font-black text-charcoal">₹{totalPayable}</div>
        </div>
        
        <Button 
          disabled={submitting}
          onClick={confirm}
          className="h-[58px] px-8 rounded-[20px] bg-[#EA580C] hover:bg-[#D44D0B] text-white font-black text-[15px] uppercase tracking-wider flex items-center gap-3 shadow-lg shadow-[#EA580C]/20 transition-all active:scale-[0.98]"
        >
          {submitting ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              Proceed to Pay
              <ChevronRight className="h-5 w-5" />
            </>
          )}
        </Button>
      </div>

      <Drawer open={showAddonDrawer} onOpenChange={setShowAddonDrawer}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="border-b border-black/[0.03] pb-4">
            <div className="flex items-center justify-between">
              <DrawerTitle className="text-xl font-bold">Premium Add-ons</DrawerTitle>
              <DrawerClose className="p-2 active:scale-90">
                <X className="h-6 w-6 text-muted-foreground" />
              </DrawerClose>
            </div>
          </DrawerHeader>
          <ScrollArea className="h-full overflow-y-auto px-4 py-6">
            <div className="space-y-3 pb-10">
              {relevantAddons.map(a => {
                const price = isSUV ? a.price_sedan_suv : a.price_hatchback;
                const isSelected = !!addonQty[a.id];
                return (
                  <div 
                    key={a.id} 
                    onClick={() => handleAddonToggle(a.id)}
                    className={cn(
                      "flex items-center gap-4 p-5 rounded-[24px] border transition-all active:scale-[0.98] cursor-pointer",
                      isSelected 
                        ? "bg-[#FFF8F4] border-[#EA580C]/20" 
                        : "bg-white border-black/[0.04]"
                    )}
                  >
                     <div className="w-12 h-12 rounded-2xl bg-black/[0.02] flex items-center justify-center shrink-0 text-2xl">
                       {a.name.includes("Roof") ? "🚿" : a.name.includes("Seat") ? "💺" : "✨"}
                     </div>
                     <div className="flex-1 min-w-0">
                       <div className="font-bold text-[16px] text-charcoal">{a.name}</div>
                       {a.description && <div className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">{a.description}</div>}
                       <div className="text-[14px] font-black text-[#EA580C] mt-1">₹{price}</div>
                     </div>
                     <div className={cn(
                       "h-6 w-6 rounded-lg border flex items-center justify-center transition-colors",
                       isSelected ? "bg-[#EA580C] border-[#EA580C]" : "border-black/10 bg-white"
                     )}>
                       {isSelected && <Check className="h-4 w-4 text-white" strokeWidth={4} />}
                     </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          <div className="p-5 border-t border-black/[0.03] bg-white">
            <Button 
              onClick={() => setShowAddonDrawer(false)}
              className="w-full h-14 rounded-2xl bg-[#EA580C] text-white font-bold"
            >
              Done
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={showVehicleDrawer} onOpenChange={setShowVehicleDrawer}>
        <DrawerContent>
          <DrawerHeader className="border-b border-black/[0.03] pb-4">
            <div className="flex items-center justify-between">
              <DrawerTitle className="text-xl font-bold">Select Vehicle</DrawerTitle>
              <DrawerClose className="p-2">
                <X className="h-6 w-6 text-muted-foreground" />
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="px-4 py-6 space-y-3 max-h-[60vh] overflow-y-auto">
            {vehicles.map(v => {
              const isSelected = v.id === vehicleId;
              return (
                <button
                  key={v.id}
                  onClick={() => handleVehicleChange(v.id)}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-[22px] border transition-all active:scale-[0.98]",
                    isSelected ? "bg-[#FFF8F4] border-[#EA580C]/20" : "bg-white border-black/[0.04]"
                  )}
                >
                  <div className="w-12 h-12 rounded-2xl bg-black/[0.02] flex items-center justify-center shrink-0">
                    <Car className={cn("h-6 w-6", isSelected ? "text-[#EA580C]" : "text-muted-foreground/40")} />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-bold text-[16px] text-charcoal">{v.make} {v.model}</div>
                    <div className="text-[12px] text-muted-foreground font-medium uppercase tracking-wider">{v.registration_number}</div>
                  </div>
                  {isSelected && (
                    <div className="h-6 w-6 rounded-full bg-[#EA580C] flex items-center justify-center">
                      <Check className="h-4 w-4 text-white" strokeWidth={4} />
                    </div>
                  )}
                </button>
              );
            })}
            
            <Button 
              variant="outline"
              onClick={() => navigate({ to: "/c/vehicles/add" })}
              className="w-full h-14 rounded-[22px] border-dashed border-2 flex items-center justify-center gap-2 mt-2"
            >
              <Plus className="h-5 w-5" />
              Add New Vehicle
            </Button>
          </div>
          <div className="p-6"></div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
