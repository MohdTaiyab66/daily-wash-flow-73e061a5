import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Car } from "lucide-react";
import { useEffect, useState, useRef } from "react";
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
import { getDailyShineCarouselImageUrl } from "@/lib/daily-shine-carousel.functions";
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
import { BUILD_VERSION, DAILY_SHINE_CAROUSEL_BUCKET } from "@/lib/build-info";

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

  const sentinelRef = useRef<HTMLDivElement>(null);
  const compactHeaderRef = useRef<HTMLDivElement>(null);

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

  const priceFor = (s: Service) => category === "sedan_suv" ? s.price_sedan_suv : s.price_hatchback;
  const services = servicesQ.data ?? [];
  const oneTime = services.filter((s) => s.service_type !== "subscription" && !PLAN_INCLUDED_SERVICE_SLUGS.includes(s.slug));

  const filteredServices = oneTime.filter((s) => {
    if (selectedCategory === "Popular") return true;
    if (selectedCategory === "Wash") return s.slug.includes("wash");
    if (selectedCategory === "Interior") return s.slug.includes("interior") || s.slug.includes("clean") || s.slug.includes("dusting");
    if (selectedCategory === "Polish") return s.slug.includes("polish") || s.slug.includes("scratch");
    if (selectedCategory === "Detailing") return s.slug.includes("premium") || s.slug.includes("full") || s.slug.includes("polish");
    return true;
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
      return data.map((img: any) => ({
        ...img,
        image_url: getDailyShineCarouselImageUrl(img.image_url)
      }));
    },
  });

  const serviceImagesQ = useServiceImages();
  const resolvedServiceImage = (slug: string) => getServiceImage(slug, serviceImagesQ.data);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const isCollapsed = !entry.isIntersecting;
        if (compactHeaderRef.current) {
          compactHeaderRef.current.style.opacity = isCollapsed ? "1" : "0";
          compactHeaderRef.current.style.transform = isCollapsed ? "translateY(0)" : "translateY(-8px)";
          compactHeaderRef.current.style.pointerEvents = isCollapsed ? "auto" : "none";
        }
      },
      { threshold: 0, rootMargin: "-40px 0px 0px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [selectedVehicleId]);

  const refreshAll = () => Promise.all([
    vehiclesQ.refetch(), 
    servicesQ.refetch(), 
    subStatusQ.refetch(), 
    unreadQ.refetch(), 
    serviceImagesQ.refetch()
  ]);

  return (
    <PullToRefresh onRefresh={refreshAll}>
      <div className="min-h-screen bg-[#FFFCF9] pb-32">
        
        {/* Sticky Compact Header (Overlay) - High performance fixed position */}
        <div 
          ref={compactHeaderRef}
          className="fixed top-0 left-0 right-0 z-50 px-5 pt-[env(safe-area-inset-top,12px)] pb-2 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.03)] opacity-0 translate-y-[-8px] transition-all duration-[220ms] ease-out pointer-events-none"
        >
          <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#FF6B00]/20 to-transparent pointer-events-none" />
          {activeVehicle && (
            <div 
              className="flex items-center gap-2 py-1 cursor-pointer"
              onClick={() => (vehicles.length > 1 ? setVehicleSheetOpen(true) : setEditOpen(true))}
            >
              <div className="h-[36px] w-[36px] shrink-0 overflow-hidden rounded-[8px] bg-[#FF6B00]/5 border border-[#FF6B00]/10">
                <VehicleAvatar imageUrl={catalogImageQ.data} make={activeVehicle.make} model={activeVehicle.model} color={activeVehicle.color} className="h-full w-full object-contain p-0.5" />
              </div>
              <div className="min-w-0 flex-1 flex items-baseline gap-1.5">
                <h2 className="truncate font-[650] text-[15px] text-[#2D2D2D] leading-tight">
                  {activeVehicle.make} {activeVehicle.model}
                </h2>
                <p className="truncate font-[500] text-[13px] text-[#7A7A7A] leading-tight">
                  · {activeVehicle.registration_number} · {bodyLabel}
                </p>
                <ChevronDown className="text-[#7A7A7A]/40 ml-1 h-3.5 w-3.5" />
              </div>
            </div>
          )}
        </div>

        <UWHeader 
          area={area} 
          onAreaClick={() => { try { localStorage.removeItem("uw_customer_area"); } catch {} window.location.href = "/c?change=1"; }}
        >
          {vehiclesQ.isLoading ? (
            <div className="h-10 animate-pulse bg-black/5 rounded-lg" />
          ) : activeVehicle ? (
            <div 
              className="flex items-center gap-4 py-1.5 cursor-pointer active:opacity-80"
              onClick={() => (vehicles.length > 1 ? setVehicleSheetOpen(true) : setEditOpen(true))}
            >
              <div className="relative shrink-0 h-[56px] w-[56px] overflow-hidden rounded-[11px] bg-[#FF6B00]/5 border border-[#FF6B00]/10 shadow-sm">
                <VehicleAvatar imageUrl={catalogImageQ.data} make={activeVehicle.make} model={activeVehicle.model} color={activeVehicle.color} className="h-full w-full object-contain p-1" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex flex-col">
                    <h2 className="truncate font-[650] tracking-tight text-[#2D2D2D] text-[21px] leading-tight">
                      {activeVehicle.make} {activeVehicle.model}
                    </h2>
                    <p className="truncate font-[500] text-[#7A7A7A] text-[15px] mt-0.5 leading-tight">
                      {activeVehicle.registration_number} · {bodyLabel}
                    </p>
                  </div>
                  <ChevronDown className="text-[#7A7A7A]/40 ml-2 h-4 w-4" />
                </div>
              </div>
            </div>
          ) : (
            <button onClick={() => navigate({ to: "/c/vehicles/add" })} className="flex items-center gap-2 text-[#FF6B00] font-[600] text-[14px]">
              <Plus className="h-4 w-4" /> Add your car
            </button>
          )}
        </UWHeader>

        {/* Sentinel for IntersectionObserver */}
        <div ref={sentinelRef} className="h-px w-full -mt-2 pointer-events-none" />

        <div className="px-5">
          <div className="space-y-4 mt-[16px]">
            <div className="mt-[-4px]">
              <UWFeaturedCarousel 
                items={(imagesQ.data?.length ? imagesQ.data : DEFAULT_PROMO_IMAGES).map((img: any, idx: number) => {
                  const bust = img.updated_at ? new Date(img.updated_at).getTime() : Date.now();
                  let finalImage = img.image_url || (DEFAULT_PROMO_IMAGES[idx % DEFAULT_PROMO_IMAGES.length] as any).image;
                  if (finalImage && finalImage.includes('supabase.co')) {
                    const separator = finalImage.includes('?') ? '&' : '?';
                    finalImage = `${finalImage}${separator}v=${bust}`;
                  }
                  return {
                    id: img.id || `static-${idx}`,
                    title: "",
                    subtitle: "",
                    price: 0,
                    image: finalImage,
                    link: img.service_slug ? `/c/service/${img.service_slug}` : "/c/service/daily-shine",
                    slideNumber: img.slide_number || idx + 1
                  };
                })}
                onItemClick={(item) => navigate({ to: item.link as any })}
              />
            </div>

            <Section 
              title={
                <div className="space-y-0.5">
                  <h2 className="text-[26px] font-[700] text-[#2D2D2D] tracking-tight">Car care services</h2>
                  <p className="text-[15px] text-[#7A7A7A] font-[500]">Everything your car needs</p>
                </div>
              }
              className="mt-[32px] mb-0"
            >
              <div className="relative flex items-center gap-2 overflow-x-auto pb-4 -mx-5 px-5 no-scrollbar touch-pan-x mt-[14px]">
                {["Popular", "Wash", "Interior", "Polish", "Detailing"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "whitespace-nowrap rounded-full px-5 h-[44px] flex items-center justify-center text-[14px] font-[600] transition-all duration-200",
                      selectedCategory === cat ? "bg-[#FF6B00] text-white shadow-md shadow-[#FF6B00]/25" : "bg-white text-[#2D2D2D] border border-border/60 shadow-sm"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-x-2 gap-y-3 mt-4">
                {servicesQ.isLoading ? (
                   [1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} className="aspect-[1/1.4]" />)
                ) : filteredServices.map((s) => (
                  <UWServiceCard
                    key={s.id}
                    name={s.name}
                    price={priceFor(s)}
                    image={resolvedServiceImage(s.slug).url || undefined}
                    slug={s.slug}
                    badge={s.slug.includes('premium') ? 'Premium' : undefined}
                    onAdd={() => navigate({ to: "/c/service/$slug", params: { slug: s.slug }, search: { vehicleId: vehicleId ?? undefined } })}
                  />
                ))}
              </div>
            </Section>

            {showCatalog && (
              <div className="py-4 flex justify-between items-center px-6 max-w-sm mx-auto w-full h-[60px] opacity-70">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="h-8 w-8 rounded-full bg-[#FF6B00]/5 flex items-center justify-center text-[#FF6B00]"><Sparkles className="h-4 w-4" /></div>
                  <span className="text-[9px] font-[800] text-[#2D2D2D] uppercase tracking-wider">Expert Care</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="h-8 w-8 rounded-full bg-[#FF6B00]/5 flex items-center justify-center text-[#FF6B00]"><Camera className="h-4 w-4" /></div>
                  <span className="text-[9px] font-[800] text-[#2D2D2D] uppercase tracking-wider">Photo Proof</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="h-8 w-8 rounded-full bg-[#FF6B00]/5 flex items-center justify-center text-[#FF6B00]"><ShieldAlert className="h-4 w-4" /></div>
                  <span className="text-[9px] font-[800] text-[#2D2D2D] uppercase tracking-wider">Safe & Secure</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <Dialog open={vehicleSheetOpen} onOpenChange={setVehicleSheetOpen}>
          <DialogContent className="max-w-md rounded-t-3xl border-none p-0">
            <DialogHeader className="p-6 pb-2">
              <DialogTitle className="text-xl font-bold">Select Vehicle</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto p-4 pt-0">
              <ListGroup>
                {vehicles.map((v) => (
                  <ListRow
                    key={v.id}
                    title={`${v.make} ${v.model}`}
                    subtitle={`${v.registration_number} · ${vehicleBodyLabel(v.make, v.model, v.category)}`}
                    onClick={() => { setSelectedVehicleId(v.id); localStorage.setItem("uw_customer_vehicle", v.id); setVehicleSheetOpen(false); }}
                    right={v.id === selectedVehicleId ? <div className="rounded-full bg-[#FF6B00] p-1 text-white"><Check className="h-3 w-3" /></div> : <ChevronRight className="h-4 w-4 text-muted-foreground/30" />}
                  />
                ))}
                <ListRow title="Add a new car" onClick={() => { setVehicleSheetOpen(false); navigate({ to: "/c/vehicles/add" }); }} icon={<Plus className="h-5 w-5" />} />
              </ListGroup>
            </div>
          </DialogContent>
        </Dialog>

        {activeVehicle && (
          <>
            <EditVehicleDialog open={editOpen} onOpenChange={setEditOpen} vehicle={activeVehicle} onUpdated={() => vehiclesQ.refetch()} onDelete={() => { setSelectedVehicleId(null); localStorage.removeItem("uw_customer_vehicle"); vehiclesQ.refetch(); }} />
            <ChangePhotoDialog open={photoOpen} onOpenChange={setPhotoOpen} vehicleId={activeVehicle.id} onUpdated={() => vehiclesQ.refetch()} />
          </>
        )}
      </div>
    </PullToRefresh>
  );
}
