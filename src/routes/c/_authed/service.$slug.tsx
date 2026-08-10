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
  gallery_images: string[] | null;
  inclusions_json: Array<{ label: string; icon: string }> | null;
  benefits_json: Array<{ title: string; desc: string }> | null;
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
  const [slot, setSlot] = useState("");
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showAddonDrawer, setShowAddonDrawer] = useState(false);
  const [showVehicleDrawer, setShowVehicleDrawer] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, skipSnaps: false });

  const onSelect = useCallback((emblaApi: any) => {
    setCurrentPhotoIndex(emblaApi.selectedScrollSnap());
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect(emblaApi);
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
  }, [emblaApi, onSelect]);

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
    if (!service) return [];
    // If it's daily shine, maybe limit add-ons or show specific ones
    return allAddons.filter(a => !a.applies_to_slugs?.length || a.applies_to_slugs.includes(slug));
  }, [allAddons, slug, service]);

  const selectedAddons = useMemo(() => {
    return relevantAddons.filter(a => addonQty[a.id] > 0);
  }, [relevantAddons, addonQty]);

  const addonTotal = selectedAddons.reduce((sum, a) => sum + (isSUV ? a.price_sedan_suv : a.price_hatchback), 0);
  const totalPayable = basePrice + addonTotal;

  const imagesQ = useServiceImages();
  
  // Gallery Logic
  const galleryImages = useMemo(() => {
    if (service?.gallery_images && service.gallery_images.length > 0) {
      return service.gallery_images;
    }
    const fallback = getServiceImage(slug, imagesQ.data).url;
    return fallback ? [fallback] : [];
  }, [service, slug, imagesQ.data]);

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
    if (!slot) {
      toast.error("Please select a time slot");
      // Scroll to time slot section
      document.getElementById('time-slots')?.scrollIntoView({ behavior: 'smooth' });
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
      <header className="sticky top-0 z-[70] bg-[#FAF9F7]/90 backdrop-blur-md px-4 py-4 flex items-center gap-4 border-b border-black/[0.03]">
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
            <Car className="h-4 w-4 text-[#EA580C]" />
          </div>
          <span className="text-[13px] font-bold text-charcoal max-w-[80px] truncate">{vehicle?.model || "Select Vehicle"}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </header>

      {service && (
        <div className="space-y-6 pt-4 max-w-md mx-auto">
          {/* Photo Gallery */}
          <div className="px-4">
            <div className="relative group">
              <div className="overflow-hidden rounded-[28px] shadow-xl bg-white aspect-[2/1] border border-black/[0.02]" ref={emblaRef}>
                <div className="flex h-full">
                  {galleryImages.length > 0 ? (
                    galleryImages.map((img, i) => (
                      <div key={i} className="flex-[0_0_100%] min-w-0 h-full relative">
                        <img 
                          src={img} 
                          className="w-full h-full object-cover select-none" 
                          alt={`${service.name} ${i + 1}`}
                          loading={i === 0 ? "eager" : "lazy"}
                        />
                      </div>
                    ))
                  ) : (
                    <div className="flex-[0_0_100%] min-w-0 h-full flex items-center justify-center bg-primary/5">
                      <Sparkles className="h-12 w-12 text-primary/20" />
                    </div>
                  )}
                </div>
              </div>

              {/* Pagination Dots */}
              {galleryImages.length > 1 && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
                  {galleryImages.map((_, i) => (
                    <div 
                      key={i} 
                      className={cn(
                        "h-1.5 rounded-full transition-all duration-300",
                        currentPhotoIndex === i ? "w-4 bg-[#EA580C]" : "w-1.5 bg-white/50"
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="px-4">
            <div className="bg-white p-6 rounded-[28px] border border-black/[0.04] shadow-md flex justify-between items-start">
              <div className="flex-1 pr-4">
                <h1 className="text-[22px] font-black text-charcoal leading-tight">
                  {service.name}
                </h1>
                <p className="text-[14px] text-muted-foreground mt-2 leading-relaxed">
                  {description}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <div className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest bg-black/[0.04] px-3 py-1 rounded-full">
                    {isSubscription ? "MONTHLY" : "ONE-TIME"}
                  </div>
                  {isSubscription && (
                     <div className="flex items-center gap-1 text-[11px] font-bold text-[#EA580C]">
                       <ShieldCheck className="h-3 w-3" />
                       Quality Guarantee
                     </div>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[28px] font-black text-[#EA580C] leading-none">
                  ₹{basePrice}
                </div>
                <div className="text-[12px] font-bold text-muted-foreground/40 mt-1 uppercase tracking-tighter">
                  {isSubscription ? "per month" : "starting price"}
                </div>
              </div>
            </div>
          </div>

          {/* Service Inclusions */}
          <div className="space-y-4 px-4">
            <h2 className="text-[16px] font-black text-charcoal px-1 flex items-center gap-2">
              <Droplets className="h-4 w-4 text-[#EA580C]" />
              SERVICE INCLUDES
            </h2>
            <div className="grid grid-cols-4 gap-3">
              {(service.inclusions_json || []).length > 0 ? (
                service.inclusions_json?.map((item, idx) => {
                  const Icon = item.icon === 'exterior' ? ZapIcon : 
                              item.icon === 'interior' ? Wind : 
                              item.icon === 'tyre' ? Shield :
                              item.icon === 'glass' ? Search : 
                              item.icon === 'dashboard' ? Star : Droplets;
                  return (
                    <div key={idx} className="flex flex-col items-center gap-3 py-5 px-1 text-center bg-white border border-black/[0.04] rounded-[24px] shadow-sm transition-transform active:scale-95">
                      <div className="w-10 h-10 rounded-full bg-[#EA580C]/[0.05] flex items-center justify-center">
                        <Icon className="h-5 w-5 text-[#EA580C]" />
                      </div>
                      <div className="text-[11px] font-black text-charcoal leading-tight max-w-[65px]">{item.label}</div>
                    </div>
                  );
                })
              ) : (
                // Fallback for services without JSON inclusions
                inclusions?.map((label, idx) => (
                  <div key={idx} className="flex flex-col items-center gap-3 py-5 px-1 text-center bg-white border border-black/[0.04] rounded-[24px] shadow-sm">
                     <div className="w-10 h-10 rounded-full bg-[#EA580C]/[0.05] flex items-center justify-center">
                        <Sparkles className="h-5 w-5 text-[#EA580C]" />
                      </div>
                      <div className="text-[11px] font-black text-charcoal leading-tight max-w-[65px]">{label}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Location Selection */}
          <div className="px-4">
            <div className="bg-white flex items-center gap-4 p-5 rounded-[28px] border border-black/[0.04] shadow-md relative overflow-hidden">
              <div className="absolute left-0 top-0 w-1.5 h-full bg-[#EA580C]" />
              <div className="h-12 w-12 rounded-2xl bg-[#FFF1E6] flex items-center justify-center shrink-0 shadow-inner">
                <MapPin className="h-6 w-6 text-[#EA580C]" />
              </div>
              <div className="flex-grow min-w-0">
                <div className="text-[11px] font-black text-muted-foreground uppercase tracking-widest opacity-60">Service Location</div>
                <div className="text-[16px] font-bold text-charcoal truncate mt-0.5">
                  {activeAddress ? `${activeAddress.label}: ${activeAddress.area}` : "No address set"}
                </div>
              </div>
              <button 
                onClick={() => navigate({ to: "/c/location/search" })}
                className="text-[13px] font-black text-[#EA580C] uppercase tracking-widest active:opacity-60 bg-[#EA580C]/[0.08] px-4 py-2 rounded-xl"
              >
                Change
              </button>
            </div>
          </div>

          {/* Time Selection */}
          <div className="space-y-4 px-4" id="time-slots">
            <div className="px-1 flex items-end justify-between">
              <div>
                <h2 className="text-[16px] font-black text-charcoal flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-[#EA580C]" />
                  CHOOSE A TIME
                </h2>
                <p className="text-[12px] text-muted-foreground mt-0.5">Select your preferred time slot</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {TIME_SLOTS.map(s => {
                const isSelected = slot === s;
                return (
                  <button 
                    key={s} 
                    onClick={() => setSlot(s)} 
                    className={cn(
                      "py-5 px-2 rounded-[24px] border-2 text-[12px] font-black transition-all relative active:scale-95 shadow-sm",
                      isSelected 
                        ? "border-[#EA580C] bg-[#FFF8F4] text-[#EA580C]" 
                        : "border-black/[0.03] bg-white text-charcoal/80"
                    )}
                  >
                    {s}
                    {isSelected && (
                      <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-[#EA580C] flex items-center justify-center border-2 border-white shadow-md">
                        <Check className="h-3 w-3 text-white" strokeWidth={5} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Add-ons Section */}
          {relevantAddons.length > 0 && (
            <div className="space-y-4 px-4">
              <div className="flex justify-between items-end px-1">
                <div>
                  <h2 className="text-[16px] font-black text-charcoal flex items-center gap-2">
                    <Zap className="h-4 w-4 text-[#EA580C]" />
                    PREMIUM ADD-ONS
                  </h2>
                  <p className="text-[12px] text-muted-foreground mt-0.5">Enhance your wash experience</p>
                </div>
                <button 
                  onClick={() => setShowAddonDrawer(true)}
                  className="text-[13px] font-black text-[#EA580C] active:opacity-60 uppercase tracking-widest"
                >
                  View all
                </button>
              </div>
              
              <div className="space-y-3">
                {relevantAddons.slice(0, 3).map(a => {
                  const price = isSUV ? a.price_sedan_suv : a.price_hatchback;
                  const isSelected = !!addonQty[a.id];
                  return (
                    <div 
                      key={a.id} 
                      onClick={() => handleAddonToggle(a.id)}
                      className={cn(
                        "flex items-center gap-4 p-5 rounded-[28px] border-2 transition-all active:scale-[0.98] cursor-pointer shadow-sm",
                        isSelected 
                          ? "bg-[#FFF8F4] border-[#EA580C]/40 shadow-md" 
                          : "bg-white border-black/[0.04]"
                      )}
                    >
                       <div className="w-14 h-14 rounded-[20px] bg-black/[0.02] flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
                         {a.name.includes("Interior") ? <Wind className="h-6 w-6 text-[#EA580C]" /> : 
                          a.name.includes("Roof") ? <Droplets className="h-6 w-6 text-[#EA580C]" /> : 
                          a.name.includes("Seat") ? <Car className="h-6 w-6 text-[#EA580C]" /> : 
                          <Sparkles className="h-6 w-6 text-[#EA580C]" />}
                       </div>
                       <div className="flex-1 min-w-0">
                         <div className="font-black text-[16px] text-charcoal leading-tight">{a.name}</div>
                         <div className="text-[16px] font-black text-[#EA580C] mt-1">₹{price}</div>
                       </div>
                       <div className={cn(
                         "h-7 w-7 rounded-xl border-2 flex items-center justify-center transition-all",
                         isSelected ? "bg-[#EA580C] border-[#EA580C] shadow-lg shadow-[#EA580C]/20" : "border-black/10 bg-white"
                       )}>
                         {isSelected && <Check className="h-4 w-4 text-white" strokeWidth={5} />}
                       </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bill Details */}
          <div className="space-y-4 px-4">
            <h2 className="text-[16px] font-black text-charcoal px-1 flex items-center gap-2">
              <ZapIcon className="h-4 w-4 text-[#EA580C]" />
              BILL DETAILS
            </h2>
            <div className="bg-white p-7 rounded-[32px] border border-black/[0.04] shadow-lg space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[14px] text-muted-foreground font-bold">Service Amount</span>
                <span className="text-[14px] font-black text-charcoal">₹{basePrice}</span>
              </div>
              
              {selectedAddons.map(a => (
                <div key={a.id} className="flex justify-between items-center animate-in fade-in slide-in-from-top-1 duration-200">
                  <span className="text-[14px] text-muted-foreground font-bold">{a.name}</span>
                  <span className="text-[14px] font-black text-charcoal">₹{isSUV ? a.price_sedan_suv : a.price_hatchback}</span>
                </div>
              ))}

              <div className="h-px bg-black/[0.06] my-2" />
              
              <div className="flex justify-between items-center">
                <span className="text-[17px] font-black text-charcoal uppercase tracking-widest">Total Payable</span>
                <span className="text-[24px] font-black text-[#EA580C]">₹{totalPayable}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Payment Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-[80] bg-white p-6 pb-9 border-t border-black/[0.06] flex items-center justify-between safe-area-bottom shadow-[0_-12px_40px_rgba(0,0,0,0.08)]">
        <div>
          <div className="text-[11px] font-black text-muted-foreground uppercase tracking-widest mb-1 opacity-50">Total Amount</div>
          <div className="text-[26px] font-black text-charcoal leading-none">₹{totalPayable}</div>
        </div>
        
        <Button 
          disabled={submitting}
          onClick={confirm}
          className="h-[62px] px-10 rounded-[24px] bg-[#EA580C] hover:bg-[#D44D0B] text-white font-black text-[16px] uppercase tracking-[0.1em] flex items-center gap-3 shadow-xl shadow-[#EA580C]/30 transition-all active:scale-[0.96]"
        >
          {submitting ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <>
              PROCEED TO PAY
              <ArrowLeft className="h-5 w-5 rotate-180" strokeWidth={3} />
            </>
          )}
        </Button>
      </div>

      <Drawer open={showAddonDrawer} onOpenChange={setShowAddonDrawer}>
        <DrawerContent className="max-h-[85vh] rounded-t-[40px]">
          <DrawerHeader className="border-b border-black/[0.04] pb-6">
            <div className="flex items-center justify-between px-2">
              <DrawerTitle className="text-2xl font-black text-charcoal">Premium Add-ons</DrawerTitle>
              <DrawerClose className="p-2 active:scale-90 bg-black/[0.03] rounded-full">
                <X className="h-6 w-6 text-muted-foreground" />
              </DrawerClose>
            </div>
          </DrawerHeader>
          <ScrollArea className="h-full overflow-y-auto px-6 py-6">
            <div className="space-y-4 pb-20">
              {relevantAddons.map(a => {
                const price = isSUV ? a.price_sedan_suv : a.price_hatchback;
                const isSelected = !!addonQty[a.id];
                return (
                  <div 
                    key={a.id} 
                    onClick={() => handleAddonToggle(a.id)}
                    className={cn(
                      "flex items-center gap-5 p-6 rounded-[32px] border-2 transition-all active:scale-[0.98] cursor-pointer",
                      isSelected 
                        ? "bg-[#FFF8F4] border-[#EA580C]/40 shadow-md" 
                        : "bg-white border-black/[0.04] shadow-sm"
                    )}
                  >
                     <div className="w-16 h-16 rounded-[24px] bg-black/[0.02] flex items-center justify-center shrink-0 shadow-inner">
                        {a.name.includes("Interior") ? <Wind className="h-7 w-7 text-[#EA580C]" /> : 
                          a.name.includes("Roof") ? <Droplets className="h-7 w-7 text-[#EA580C]" /> : 
                          a.name.includes("Seat") ? <Car className="h-7 w-7 text-[#EA580C]" /> : 
                          <Sparkles className="h-7 w-7 text-[#EA580C]" />}
                     </div>
                     <div className="flex-1 min-w-0">
                       <div className="font-black text-[18px] text-charcoal">{a.name}</div>
                       {a.description && <div className="text-[13px] text-muted-foreground font-medium mt-1 line-clamp-2 leading-tight">{a.description}</div>}
                       <div className="text-[18px] font-black text-[#EA580C] mt-2">₹{price}</div>
                     </div>
                     <div className={cn(
                       "h-8 w-8 rounded-2xl border-2 flex items-center justify-center transition-all",
                       isSelected ? "bg-[#EA580C] border-[#EA580C] shadow-lg shadow-[#EA580C]/20" : "border-black/10 bg-white"
                     )}>
                       {isSelected && <Check className="h-4 w-4 text-white" strokeWidth={5} />}
                     </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          <div className="p-8 border-t border-black/[0.04] bg-white">
            <Button 
              onClick={() => setShowAddonDrawer(false)}
              className="w-full h-16 rounded-[24px] bg-[#EA580C] text-white font-black text-[17px] tracking-widest uppercase shadow-xl shadow-[#EA580C]/20"
            >
              SAVE SELECTION
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={showVehicleDrawer} onOpenChange={setShowVehicleDrawer}>
        <DrawerContent className="rounded-t-[40px]">
          <DrawerHeader className="border-b border-black/[0.04] pb-6">
            <div className="flex items-center justify-between px-2">
              <DrawerTitle className="text-2xl font-black text-charcoal">Select Vehicle</DrawerTitle>
              <DrawerClose className="p-2 bg-black/[0.03] rounded-full">
                <X className="h-6 w-6 text-muted-foreground" />
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="px-6 py-8 space-y-4 max-h-[60vh] overflow-y-auto">
            {vehicles.map(v => {
              const isSelected = v.id === vehicleId;
              return (
                <button
                  key={v.id}
                  onClick={() => handleVehicleChange(v.id)}
                  className={cn(
                    "w-full flex items-center gap-5 p-6 rounded-[32px] border-2 transition-all active:scale-[0.98]",
                    isSelected ? "bg-[#FFF8F4] border-[#EA580C]/40 shadow-md" : "bg-white border-black/[0.04] shadow-sm"
                  )}
                >
                  <div className="w-16 h-16 rounded-[24px] bg-black/[0.02] flex items-center justify-center shrink-0 shadow-inner">
                    <Car className={cn("h-8 w-8", isSelected ? "text-[#EA580C]" : "text-muted-foreground/30")} />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-black text-[18px] text-charcoal leading-none">{v.make}</div>
                    <div className="font-bold text-[16px] text-muted-foreground mt-1">{v.model}</div>
                    <div className="text-[12px] text-muted-foreground font-black uppercase tracking-[0.2em] mt-2 opacity-40">{v.registration_number}</div>
                  </div>
                  {isSelected && (
                    <div className="h-8 w-8 rounded-full bg-[#EA580C] flex items-center justify-center shadow-lg shadow-[#EA580C]/20">
                      <Check className="h-4 w-4 text-white" strokeWidth={5} />
                    </div>
                  )}
                </button>
              );
            })}
            
            <Button 
              variant="outline"
              onClick={() => navigate({ to: "/c/vehicles/add" })}
              className="w-full h-16 rounded-[32px] border-dashed border-2 flex items-center justify-center gap-3 mt-4 text-[16px] font-black tracking-widest uppercase text-muted-foreground/60"
            >
              <Plus className="h-5 w-5" />
              Add New Vehicle
            </Button>
          </div>
          <div className="p-8"></div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
