import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { resolveDailyShinePrice } from "@/lib/pricing";
import { useState, useMemo, useEffect, useCallback } from "react";
import { 
  ArrowLeft, Check, ChevronRight, Loader2, Sparkles, Car, X, ZapIcon as ZapIconLucide,
  Plus, Minus, ShoppingCart, Waves, Droplet, Wind, ShieldCheck, Thermometer, UserCheck, CalendarDays, ClipboardCheck
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
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import useEmblaCarousel from 'embla-carousel-react';
import { useCartStore } from "@/lib/cart-store";
import { APK_EVIDENCE } from "@/lib/apkEvidence";


const serviceSearchSchema = z.object({
  vehicleId: z.string().optional(),
});

export const Route = createFileRoute("/c/_authed/service/$slug")({
  ssr: false,
  validateSearch: (search) => serviceSearchSchema.parse(search),
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
  benefits_json: Array<{ label: string }> | null;
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

  useEffect(() => {
    // Check session silently, do not trigger global state resets
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        console.warn("[SERVICE] No valid session on mount");
      }
    });
  }, []);
  
  const createOrder = useServerFn(createRazorpayOrder);
  const verifyPayment = useServerFn(verifyRazorpayPayment);
  
  const [vehicleId, setVehicleId] = useState<string | null>(search.vehicleId || null);
  const [slot, setSlot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showAddonDrawer, setShowAddonDrawer] = useState(false);
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  const [diag, setDiag] = useState<{
    open: boolean;
    steps: Array<{
      id: string;
      label: string;
      status: 'pending' | 'ok' | 'err';
      time?: string;
      error?: string;
      details?: string;
    }>;
    orderInfo?: {
      id: string;
      amount: number;
    };
  }>({
    open: false,
    steps: [
      { id: 'click', label: '1. PAY NOW CLICKED', status: 'pending' },
      { id: 'validation', label: '2. VALIDATION', status: 'pending' },
      { id: 'rpc', label: '3. CONFIRM CUSTOMER BOOKING RPC', status: 'pending' },
      { id: 'order', label: '4. RAZORPAY ORDER CREATION', status: 'pending' },
      { id: 'orderId', label: '5. ORDER ID RECEIVED', status: 'pending' },
      { id: 'bridge', label: '6. CAPACITOR BRIDGE CALLED', status: 'pending' },
      { id: 'plugin', label: '7. URBANWASHCHECKOUT NATIVE PLUGIN RECEIVED', status: 'pending' },
      { id: 'sdk_call', label: '8. RAZORPAY SDK OPEN CALLED', status: 'pending' },
      { id: 'ui_open', label: '9. RAZORPAY CHECKOUT OPENED', status: 'pending' },
      { id: 'result', label: '10. PAYMENT RESULT', status: 'pending' },
    ]
  });

  const updateDiagStep = (id: string, status: 'ok' | 'err', error?: string, details?: string) => {
    setDiag(prev => ({
      ...prev,
      steps: prev.steps.map(s => 
        s.id === id ? { ...s, status, time: new Date().toLocaleTimeString(), error, details } : s
      )
    }));
  };

  const { items: cartItems, updateQuantity, setBaseService } = useCartStore();

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
      console.log("[SERVICE] QUERY_START slug=", slug);
      const { data, error } = await supabase.from("service_catalog").select("*").eq("slug", slug).maybeSingle();
      if (error) {
        console.error("[SERVICE] QUERY_ERROR", error);
        throw error;
      }
      console.log("[SERVICE] QUERY_SUCCESS", data?.name);
      return data as Service | null;
    },
    retry: 1,
    staleTime: 5 * 60 * 1000
  });

  const vehiclesQ = useQuery({
    queryKey: ["customer-vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_vehicles").select("*");
      if (error) console.error("[SERVICE] VEHICLES_ERROR", error);
      return (data ?? []) as Vehicle[];
    }
  });

  const addressesQ = useQuery({
    queryKey: ["customer-addresses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_addresses").select("*");
      if (error) console.error("[SERVICE] ADDRESSES_ERROR", error);
      return (data ?? []) as Address[];
    }
  });

  const addonsQ = useQuery({
    queryKey: ["service-addons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_addons").select("*").eq("active", true).order("sort_order");
      if (error) console.error("[SERVICE] ADDONS_ERROR", error);
      return (data ?? []) as Addon[];
    }
  });

  const profileQ = useQuery({
    queryKey: ["customer-profile"],
    queryFn: async () => {
      // Use the canonical session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user?.id) {
        console.warn("[SERVICE] No user session found for profile query");
        return null;
      }
      
      const { data, error } = await supabase
        .from("customer_profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();
        
      if (error) {
        console.error("[SERVICE] Profile data fetch failed:", error);
        return null;
      }
      return data;
    },
    retry: 1
  });

  const service = serviceQ.data;
  const vehicles = vehiclesQ.data ?? [];
  const activeAddress = addressesQ.data?.find(a => a.is_default) ?? addressesQ.data?.[0];
  const profile = profileQ.data;

  const vehicle = useMemo(() => vehicles.find(v => v.id === (vehicleId || search.vehicleId)) || vehicles[0], [vehicles, vehicleId, search.vehicleId]);
  const category = vehicle?.category;
  const isSUV = category === "sedan_suv";
  
  // Initialize base service in cart when loaded or vehicle category changes
  useEffect(() => {
    if (service && vehicle) {
      const price = resolveDailyShinePrice(category, service);
      console.log("[PRICE-TRACE-06] service detail price =", price);
      console.log("[PRICE-TRACE-08] cart price updated =", price);

      console.log("[DAILY-SHINE-PRICE]", {
        vehicleId: vehicle.id,
        vehicleModel: vehicle.model,
        vehicleCategory: vehicle.category,
        package: service.slug,
        resolvedPrice: price,
        priceSource: "SERVICE_CATALOG_DETAIL"
      });
      setBaseService(service.id, service.name, price);
    }
  }, [service, category, vehicle?.id, setBaseService]);

  const relevantAddons = useMemo(() => addonsQ.data?.filter(a => !a.applies_to_slugs?.length || a.applies_to_slugs.includes(slug)) || [], [addonsQ.data, slug]);
  
  const cartAddons = cartItems.filter(i => i.type === 'addon');
  const totalPayable = useMemo(() => cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0), [cartItems]);
  const totalItems = useMemo(() => cartItems.reduce((sum, i) => sum + i.quantity, 0), [cartItems]);


  const galleryQ = useServiceGallery(slug);
  const galleryImages = useMemo(() => {
    const items = galleryQ.data || [];
    return items.length > 0 ? items.map((i: any) => i.image_url) : (getServiceImage(slug).url ? [getServiceImage(slug).url] : []);
  }, [galleryQ.data, slug]);

  const confirm = async () => {
    setDiag(prev => ({
      ...prev,
      open: true,
      steps: prev.steps.map(s => ({ ...s, status: 'pending', error: undefined, time: undefined })),
      orderInfo: undefined
    }));

    updateDiagStep('click', 'ok');
    console.log("[PAY_NOW] APK Evidence:", APK_EVIDENCE.version);


    if (totalPayable <= 0) {
      updateDiagStep('validation', 'err', 'Cart is empty');
      toast.error("Cart is empty.");
      return;
    }

    if (!service || !vehicle || !activeAddress || !slot) {
      updateDiagStep('validation', 'err', !slot ? "Time slot missing" : "Selections incomplete");
      toast.error(!slot ? "Please select a time slot." : "Please complete all selections.");
      return;
    }

    updateDiagStep('validation', 'ok');
    setSubmitting(true);

    try {
      console.log("[PAY_NOW] Invoking confirm_customer_booking", {
        p_service_id: service.id,
        p_vehicle_id: vehicle.id,
        p_address_id: activeAddress.id,
        p_scheduled_date: new Date().toISOString().slice(0, 10),
        p_scheduled_time: slot,
        p_addons: cartAddons.map(a => ({ id: a.id, quantity: a.quantity })),
      });
      
      const { data: bId, error: rpcErr } = await supabase.rpc("confirm_customer_booking", {
        p_service_id: service.id,
        p_vehicle_id: vehicle.id,
        p_address_id: activeAddress.id,
        p_scheduled_date: new Date().toISOString().slice(0, 10),
        p_scheduled_time: slot,
        p_addons: cartAddons.map(a => ({ id: a.id, quantity: a.quantity })),
      });
      
      if (rpcErr) {
        console.error("[PAY_NOW] RPC ERROR:", rpcErr);
        updateDiagStep('rpc', 'err', rpcErr.message || JSON.stringify(rpcErr));
        throw new Error(rpcErr.message || "Booking creation failed (RPC)");
      }
      
      if (!bId) {
        console.error("[PAY_NOW] RPC SUCCESS BUT NO ID RETURNED");
        updateDiagStep('rpc', 'err', "No booking ID returned");
        throw new Error("Booking creation failed: No ID returned from server");
      }
      
      console.log("[PAY_NOW] RPC SUCCESS:", bId);
      updateDiagStep('rpc', 'ok');

      console.log("[PAYMENT] ORDER_CREATION_START", { bookingId: bId });
      let order;
      try {
        order = await createOrder({ data: { bookingId: bId } });
        console.log("[PAYMENT] ORDER_CREATION_SUCCESS", { orderId: order.orderId });
        updateDiagStep('order', 'ok');
      } catch (err: any) {
        console.error("[PAYMENT] ORDER_CREATION_FAILED", err);
        updateDiagStep('order', 'err', err.message);
        throw err;
      }
      
      if (!order.orderId) {
        updateDiagStep('orderId', 'err', 'Order ID missing from response');
        throw new Error("Order creation failed: No Order ID");
      }
      
      setDiag(prev => ({ ...prev, orderInfo: { id: order.orderId, amount: order.amount } }));
      updateDiagStep('orderId', 'ok');

      updateDiagStep('bridge', 'ok');
      
      const result = await openRazorpayCheckout({ 
        keyId: order.keyId, 
        orderId: order.orderId, 
        amount: order.amount, 
        currency: "INR", 
        description: service.name, 
        bookingId: bId,
        prefillEmail: profile?.email || undefined,
        prefillContact: profile?.phone || undefined,
        onOpened: () => {

          updateDiagStep('plugin', 'ok');
          updateDiagStep('sdk_call', 'ok');
          updateDiagStep('ui_open', 'ok');
        }
      });

      if (result.status === "success") {
        updateDiagStep('result', 'ok', undefined, 'SUCCESS');
        try {
          await verifyPayment({ 
            data: { 
              bookingId: bId, 
              razorpayOrderId: result.orderId, 
              razorpayPaymentId: result.paymentId, 
              razorpaySignature: result.signature 
            } 
          });
          navigate({ to: "/c/booking-success", search: { bookingId: bId } });
        } catch (vErr: any) {
          toast.error("Payment verification failed. Please contact support.");
        }
      } else if (result.status === "failed") {
        updateDiagStep('result', 'err', result.message, 'FAILED');
        toast.error(result.message || "Payment failed.");
      } else {
        updateDiagStep('result', 'ok', undefined, 'CANCELLED');
      }
    } catch (e: any) {
      console.error("[PAY_NOW] critical_exception:", e);
      // Find the specific step that failed and mark it
      setDiag(prev => {
        const steps = [...prev.steps];
        
        // Find the RPC step to see if it failed
        const rpcStepIndex = steps.findIndex(s => s.id === 'rpc');
        if (rpcStepIndex !== -1 && steps[rpcStepIndex].status === 'err') {
          // If RPC failed, ensure subsequent steps are NOT shown as failed with this error
          return {
            ...prev,
            steps: steps.map((s, idx) => {
              if (idx > rpcStepIndex) return { ...s, status: 'pending', error: undefined };
              return s;
            })
          };
        }

        // Generic fallback: mark first pending as error
        const firstPendingIndex = steps.findIndex(s => s.status === 'pending');
        if (firstPendingIndex !== -1) {
          return {
            ...prev,
            steps: steps.map((s, idx) => 
              idx === firstPendingIndex ? { ...s, status: 'err', error: e.message } : s
            )
          };
        }
        return prev;
      });
      toast.error(e.message || "Booking failed");
    } finally { 
      setSubmitting(false); 
    }
  };

  const getAddonQty = (id: string) => cartItems.find(i => i.id === id)?.quantity || 0;

  const QuantityControl = ({ id, name, price, type }: { id: string, name: string, price: number, type: 'base' | 'addon' }) => {
    const qty = getAddonQty(id);
    
    const handleDecrease = (e: React.MouseEvent) => {
      e.stopPropagation();
      updateQuantity(id, Math.max(type === 'base' ? 1 : 0, qty - 1));
    };

    const handleIncrease = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (qty === 0) {
        useCartStore.getState().addItem({ id, name, price, quantity: 1, type });
      } else {
        updateQuantity(id, qty + 1);
      }
    };

    return (
      <div className="flex items-center gap-3 bg-[#F1F2F3] rounded-full px-2 py-1 border border-black/5">
        <button 
          onClick={handleDecrease}
          disabled={type === 'base' && qty <= 1}
          className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90",
            type === 'base' && qty <= 1 ? "text-black/10" : "text-[#1a1a1a] hover:bg-black/5"
          )}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="text-[13px] font-black min-w-[12px] text-center">{qty}</span>
        <button 
          onClick={handleIncrease}
          className="w-7 h-7 rounded-full flex items-center justify-center text-[#EA580C] hover:bg-[#EA580C]/5 transition-all active:scale-90"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  };


  if (serviceQ.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF9F7]">
        <div className="flex flex-col items-center gap-4 text-center px-6">
          <Loader2 className="h-10 w-10 animate-spin text-[#EA580C]" />
          <p className="text-[12px] font-bold text-[#1a1a1a]/60 uppercase tracking-widest">Loading Service Details...</p>
        </div>
      </div>
    );
  }

  if (serviceQ.isError || !service) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF9F7] px-6">
        <div className="text-center">
          <h2 className="text-[18px] font-black text-[#1a1a1a] mb-2">Couldn't load service details</h2>
          <p className="text-[14px] text-[#7A7A7A] mb-6">Something went wrong while fetching the service information.</p>
          <Button 
            onClick={() => serviceQ.refetch()}
            className="bg-[#EA580C] text-white rounded-full font-black px-8"
          >
            Try Again
          </Button>
          <Button 
            variant="ghost"
            onClick={() => navigate({ to: "/c/home" })}
            className="mt-4 block w-full text-[#7A7A7A] font-bold"
          >
            Back to Home
          </Button>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-[#FAF9F7] pb-[180px]">
      <header className="sticky top-0 z-[70] bg-[#FAF9F7]/90 backdrop-blur-md px-6 h-[64px] flex items-center gap-3 border-b border-black/[0.03]">
        <button onClick={() => navigate({ to: "/c/home" })} className="p-2 -ml-2 rounded-full active:bg-black/5 transition-colors">
          <ArrowLeft className="h-6 w-6 text-[#1a1a1a]" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[20px] font-black text-[#1a1a1a] truncate leading-tight">{service.name}</h1>
        </div>
      </header>

      {/* Service Image Gallery: Responsive card */}
      <div className="px-6 pt-6 w-full box-border">
        <div className="overflow-hidden rounded-[18px] border border-[#2D2D2D]/8 shadow-sm bg-white relative w-full aspect-[2/1]" ref={emblaRef}>
          <div className="flex h-full">
             {galleryImages.map((img, i) => (
               <div key={i} className="flex-[0_0_100%] w-full h-full">
                 <img src={img} className="w-full h-full object-cover" alt={`${service.name} ${i + 1}`} />
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


      <div className="px-6 mt-6 space-y-5 max-w-full">
        {/* Service Card */}
        <div className="bg-white p-5 rounded-[16px] border border-black/[0.05] shadow-sm w-full box-border">
           <div className="flex justify-between items-start gap-3 mb-2">
              <h1 className="text-[18px] font-black text-[#1a1a1a] leading-tight break-words">{service.name}</h1>
              <div className="text-[18px] font-black text-[#EA580C] shrink-0">₹{cartItems.find(i => i.type === 'base')?.price || 0}</div>
           </div>
           <p className="text-[12px] font-bold text-[#EA580C] uppercase tracking-wider">{service.service_type === 'subscription' ? 'PER MONTH' : 'ONE-TIME'}</p>
           <p className="text-[13px] text-[#7A7A7A] mt-2 leading-relaxed">{service.description}</p>
        </div>

        {/* Dynamic Includes */}
        {service.inclusions_json && (
          <div className="bg-white p-5 rounded-[16px] border border-black/[0.05] shadow-sm grid grid-cols-3 gap-y-5 gap-x-2 w-full box-border">
            {service.inclusions_json.map((item, i) => {
              const label = item.label.toLowerCase();
              const Icon = 
                label.includes('pressure') ? Waves :
                label.includes('wash') ? Droplet :
                label.includes('polish') ? Sparkles :
                label.includes('wax') ? Sparkles :
                label.includes('vacuum') ? Wind :
                label.includes('cleaning') ? Wind :
                label.includes('tyre') ? Car :
                label.includes('dashboard') ? Car :
                label.includes('fragrance') ? Sparkles :
                label.includes('doorstep') ? Car :
                label.includes('scheduled') ? CalendarDays :
                label.includes('assurance') ? ShieldCheck :
                label.includes('exterior') ? Droplet :
                ZapIconLucide;
              
              return (
                <div key={i} className="flex flex-col items-center text-center gap-2 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#FFF2ED] flex items-center justify-center text-[#EA580C]">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase leading-tight text-[#1a1a1a] break-words w-full px-1">{item.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Location & Time */}
        <div className="bg-white p-5 rounded-[16px] border border-black/[0.05] shadow-sm w-full box-border">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[14px] font-bold text-[#1a1a1a]">📍 {activeAddress?.label || "Home"}</span>
            <Button variant="link" className="text-[#EA580C] p-0 h-auto font-bold text-[12px]" onClick={() => navigate({ to: "/c/location/search", search: { returnTo: window.location.pathname + window.location.search } })}>CHANGE</Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {TIME_SLOTS.map(t => (
              <button key={t} onClick={() => setSlot(t)} className={cn("py-2 rounded-lg border font-bold text-[10px] transition-all", slot === t ? "bg-[#FFF2ED] border-[#EA580C] text-[#EA580C]" : "bg-white border-black/[0.05] text-[#1a1a1a]")}>{t}</button>
            ))}
          </div>
        </div>

        {/* Premium Add-ons */}
        {relevantAddons.length > 0 && (
          <div className="bg-white p-5 rounded-[16px] border border-black/[0.05] shadow-sm w-full box-border">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[14px] font-black text-[#1a1a1a] uppercase">Premium Add-ons</h3>
              <Button variant="link" className="text-[#EA580C] font-bold text-[12px] p-0" onClick={() => setShowAddonDrawer(true)}>VIEW ALL</Button>
            </div>
            <div className="space-y-4">
              {relevantAddons.slice(0, 3).map(a => {
                const price = isSUV ? a.price_sedan_suv : a.price_hatchback;
                return (
                  <div key={a.id} className="flex items-center justify-between gap-3 p-1">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-[#FFF2ED] flex items-center justify-center text-[#EA580C] shrink-0 border border-[#EA580C]/10"><ZapIconLucide className="h-4.5 w-4.5" /></div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-black text-[#1a1a1a] truncate">{a.name}</div>
                        <div className="text-[11px] font-black text-[#EA580C]">₹{price}</div>
                      </div>
                    </div>
                    <QuantityControl id={a.id} name={a.name} price={price} type="addon" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bill Details */}
        <div className="bg-white p-5 rounded-[16px] border border-black/[0.05] shadow-sm w-full box-border mb-8">
          <h3 className="text-[12px] font-black text-[#7A7A7A] mb-4 uppercase tracking-widest">Bill Details</h3>
          <div className="space-y-2">
            {cartItems.map(item => (
              <div key={item.id} className="flex justify-between text-[13px]">
                <span className={cn(item.type === 'base' ? "text-[#1a1a1a] font-medium" : "text-[#7A7A7A] truncate")}>
                  {item.name} {item.quantity > 1 && `× ${item.quantity}`}
                </span>
                <span className="font-bold text-[#1a1a1a]">₹{item.price * item.quantity}</span>
              </div>
            ))}
            <div className="pt-3 mt-2 border-t flex justify-between items-center text-[15px]"><span className="font-black text-[#1a1a1a]">TOTAL</span><span className="font-black text-[#EA580C]">₹{totalPayable}</span></div>
          </div>
        </div>
      </div>

      <Drawer open={showAddonDrawer} onOpenChange={setShowAddonDrawer}>
        <DrawerContent className="h-[90vh] flex flex-col">
          <DrawerHeader className="px-6 pt-6 flex justify-between items-center shrink-0">
            <DrawerTitle className="text-[16px] font-black uppercase">SELECT ADD-ONS</DrawerTitle>
            <button onClick={() => setShowAddonDrawer(false)} className="p-2 -mr-2 text-[#7A7A7A] active:scale-90 transition-transform">
              <X className="h-5 w-5" />
            </button>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-6">
            <div className="space-y-4 pb-[160px]">
              {relevantAddons.map(a => {
                const price = isSUV ? a.price_sedan_suv : a.price_hatchback;
                return (
                  <div key={a.id} className="flex items-center justify-between p-4 bg-[#F1F2F3]/50 rounded-xl border border-black/5">
                    <div className="flex items-center gap-3 min-w-0 mr-4">
                      <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-[#EA580C] shrink-0 border border-[#EA580C]/10"><ZapIconLucide className="h-4.5 w-4.5" /></div>
                      <div className="min-w-0">
                        <div className="font-black text-[13px] truncate text-[#1a1a1a]">{a.name}</div>
                        <div className="text-[11px] font-black text-[#EA580C]">₹{price}</div>
                      </div>
                    </div>
                    <QuantityControl id={a.id} name={a.name} price={price} type="addon" />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="p-4 pt-6 border-t bg-white shrink-0 shadow-[0_-8px_20px_rgba(0,0,0,0.05)]">
             <div className="flex justify-between items-center mb-4 px-2 font-black"><span className="text-[13px] uppercase tracking-wider text-[#7A7A7A]">CURRENT TOTAL</span><span className="text-[#EA580C] text-[20px]">₹{totalPayable}</span></div>
             <Button className="w-full h-[54px] rounded-[16px] bg-[#EA580C] text-white font-black text-[15px]" onClick={() => setShowAddonDrawer(false)}>DONE</Button>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={showCartDrawer} onOpenChange={setShowCartDrawer}>
        <DrawerContent className="h-[70vh] flex flex-col">
          <DrawerHeader className="px-6 pt-6 flex justify-between items-center shrink-0">
            <DrawerTitle className="text-[16px] font-black uppercase flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> CART</DrawerTitle>
            <button onClick={() => setShowCartDrawer(false)} className="p-2 -mr-2 text-[#7A7A7A] active:scale-90 transition-transform">
              <X className="h-5 w-5" />
            </button>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-6">
            <div className="space-y-4 pb-[160px]">
              {cartItems.map(item => (
                <div key={item.id} className="flex items-center justify-between p-4 bg-[#F1F2F3]/50 rounded-xl">
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="font-bold text-[14px] truncate">{item.name}</div>
                    <div className="text-[12px] font-bold text-[#EA580C]">₹{item.price} per unit</div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <QuantityControl id={item.id} name={item.name} price={item.price} type={item.type} />
                    <div className="text-[13px] font-black text-[#1a1a1a]">₹{item.price * item.quantity}</div>
                  </div>
                </div>
              ))}
              <div className="p-4 border-t border-black/5 space-y-2 mt-2">
                <div className="flex justify-between text-[14px]"><span className="text-[#7A7A7A]">Subtotal</span><span className="font-bold">₹{totalPayable}</span></div>
                <div className="flex justify-between text-[16px] font-black"><span className="text-[#1a1a1a]">TOTAL</span><span className="text-[#EA580C]">₹{totalPayable}</span></div>
              </div>
            </div>
          </div>
          <div className="p-4 pt-6 border-t bg-white shrink-0 shadow-[0_-8px_20px_rgba(0,0,0,0.05)]">
             <Button className="w-full h-[54px] rounded-[16px] bg-[#EA580C] text-white font-black text-[15px]" onClick={() => { setShowCartDrawer(false); confirm(); }}>PROCEED TO PAY</Button>
          </div>
        </DrawerContent>
      </Drawer>

      <div className="fixed bottom-0 left-0 right-0 z-[80] w-full flex flex-col pointer-events-none pb-[env(safe-area-inset-bottom,16px)]">
        {/* Compact Cart Bar */}
        {!showAddonDrawer && !showCartDrawer && totalItems > 0 && (
          <div className="px-6 mb-3 pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
            <button 
              onClick={() => setShowCartDrawer(true)}
              className="w-full bg-[#1a1a1a] text-white h-[56px] rounded-[24px] px-5 flex items-center justify-between shadow-[0_12px_35px_rgba(0,0,0,0.35)] active:scale-[0.98] transition-all border border-white/5"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                  <ShoppingCart className="h-3.5 w-3.5" />
                </div>
                <div className="flex items-center gap-3 leading-tight">
                  <span className="text-[11px] font-[900] uppercase tracking-[0.1em] text-white/50">{totalItems} {totalItems === 1 ? 'ITEM' : 'ITEMS'}</span>
                  <div className="w-[1px] h-3 bg-white/20" />
                  <span className="text-[15px] font-[900] text-[#FF6B00]">₹{totalPayable}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full">
                <span className="text-[10px] font-[900] uppercase tracking-widest">VIEW CART</span>
                <ChevronRight className="h-3 w-3" />
              </div>
            </button>
          </div>
        )}

        {/* Payment Footer */}
        <div className="bg-white border-t border-black/[0.05] p-6 flex justify-between items-center shadow-[0_-12px_40px_rgba(0,0,0,0.08)] pointer-events-auto gap-4 min-h-[88px]">
          <div className="flex flex-col min-w-0">
            <span className="text-[9px] font-[900] text-[#7A7A7A] uppercase tracking-[0.18em] mb-0.5">TOTAL PAYABLE</span>
            <div className="text-[24px] font-[900] text-[#1a1a1a] leading-none tracking-tight">₹{totalPayable}</div>
          </div>
          <Button 
            onClick={(e) => {
              // Stop any potential parent clicks or form submissions
              e.preventDefault();
              e.stopPropagation();
              console.log("[PAY_NOW] button_physical_click_received", { 
                submitting, 
                hasSlot: !!slot,
                pointerEvents: window.getComputedStyle(e.currentTarget).pointerEvents,
                zIndex: window.getComputedStyle(e.currentTarget).zIndex
              });
              confirm();
            }}
            disabled={submitting || !slot}
            className={cn(
              "h-[54px] w-[180px] rounded-[18px] bg-[#EA580C] text-white font-[900] text-[15px] active:scale-[0.96] transition-all shadow-[0_8px_25px_rgba(234,88,12,0.25)] relative z-[99]",
              (submitting || !slot) && "opacity-50 grayscale shadow-none"
            )}
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : (
              <span className="flex items-center gap-2 pointer-events-none">
                PAY NOW <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Diagnostic Panel */}
      <Drawer open={diag.open} onOpenChange={(o) => setDiag(prev => ({ ...prev, open: o }))} dismissible={true}>
        <DrawerContent className="max-h-[90vh] bg-[#0A0A0A] text-white font-mono p-6 border-t border-white/10">
          <DrawerHeader className="p-0 mb-4 flex justify-between items-center border-b border-white/10 pb-4">
            <div className="flex flex-col">
              <DrawerTitle className="text-white text-[14px] font-black uppercase tracking-widest">DEVICE DIAGNOSTICS</DrawerTitle>
              <span className="text-[10px] text-[#4ade80] font-bold mt-1">REAL-TIME EXECUTION TRACE</span>
            </div>
            <button onClick={() => setDiag(prev => ({ ...prev, open: false }))} className="p-2 -mr-2 text-white/30 active:scale-90"><X className="h-5 w-5" /></button>
          </DrawerHeader>

          <div className="space-y-3 overflow-y-auto pb-12 pr-1">
            {diag.orderInfo && (
              <div className="bg-white/5 border border-white/10 p-3 rounded-xl mb-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] text-white/40 font-bold uppercase">ORDER ID</span>
                  <span className="text-[11px] text-[#4ade80] font-black">{diag.orderInfo.id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-white/40 font-bold uppercase">AMOUNT</span>
                  <span className="text-[11px] text-white font-black">₹{diag.orderInfo.amount / 100} (INR)</span>
                </div>
              </div>
            )}

            {diag.steps.map((step, idx) => (
              <div key={step.id} className={cn(
                "flex flex-col gap-1 p-2 rounded-lg transition-colors",
                step.status === 'pending' ? "opacity-30" : "bg-white/5"
              )}>
                <div className="flex items-center justify-between">
                  <span className={cn(
                    "text-[12px] font-bold",
                    step.status === 'ok' ? "text-white" : 
                    step.status === 'err' ? "text-[#f87171]" : "text-white/60"
                  )}>
                    {step.label}
                  </span>
                  <div className="flex items-center gap-2">
                    {step.time && <span className="text-[9px] text-white/30">{step.time}</span>}
                    <span className={cn(
                      "text-[11px] font-black w-5 h-5 flex items-center justify-center rounded-full",
                      step.status === 'ok' ? "bg-[#4ade80]/20 text-[#4ade80]" : 
                      step.status === 'err' ? "bg-[#f87171]/20 text-[#f87171]" : "bg-white/10 text-white/20"
                    )}>
                      {step.status === 'ok' ? '✓' : step.status === 'err' ? '✗' : '...'}
                    </span>
                  </div>
                </div>
                {step.error && (
                  <div className="text-[10px] text-[#f87171]/80 leading-tight pl-0 mt-1 font-medium bg-[#f87171]/5 p-2 rounded border border-[#f87171]/10">
                    ERR: {step.error}
                  </div>
                )}
                {step.details && (
                  <div className="text-[10px] text-[#4ade80]/80 font-black tracking-widest mt-0.5">
                    {step.details}
                  </div>
                )}
              </div>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

    </div>
  );
}
