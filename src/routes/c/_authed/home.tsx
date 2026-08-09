import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Car } from "lucide-react";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  MapPin,
  Plus,
  ChevronRight,
  Sparkles,
  Droplets,
  Wrench,
  ShowerHead,
  ChevronDown,
  BellRing,
  Check,
  Pencil,
  Bell,
  Camera,
  Image as ImageIcon,
} from "lucide-react";
import { useServiceImages, getServiceImage } from "@/lib/service-image-resolver";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAreaAvailability, isServiceAllowed } from "@/lib/area-availability";
import { vehicleBodyLabel } from "@/lib/vehicle-category";
import { VehicleAvatar } from "@/components/VehicleAvatar";
import { toast } from "sonner";
import { EditVehicleDialog, ChangePhotoDialog } from "@/components/customer/EditVehicleInline";
import { useVehicleImageUrl } from "@/lib/vehicle-image";
import { PullToRefresh } from "@/components/customer/ui/PullToRefresh";
import { SkeletonCard, Shimmer } from "@/components/customer/ui/Skeletons";
import { UWHeader } from "@/components/customer/ui/UWHeader";
import { UWFeaturedCarousel } from "@/components/customer/ui/UWFeaturedCarousel";
import { UWServiceCard } from "@/components/customer/ui/UWServiceCard";
import { UWPlanCard } from "@/components/customer/ui/UWPlanCard";
import { ListGroup, ListRow, Section, StatusChip, Surface } from "@/components/customer/ui/kit";
import { cn } from "@/lib/utils";
import { BookAWashSheet } from "@/components/customer/BookAWashSheet";
import { DEFAULT_PROMO_IMAGES } from "@/lib/promo.constants";
import { BUILD_VERSION } from "@/lib/build-info";




export const Route = createFileRoute("/c/_authed/home")({
  ssr: false,
  head: () => ({ meta: [{ title: "Home — Urban Wash" }] }),
  component: CustomerHome,
});

type Vehicle = {
  id: string;
  make: string;
  model: string;
  category: string;
  registration_number: string;
  color: string | null;
  image_path: string | null;
};
type Service = {
  id: string;
  slug: string;
  name: string;
  description: string;
  banner_url: string | null;
  price_hatchback: number;
  price_sedan_suv: number;
  service_type: string;
  sort_order: number;
  duration_minutes: number | null;
};

const SERVICE_ICON: Record<string, LucideIcon> = {
  "daily-shine": Sparkles,
  "one-time-wash-basic": Droplets,
  "one-time-wash-premium": ShowerHead,
  "deep-clean": Wrench,
  "interior-deep-clean": Wrench,
  daily_shine: Sparkles,
  one_time_basic: Droplets,
  one_time_plus: ShowerHead,
  deep_clean: Wrench,
  interior_deep: Wrench,
};

const PLAN_INCLUDED_SERVICE_SLUGS = ["daily-shine-exterior", "daily-shine-interior", "daily-shine-dusting"];

function CustomerHome() {
  const navigate = useNavigate();
  const [area, setArea] = useState<string>("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("Popular");
  const [vehicleSheetOpen, setVehicleSheetOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);

  useEffect(() => {
    const savedArea = localStorage.getItem("uw_customer_area") ?? "";
    setArea(savedArea);
    setSelectedVehicleId(localStorage.getItem("uw_customer_vehicle") ?? null);
  }, []);

  const vehiclesQ = useQuery({
    queryKey: ["customer-vehicles"],
    queryFn: async (): Promise<Vehicle[]> => {
      const { data, error } = await supabase.from("customer_vehicles").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as Vehicle[];
    },
  });

  const servicesQ = useQuery({
    queryKey: ["service-catalog"],
    queryFn: async (): Promise<Service[]> => {
      const { data, error } = await supabase.from("service_catalog").select("*").eq("active", true).order("sort_order");
      if (error) throw error;
      return (data ?? []) as Service[];
    },
  });

  const qc = useQueryClient();

  const profileQ = useQuery({
    queryKey: ["customer-profile-name"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await (supabase as any).from("customer_profiles").select("full_name").eq("user_id", u.user.id).maybeSingle();
      return {
        id: u.user.id,
        fullName: (data?.full_name as string | undefined) ?? null
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const userId = profileQ.data?.id ?? null;
  


  const unreadQ = useQuery({
    queryKey: ["customer-notifications-unread"],
    queryFn: async (): Promise<number> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return 0;
      const { count } = await supabase.from("customer_notifications").select("id", { count: "exact", head: true }).is("read_at", null);
      return count ?? 0;
    },
    refetchInterval: 60000,
  });

  const subStatusQ = useQuery({
    queryKey: ["customer-subscription-status", selectedVehicleId],
    queryFn: async (): Promise<string | null> => {
      const { data } = await (supabase as any).from("subscriptions").select("status,vehicle_id,created_at").order("created_at", { ascending: false }).limit(20);
      const rows = (data ?? []) as Array<{ status: string; vehicle_id: string | null }>;
      if (rows.length === 0) return null;
      const mine = selectedVehicleId ? rows.filter((r) => r.vehicle_id === selectedVehicleId) : rows;
      const pick = mine.find((r) => r.status === "active") ?? mine.find((r) => r.status === "payment_pending") ?? mine[0];
      return pick?.status ?? null;
    },
  });

  const vehicles = vehiclesQ.data ?? [];
  const vehicleId = selectedVehicleId;
  const activeVehicle = vehicles.find((v) => v.id === selectedVehicleId) ?? vehicles[0];
  const category = activeVehicle?.category ?? "hatchback_compact_sedan";
  const bodyLabel = activeVehicle ? vehicleBodyLabel(activeVehicle.make, activeVehicle.model, activeVehicle.category) : "";

  const catalogImageQ = useVehicleImageUrl({
    make: activeVehicle?.make,
    model: activeVehicle?.model,
    imagePath: activeVehicle?.image_path,
    transform: { width: 480, height: 360, quality: 72, resize: "cover" },
  });

  const pickVehicle = (id: string) => {
    setSelectedVehicleId(id);
    localStorage.setItem("uw_customer_vehicle", id);
    setVehicleSheetOpen(false);
  };

  const priceFor = (s: Service) => category === "sedan_suv" ? s.price_sedan_suv : s.price_hatchback;
  const services = servicesQ.data ?? [];
  const subscription = services.find((s) => s.service_type === "subscription");
  const oneTime = services.filter((s) => s.service_type !== "subscription" && !PLAN_INCLUDED_SERVICE_SLUGS.includes(s.slug));

  const filteredServices = oneTime.filter((s) => {
    if (selectedCategory === "Popular") return true; // Popular = ALL active/published services
    if (selectedCategory === "Wash") return s.slug.includes("wash");
    if (selectedCategory === "Interior") return s.slug.includes("interior") || s.slug.includes("clean") || s.slug.includes("dusting");
    if (selectedCategory === "Polish") return s.slug.includes("polish") || s.slug.includes("scratch");
    if (selectedCategory === "Detailing") return s.slug.includes("premium") || s.slug.includes("full") || s.slug.includes("polish");
    return true;
  });

  const availability = useAreaAvailability();
  const a = availability.data;
  const showCatalog = !area || (a && (a.daily_shine || a.premium));

  const nameToProcess = typeof profileQ.data === 'object' && profileQ.data !== null ? (profileQ.data.fullName ?? "") : "";
  const firstName = nameToProcess.trim().split(/\s+/)[0] || "there";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const unread = unreadQ.data ?? 0;
  const subStatus = subStatusQ.data;
  const planActive = subStatus === "active";
  const planPending = subStatus === "payment_pending";

  const bookingsQ = useQuery({
    queryKey: ["customer-bookings-all", userId, selectedVehicleId],
    enabled: !!selectedVehicleId,
    queryFn: async (): Promise<any[]> => {
      const { data, error } = await (supabase as any)
        .from("bookings")
        .select("id, scheduled_date, status, payment_status, total_amount, base_amount, addon_amount, service_id, vehicle_id, service_catalog:service_id(name, service_type, slug)")
        .eq("vehicle_id", selectedVehicleId)
        .order("scheduled_date", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const allBookings = bookingsQ.data ?? [];
  const activeSub = allBookings.find(
    (b) => b.service_catalog?.service_type === "subscription" && b.payment_status === "paid" && b.status !== "cancelled"
  );
  
  const planStart = activeSub ? new Date(activeSub.scheduled_date) : null;
  const planEnd = planStart ? new Date(planStart.getTime() + 28 * 24 * 60 * 60 * 1000) : null;
  const daysLeft = planEnd ? Math.max(0, Math.ceil((planEnd.getTime() - new Date().getTime()) / 86400000)) : 0;
  const expiringSoon = daysLeft > 0 && daysLeft <= 7;


  const latestNoticeQ = useQuery({
    queryKey: ["customer-latest-service-notice", selectedVehicleId],
    enabled: !!selectedVehicleId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("dirty_vehicle_reports")
        .select(`
          id,
          created_at,
          service:services!inner(vehicle_id)
        `)
        .eq("services.vehicle_id", selectedVehicleId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;
      return data?.[0] || null;
    },
  });

  const imagesQ = useQuery({
    queryKey: ["customer-promo-images"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("daily_shine_carousel")
        .select("*")
        .eq("status", "published")
        .order("slide_number");
      if (error) throw error;
      
      // Transform paths to public URLs if they are not already full URLs
      return data.map((img: any) => {
        let imageUrl = img.image_url;
        if (imageUrl && !imageUrl.startsWith('http')) {
          const { data: urlData } = supabase.storage
            .from(img.bucket_name || 'service-photography')
            .getPublicUrl(imageUrl);
          imageUrl = urlData.publicUrl;
        }
        return { ...img, image_url: imageUrl };
      });
    },
  });

  const serviceImagesQ = useServiceImages();

  const resolvedServiceImage = (slug: string) => {
    return getServiceImage(slug, serviceImagesQ.data);
  };



  useEffect(() => {
    latestNoticeQ.refetch();
  }, [selectedVehicleId]);

  const refreshAll = () => Promise.all([
    vehiclesQ.refetch(), 
    servicesQ.refetch(), 
    subStatusQ.refetch(), 
    unreadQ.refetch(), 
    latestNoticeQ.refetch(),
    serviceImagesQ.refetch()
  ]);

  return (
    <PullToRefresh onRefresh={refreshAll}>
      <div className="min-h-screen bg-[#FFF9F3] pb-24">
        <UWHeader 
          greeting={greeting} 
          firstName={firstName} 
          area={area} 
          unread={unread} 
          onAreaClick={() => { try { localStorage.removeItem("uw_customer_area"); } catch {} if (typeof window !== "undefined") window.location.href = "/c?change=1"; }}
        />

        <div className="px-5 py-2 text-[8px] font-mono text-muted-foreground/40 text-center">
          Build: {BUILD_VERSION} | DB: {import.meta.env.VITE_SUPABASE_URL?.split('.')[0].split('//')[1]}
        </div>

        <div className="px-5 space-y-5">
          {/* Active Vehicle Section - Compact Context Row */}
          <Section className="mt-[-12px]">
            {vehiclesQ.isLoading ? (
              <SkeletonCard className="h-16" />
            ) : activeVehicle ? (
              <Surface 
                className="overflow-hidden p-3 border-primary/10 bg-white"
                onClick={() => (vehicles.length > 1 ? setVehicleSheetOpen(true) : setEditOpen(true))}
              >
                <div className="flex w-full items-center gap-3">
                  <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded-lg bg-[#F8F9FB]">
                    <VehicleAvatar 
                      imageUrl={catalogImageQ.data} 
                      make={activeVehicle.make} 
                      model={activeVehicle.model} 
                      color={activeVehicle.color} 
                      className="h-full w-full object-contain p-1" 
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <h2 className="truncate text-[15px] font-black tracking-tight text-foreground">{activeVehicle.make} {activeVehicle.model}</h2>
                      <ChevronDown className="h-3 w-3 text-muted-foreground/40" />
                    </div>
                    <p className="truncate text-[11px] font-bold text-muted-foreground/70 uppercase tracking-tight">{activeVehicle.registration_number} · {bodyLabel}</p>
                  </div>
                </div>
              </Surface>
            ) : (
              <Surface 
                onClick={() => navigate({ to: "/c/vehicles/add" })}
                className="flex items-center gap-4 border-dashed border-primary/30 bg-primary/5 p-4"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-white shadow-lg shadow-primary/20"><Plus className="h-5 w-5" /></div>
                <div><span className="block text-[14px] font-black text-[#1a1a1a]">Add your car</span><span className="mt-0.5 block text-[11px] font-medium text-muted-foreground">Prices vary by vehicle size</span></div>
              </Surface>
            )}
          </Section>

          <div className="mt-[-12px]">
            {/* DAILY_SHINE_RENDER_TEST: Marker for APK verification */}
            <UWFeaturedCarousel 
              items={(imagesQ.data?.length ? imagesQ.data : DEFAULT_PROMO_IMAGES).map((img: any, idx: number) => {
                const linkedService = services.find(s => s.slug === img.service_slug);
                const bust = img.updated_at ? new Date(img.updated_at).getTime() : Date.now();
                
                // Ensure image URL is valid and has cache busting
                let finalImage = img.image_url || (DEFAULT_PROMO_IMAGES[idx % DEFAULT_PROMO_IMAGES.length] as any).image;
                if (finalImage && finalImage.includes('supabase.co')) {
                  const separator = finalImage.includes('?') ? '&' : '?';
                  finalImage = `${finalImage}${separator}v=${bust}`;
                }

                console.log(`[UW_CAROUSEL_DEBUG] slide=${img.slide_number || idx + 1} url=${finalImage}`);

                return {
                  id: img.id || `static-${idx}`,
                  title: img.title || linkedService?.name || "Daily Shine",
                  subtitle: img.subtitle || linkedService?.description || "Your car, clean every morning.",
                  price: linkedService ? priceFor(linkedService) : priceFor(subscription || { price_hatchback: 1199, price_sedan_suv: 1199 } as any),
                  image: finalImage,
                  link: img.service_slug ? `/c/service/${img.service_slug}` : "/c/service/daily-shine",
                  slideNumber: img.slide_number || idx + 1
                };
              })}
              onItemClick={(item) => navigate({ to: item.link as any })}
            />
          </div>



          {/* Vehicle Notice (Dirty) - Isolated below featured */}
          {latestNoticeQ.data && activeVehicle && (
            <Surface className="border-primary/20 p-5 bg-white mb-2">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[15px] font-black tracking-tight text-foreground">Vehicle needs attention</h3>
                    <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-wider">
                      {new Date(latestNoticeQ.data.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] font-medium leading-relaxed text-muted-foreground/80">
                    A cleaner reported that your vehicle needs extra attention. Would you like to schedule a deep clean?
                  </p>
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="mt-4 w-full bg-primary text-white hover:bg-primary/90 rounded-2xl h-11 text-[14px] font-black shadow-lg shadow-primary/20"
                    onClick={() => setBookOpen(true)}
                  >
                    Schedule a wash
                  </Button>
                </div>
              </div>
            </Surface>
          )}

          <Section 
            title="Car care services"
            className="mt-4"
          >
            <div className="flex items-center gap-2 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-none">
              {["Popular", "Wash", "Interior", "Polish", "Detailing"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "whitespace-nowrap rounded-full px-5 py-2 text-[13px] font-bold transition-all duration-200",
                    selectedCategory === cat 
                      ? "bg-[#FF6B00] text-white shadow-lg shadow-[#FF6B00]/20" 
                      : "bg-white text-[#1a1a1a] border border-border/50"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-[12px]">
              {servicesQ.isLoading ? (
                [1, 2, 3, 4].map(i => <SkeletonCard key={i} className="aspect-[4/5]" />)
              ) : filteredServices.map((s) => (
                <UWServiceCard
                  key={s.id}
                  name={s.name}
                  price={priceFor(s)}
                  image={resolvedServiceImage(s.slug).url || undefined}
                  slug={s.slug}
                  // Removed debugInfo

                  badge={s.slug.includes('premium') ? 'Premium' : undefined}
                  onAdd={() => navigate({ to: "/c/service/$slug", params: { slug: s.slug }, search: { vehicleId: vehicleId ?? undefined } })}
                />
              ))}

            </div>
          </Section>
          {showCatalog && (
            <>
              <div className="py-8 flex items-center justify-center gap-6 safe-area-bottom">
                <TrustItem label="Expert Care" />
                <div className="h-1 w-1 rounded-full bg-muted-foreground/20" />
                <TrustItem label="Photo Proof" />
                <div className="h-1 w-1 rounded-full bg-muted-foreground/20" />
                <TrustItem label="Safe & Secure" />
              </div>
              <Section className="pb-10 -mt-4">
                <Surface className="bg-[#FF6B00]/5 border-[#FF6B00]/10 p-5">
                  <div className="text-[14px] font-black text-[#1a1a1a]">Trust Urban Wash</div>
                  <div className="mt-1 text-[12px] font-medium text-muted-foreground/70 text-balance">Premium doorstep car care you can trust every day.</div>
                </Surface>
              </Section>

            </>
          )}
        </div>

        <Dialog open={vehicleSheetOpen} onOpenChange={setVehicleSheetOpen}>
          <DialogContent className="max-w-md rounded-3xl">
            <DialogHeader><DialogTitle>Your vehicles</DialogTitle></DialogHeader>
            <div className="space-y-2">
              {vehicles.map((v) => {
                const isActive = v.id === activeVehicle?.id;
                return (
                  <button key={v.id} onClick={() => pickVehicle(v.id)} className={`uw-pressable flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left ${isActive ? "border-primary bg-primary/[0.06]" : "border-border/70"}`}>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold">{v.make} {v.model}</span><span className="mt-0.5 block text-[12.5px] text-muted-foreground">{v.registration_number} · {vehicleBodyLabel(v.make, v.model, v.category)}</span></span>
                    {isActive && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
              <Button asChild variant="outline" className="w-full rounded-full"><Link to="/c/vehicles/add"><Plus className="mr-1 h-4 w-4" /> Add vehicle</Link></Button>
            </div>
          </DialogContent>
        </Dialog>

        <EditVehicleDialog vehicle={(activeVehicle ?? null) as any} open={editOpen} onOpenChange={setEditOpen} />
        <ChangePhotoDialog vehicle={(activeVehicle ?? null) as any} open={photoOpen} onOpenChange={setPhotoOpen} />
        
        <BookAWashSheet
          open={bookOpen}
          onOpenChange={setBookOpen}
          vehicleId={selectedVehicleId}
          userId={userId}
        />
        
        {!showCatalog && (
          <div className="mt-8"><ComingSoon area={area} onChange={() => navigate({ to: "/c" })} /></div>
        )}

        <div className="mt-12 mb-8 px-6 text-center">
          <span className="text-[10px] font-medium text-muted-foreground/30 tracking-widest uppercase">
            UW BUILD: {BUILD_VERSION}
          </span>
        </div>
      </div>
    </PullToRefresh>
  );
}

function TrustItem({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="grid h-4 w-4 place-items-center rounded-full bg-success/10"><Check className="h-2.5 w-2.5 text-success" /></div>
      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">{label}</span>
    </div>
  );
}

function ComingSoon({ area, onChange: _onChange }: { area: string; onChange: () => void }) {
  const notify = async () => {
    try {
      const { data: u } = await supabase.auth.getUser();
      let geo: any = {}; try { geo = JSON.parse(localStorage.getItem("uw_customer_geo") ?? "{}"); } catch {}
      await (supabase as any).from("expansion_requests").insert({ customer_id: u.user?.id ?? null, phone: u.user?.phone ?? "", area_name: area, pincode: geo.pincode ?? null, lat: geo.lat ?? null, lng: geo.lng ?? null, interested_service: "general" });
      toast.success("We'll notify you when we launch in your area!");
    } catch { toast.error("Could not save. Try again."); }
  };
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-primary"><MapPin className="h-6 w-6" /></span>
      <h2 className="mt-4 text-[20px] font-bold tracking-tight">We're not here yet</h2>
      <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">Urban Wash is expanding fast. We'll let you know the moment we start serving your area.</p>
      <Button onClick={notify} size="lg" className="mt-6 h-11 rounded-full px-8 font-semibold"><BellRing className="mr-2 h-4 w-4" /> Notify me</Button>
      <button onClick={() => { try { localStorage.removeItem("uw_customer_area"); } catch {} if (typeof window !== "undefined") window.location.href = "/c?change=1"; }} className="mt-4 text-[13px] font-semibold text-primary">Change location</button>
    </div>
  );
}
