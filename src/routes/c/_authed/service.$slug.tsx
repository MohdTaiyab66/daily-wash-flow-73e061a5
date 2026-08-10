import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Check, Clock, ChevronRight, Loader2, Sparkles, MapPin } from "lucide-react";
import { useServiceImages, getServiceImage } from "@/lib/service-image-resolver";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { createRazorpayOrder, verifyRazorpayPayment } from "@/lib/payment.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Section, Surface } from "@/components/customer/ui/kit";
import { cn } from "@/lib/utils";
import { openRazorpayCheckout } from "@/lib/paymentBridge";

export const Route = createFileRoute("/c/_authed/service/$slug")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    vehicleId: z.string().optional().parse(search.vehicleId),
  }),
  head: () => ({ meta: [{ title: "Book service — Urban Wash" }] }),
  component: ServiceDetail,
});

type Service = { id: string; slug: string; name: string; description: string; price_hatchback: number; price_sedan_suv: number; service_type: string; includes_hatchback: string[] | null; includes_sedan_suv: string[] | null; };
type Vehicle = { id: string; make: string; model: string; category: string; };
type Addon = { id: string; name: string; price_hatchback: number; price_sedan_suv: number; applies_to_slugs: string[] };

const TIME_SLOTS = ["Before 7 AM", "Before 8 AM", "Before 9 AM", "Before 10 AM", "Before 11 AM", "Before 12 PM"];

function ServiceDetail() {
  const { slug } = useParams({ from: "/c/_authed/service/$slug" });
  const navigate = useNavigate();
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [slot, setSlot] = useState(TIME_SLOTS[3]);
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [billExpanded, setBillExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const serviceQ = useQuery({ queryKey: ["service", slug], queryFn: async () => { const { data } = await (supabase as any).from("service_catalog").select("*").eq("slug", slug).maybeSingle(); return data as Service | null; } });
  const vehiclesQ = useQuery({ queryKey: ["customer-vehicles"], queryFn: async () => { const { data } = await (supabase as any).from("customer_vehicles").select("*"); return (data ?? []) as Vehicle[]; } });
  const addonsQ = useQuery({ queryKey: ["service-addons", slug], queryFn: async () => { const { data } = await (supabase as any).from("service_addons").select("*").eq("active", true); return ((data ?? []) as Addon[]).filter((a) => !a.applies_to_slugs?.length || a.applies_to_slugs.includes(slug)); } });

  const service = serviceQ.data;
  const vehicle = vehiclesQ.data?.find(v => v.id === vehicleId) ?? vehiclesQ.data?.[0];
  const isSUV = vehicle?.category === "sedan_suv";
  const basePrice = service ? (isSUV ? service.price_sedan_suv : service.price_hatchback) : 0;
  const addonTotal = addonsQ.data?.filter(a => addonQty[a.id]).reduce((sum, a) => sum + (isSUV ? a.price_sedan_suv : a.price_hatchback), 0) ?? 0;
  const totalPayable = basePrice + addonTotal;

  const imagesQ = useServiceImages();
  const imageObj = getServiceImage(slug, imagesQ.data);

  const confirm = async () => {
    if (!service || !vehicle) return;
    setSubmitting(true);
    try {
      const { data: bId, error } = await (supabase as any).rpc("confirm_customer_booking", {
        p_service_id: service.id, p_vehicle_id: vehicle.id, p_scheduled_date: new Date().toISOString().slice(0, 10), p_scheduled_time: slot, p_addons: Object.entries(addonQty).filter(([_, q]) => q > 0).map(([id]) => ({ id, quantity: 1 })),
      });
      if (error) throw error;
      
      const order = await useServerFn(createRazorpayOrder)({ data: { bookingId: bId } });
      const result = await openRazorpayCheckout({ keyId: order.keyId, orderId: order.orderId, amount: order.amount, currency: "INR", description: service.name, bookingId: bId });
      
      if (result.status === "success") {
        await useServerFn(verifyRazorpayPayment)({ data: { bookingId: bId, razorpayOrderId: result.orderId, razorpayPaymentId: result.paymentId, razorpaySignature: result.signature } });
        navigate({ to: "/c/booking-success", search: { bookingId: bId } });
      }
    } catch (e: any) { toast.error(e.message); } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-[#FFF9F3] pb-40">
      <header className="sticky top-0 z-20 bg-[#FFF9F3]/90 backdrop-blur flex items-center px-4 py-3">
        <button onClick={() => navigate({ to: "/c/home" })} className="p-2 rounded-full bg-white shadow-sm border"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="ml-3 font-black text-[17px] truncate">{service?.name}</h1>
      </header>

      {service && (
        <div className="px-4 space-y-6 pt-4">
          {imageObj.url && <img src={imageObj.url} className="w-full aspect-[16/9] object-cover rounded-2xl shadow-sm" />}
          
          <div>
            <div className="text-[10px] font-[800] uppercase tracking-widest text-primary mb-1">✦ PREMIUM SERVICE</div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-[24px] font-black">{service.name}</h2>
              <span className="text-[20px] font-black text-primary">₹{basePrice}</span>
            </div>
          </div>

          <Section title="What's included">
            <div className="space-y-2">
              {(isSUV ? service.includes_sedan_suv : service.includes_hatchback)?.map((item: string) => (
                <div key={item} className="flex items-center gap-2 text-[14px] font-bold"><Check className="h-4 w-4 text-primary" /> {item}</div>
              ))}
            </div>
          </Section>

          <Section title="Choose a time">
            <div className="grid grid-cols-2 gap-2">
              {TIME_SLOTS.map(s => (
                <button key={s} onClick={() => setSlot(s)} className={cn("py-3 rounded-xl border text-[12px] font-black", slot === s ? "border-primary bg-primary/10 text-primary" : "bg-white")}>{s}</button>
              ))}
            </div>
          </Section>

          <Section title="Add more to your service">
            {addonsQ.data?.map(a => {
              const price = isSUV ? a.price_sedan_suv : a.price_hatchback;
              return (
                <Surface key={a.id} className="flex justify-between items-center my-2 p-3">
                  <div><div className="font-black text-[14px]">{a.name}</div><div className="text-[12px] font-bold text-primary">₹{price}</div></div>
                  <Button onClick={() => setAddonQty(p => ({...p, [a.id]: p[a.id] ? 0 : 1}))} className={cn("rounded-lg h-9 text-[12px] font-black", addonQty[a.id] ? "bg-success" : "bg-primary")}>
                    {addonQty[a.id] ? "✓ Added" : "+ Add"}
                  </Button>
                </Surface>
              );
            })}
          </Section>

          <Section title="Your Services">
            <div className="flex justify-between text-[14px] font-black"><div>{service.name}</div><div>₹{basePrice}</div></div>
            {addonsQ.data?.filter(a => addonQty[a.id]).map(a => (
                <div key={a.id} className="flex justify-between text-[14px] font-black"><div>{a.name}</div><div>₹{isSUV ? a.price_sedan_suv : a.price_hatchback}</div></div>
            ))}
          </Section>

          <Section>
             <button onClick={() => setBillExpanded(!billExpanded)} className="flex items-center justify-between w-full font-black">Bill Details <ChevronRight /></button>
             {billExpanded && <div className="p-4 bg-white rounded-xl mt-2 font-black text-[14px]">Total: ₹{totalPayable}</div>}
          </Section>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white p-4 border-t shadow-lg flex items-center justify-between">
        <div className="font-black">Total Payable<div className="text-[20px] text-primary">₹{totalPayable}</div></div>
        <Button onClick={confirm} className="h-12 w-40 rounded-xl font-black">PAY ₹{totalPayable}</Button>
      </div>
    </div>
  );
}
