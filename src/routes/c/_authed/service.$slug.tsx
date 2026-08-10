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
        <div className="flex-1">
          <div className="text-[17px] font-bold text-charcoal truncate">{service.name}</div>
          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">DETAILS</div>
        </div>
        <button onClick={() => setShowVehicleDrawer(true)} className="bg-white px-3 py-2 rounded-2xl border flex items-center gap-2">
          <Car className="h-4 w-4 text-[#EA580C]" />
          <span className="text-[13px] font-bold text-charcoal truncate max-w-[80px]">{vehicle?.model || "Select"}</span>
        </button>
      </header>

      {/* Gallery */}
      <div className="px-4 pt-4">
        <div className="overflow-hidden rounded-[28px] shadow-xl border border-black/[0.02]" ref={emblaRef}>
          <div className="flex h-[300px]">
             {galleryImages.map((img, i) => <img key={i} src={img} className="flex-[0_0_100%] w-full h-full object-cover" />)}
          </div>
        </div>
        <div className="flex justify-center gap-1.5 mt-4">
          {galleryImages.map((_, i) => <div key={i} className={cn("h-1.5 w-1.5 rounded-full", currentPhotoIndex === i ? "bg-[#EA580C]" : "bg-black/10")} />)}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 mt-6 space-y-6">
        <div className="bg-white p-6 rounded-[28px] border shadow-sm">
           <div className="flex justify-between items-start">
              <h1 className="text-[22px] font-black text-charcoal">{service.name}</h1>
              <div className="text-[24px] font-black text-[#EA580C]">₹{basePrice}</div>
           </div>
           <p className="text-[14px] text-muted-foreground mt-2">{service.description}</p>
        </div>

        {/* Includes */}
        {service.inclusions_json && (
          <div className="bg-white p-6 rounded-[28px] border shadow-sm grid grid-cols-4 gap-4">
            {service.inclusions_json.map((item, i) => (
              <div key={i} className="flex flex-col items-center text-center gap-2">
                <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center text-[#EA580C]">
                  {item.icon === 'exterior' ? <ZapIconLucide /> : <Sparkles />}
                </div>
                <span className="text-[10px] font-bold uppercase">{item.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Location & Time */}
        <div className="bg-white p-6 rounded-[28px] border shadow-sm">
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold text-charcoal">Location: {activeAddress?.label || "Home"}</span>
            <Button variant="link" onClick={() => navigate({ to: "/c/location/search" })}>Change</Button>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {TIME_SLOTS.map(t => (
              <button key={t} onClick={() => setSlot(t)} className={cn("py-3 rounded-xl border font-bold text-[11px]", slot === t ? "bg-orange-50 border-orange-200" : "bg-white")}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Payment Footer */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-white border-t flex justify-between items-center shadow-lg">
        <div className="text-[22px] font-black text-charcoal">₹{totalPayable}</div>
        <Button onClick={confirm} className="h-14 px-8 rounded-2xl bg-[#EA580C]">PAY NOW</Button>
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
