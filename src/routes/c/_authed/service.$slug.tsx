import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect, useCallback } from "react";
import { 
  ArrowLeft, Check, Clock, ChevronRight, Loader2, Sparkles, MapPin, 
  Car, ShieldCheck, ChevronDown, Info,
  Zap,
  Droplets,
  ZapIcon,
  Wind,
  Shield,
  Search,
  CalendarClock,
  X,
  ZapIcon as ZapIconLucide
} from "lucide-react";
import { getServiceImage, useServiceGallery } from "@/lib/service-image-resolver";
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
  inclusions_json: Array<{ label: string; icon: string }> | null;
  gallery_images: string[] | null;
};

type Vehicle = {
  id: string;
  make: string;
  model: string;
  category: string;
  registration_number: string;
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

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });

  const onSelect = useCallback((api: any) => {
    setCurrentPhotoIndex(api.selectedScrollSnap());
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect(emblaApi);
    emblaApi.on('select', onSelect);
  }, [emblaApi, onSelect]);

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
  const vehicle = useMemo(() => vehicles.find(v => v.id === (vehicleId || search.vehicleId)) || vehicles[0], [vehicles, vehicleId, search.vehicleId]);
  const isSUV = vehicle?.category === "sedan_suv";
  const basePrice = service ? (isSUV ? service.price_sedan_suv : service.price_hatchback) : 0;
  const relevantAddons = useMemo(() => addonsQ.data?.filter(a => !a.applies_to_slugs?.length || a.applies_to_slugs.includes(slug)) || [], [addonsQ.data, slug]);
  const selectedAddons = useMemo(() => relevantAddons.filter(a => addonQty[a.id] > 0), [relevantAddons, addonQty]);
  const addonTotal = selectedAddons.reduce((sum, a) => sum + (isSUV ? a.price_sedan_suv : a.price_hatchback), 0);
  const totalPayable = basePrice + addonTotal;

  const galleryQ = useServiceGallery(slug);
  const galleryImages = useMemo(() => {
    const items = galleryQ.data || [];
    return items.length > 0 ? items.map((i: any) => i.image_url) : (getServiceImage(slug).url ? [getServiceImage(slug).url] : []);
  }, [galleryQ.data, slug]);

  const confirm = async () => {
    if (!service || !vehicle || !activeAddress || !slot) {
      toast.error("Please complete all selections.");
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
      const result = await openRazorpayCheckout({ keyId: order.keyId, orderId: order.orderId, amount: order.amount, currency: "INR", description: service.name, bookingId: bId });
      if (result.status === "success") {
        await useServerFn(verifyRazorpayPayment)({ data: { bookingId: bId, razorpayOrderId: result.orderId, razorpayPaymentId: result.paymentId, razorpaySignature: result.signature } });
        navigate({ to: "/c/booking-success", search: { bookingId: bId } });
      }
    } catch (e: any) {
      toast.error(e.message || "Booking failed");
    } finally { setSubmitting(false); }
  };

  if (!service) return <div className="p-10 text-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#FAF9F7] pb-32">
       {/* Premium Header */}
      <header className="sticky top-0 z-[70] bg-[#FAF9F7]/90 backdrop-blur-md px-4 py-4 flex items-center gap-4 border-b border-black/[0.03]">
        <button onClick={() => navigate({ to: "/c/home" })} className="p-1"><ArrowLeft className="h-6 w-6 text-charcoal" /></button>
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-bold text-charcoal truncate">{service.name}</div>
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">DETAILS</div>
        </div>
        <button onClick={() => setShowVehicleDrawer(true)} className="bg-white px-3 py-2 rounded-2xl border flex items-center gap-2 shrink-0 max-w-[120px]">
          <Car className="h-4 w-4 text-[#EA580C]" />
          <span className="text-[13px] font-bold text-charcoal truncate">{vehicle?.model || "Select"}</span>
        </button>
      </header>

      {/* Gallery */}
      <div className="px-4 pt-4 w-full box-border">
        <div className="overflow-hidden rounded-[24px] shadow-lg border border-black/[0.02] bg-white relative w-full" ref={emblaRef}>
          <div className="flex h-[240px] sm:h-[300px]">
             {galleryImages.map((img, i) => (
               <div key={i} className="flex-[0_0_100%] min-w-0 w-full h-full">
                 <img src={img} className="w-full h-full object-cover" alt={`${service.name} gallery ${i + 1}`} />
               </div>
             ))}
          </div>
        </div>
        {galleryImages.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-3">
            {galleryImages.map((_, i) => <div key={i} className={cn("h-1.5 transition-all duration-300 rounded-full", currentPhotoIndex === i ? "w-4 bg-[#EA580C]" : "w-1.5 bg-black/10")} />)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-4 mt-6 space-y-6 max-w-full">
        <div className="bg-white p-6 rounded-[28px] border shadow-sm w-full box-border">
           <div className="flex justify-between items-start gap-3">
              <h1 className="text-[20px] font-black text-charcoal leading-tight flex-1 break-words min-w-0">{service.name}</h1>
              <div className="text-[22px] font-black text-[#EA580C] shrink-0">₹{basePrice}</div>
           </div>
           <p className="text-[14px] text-muted-foreground mt-2 line-clamp-3">{service.description}</p>
        </div>

        {/* Includes */}
        {service.inclusions_json && (
          <div className="bg-white p-6 rounded-[28px] border shadow-sm grid grid-cols-4 gap-2 w-full box-border">
            {service.inclusions_json.slice(0, 4).map((item, i) => (
              <div key={i} className="flex flex-col items-center text-center gap-2 min-w-0">
                <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-[#EA580C] shrink-0">
                  {item.icon === 'exterior' ? <ZapIconLucide className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
                </div>
                <span className="text-[9px] font-bold uppercase leading-tight truncate w-full">{item.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Location & Time */}
        <div className="bg-white p-6 rounded-[28px] border shadow-sm w-full box-border">
          <div className="flex justify-between items-center gap-2">
            <span className="text-sm font-bold text-charcoal truncate flex-1">📍 {activeAddress?.label || "Home"}</span>
            <Button variant="link" className="text-[#EA580C] p-0 h-auto font-bold text-xs shrink-0" onClick={() => navigate({ to: "/c/location/search" })}>CHANGE</Button>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {TIME_SLOTS.map(t => (
              <button 
                key={t} 
                onClick={() => setSlot(t)} 
                className={cn(
                  "py-2.5 rounded-xl border font-bold text-[10px] transition-all", 
                  slot === t ? "bg-orange-50 border-[#EA580C] text-[#EA580C]" : "bg-white border-black/[0.05] text-charcoal"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Payment Footer */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-8 bg-white border-t border-black/[0.05] flex justify-between items-center shadow-[0_-4px_20px_rgba(0,0,0,0.03)] z-[80] w-full box-border">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">TOTAL</span>
          <div className="text-[24px] font-black text-charcoal leading-none">₹{totalPayable}</div>
        </div>
        <Button 
          onClick={confirm} 
          disabled={submitting}
          className="h-[54px] px-8 rounded-full bg-[#EA580C] hover:bg-[#EA580C]/90 text-white font-bold text-[15px] shadow-lg shadow-[#EA580C]/20 shrink-0 min-w-[140px]"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "PAY NOW →"}
        </Button>
      </div>

      <Drawer open={showVehicleDrawer} onOpenChange={setShowVehicleDrawer}>
        <DrawerContent>
           <DrawerHeader><DrawerTitle>Select Vehicle</DrawerTitle></DrawerHeader>
           <div className="p-4 space-y-2">
             {vehicles.map(v => (
               <Button key={v.id} variant="outline" className="w-full justify-start" onClick={() => { setVehicleId(v.id); setShowVehicleDrawer(false); }}>{v.model} - {v.registration_number}</Button>
             ))}
           </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
