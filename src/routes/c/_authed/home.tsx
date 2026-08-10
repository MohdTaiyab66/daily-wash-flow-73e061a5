import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert, Car, Sparkles, Camera, ChevronDown, ChevronRight, Plus, Check } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useServiceImages, getServiceImage } from "@/lib/service-image-resolver";
import { getDailyShineCarouselImageUrl } from "@/lib/daily-shine-carousel.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAreaAvailability } from "@/lib/area-availability";
import { vehicleBodyLabel } from "@/lib/vehicle-category";
import { VehicleAvatar } from "@/components/VehicleAvatar";
import { EditVehicleDialog, ChangePhotoDialog } from "@/components/customer/EditVehicleInline";
import { useVehicleImageUrl } from "@/lib/vehicle-image";
import { PullToRefresh } from "@/components/customer/ui/PullToRefresh";
import { SkeletonCard } from "@/components/customer/ui/Skeletons";
import { UWHeader } from "@/components/customer/ui/UWHeader";
import { UWFeaturedCarousel } from "@/components/customer/ui/UWFeaturedCarousel";
import { UWServiceCard } from "@/components/customer/ui/UWServiceCard";
import { ListGroup, ListRow, Section, Surface } from "@/components/customer/ui/kit";
import { cn } from "@/lib/utils";
import { DEFAULT_PROMO_IMAGES } from "@/lib/promo.constants";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  const [isCollapsed, setIsCollapsed] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);

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

  const vehicles = vehiclesQ.data ?? [];
  const activeVehicle = vehicles.find((v) => v.id === selectedVehicleId) ?? vehicles[0];
  const category = activeVehicle?.category ?? "hatchback_compact_sedan";

  const catalogImageQ = useVehicleImageUrl({
    make: activeVehicle?.make,
    model: activeVehicle?.model,
    imagePath: activeVehicle?.image_path,
    transform: { width: 120, height: 120, quality: 72, resize: "contain" },
  });

  const availability = useAreaAvailability();
  const a = availability.data;
  const showCatalog = !area || (a && (a.daily_shine || a.premium));

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
        setIsCollapsed(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: "-40px 0px 0px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeVehicle?.id]);

  const refreshAll = () => Promise.all([
    vehiclesQ.refetch(), 
    servicesQ.refetch(), 
    serviceImagesQ.refetch()
  ]);

  return (
    <PullToRefresh onRefresh={refreshAll}>
      <div className="min-h-screen bg-[#FFFCF9] pb-[32px]">
        
        <UWHeader 
          area={area} 
          onAreaClick={() => { try { localStorage.removeItem("uw_customer_area"); } catch {} window.location.href = "/c?change=1"; }}
          activeVehicle={activeVehicle}
          vehicleImage={catalogImageQ.data}
          onVehicleClick={() => (vehicles.length > 1 ? setVehicleSheetOpen(true) : setEditOpen(true))}
          isCollapsed={isCollapsed}
        />

        {/* Adjust top padding to match header height */}
        <div className="pt-[calc(68px+env(safe-area-inset-top,24px))]">
          {/* Sentinel for IntersectionObserver - shifted to control transition */}
          <div ref={sentinelRef} className="h-px w-full pointer-events-none" />

          <div className="px-5">
            <div className="mt-[20px]">
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

            <div className="py-4 flex justify-between items-center px-4 max-w-[360px] mx-auto w-full h-[70px] mt-[16px]">
              <div className="flex flex-col items-center gap-1.5">
                <div className="text-[#FF6B00]">✦</div>
                <span className="text-[10px] font-[600] text-[#7A7A7A] uppercase tracking-wider">Expert Care</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <div className="text-[#FF6B00]">◉</div>
                <span className="text-[10px] font-[600] text-[#7A7A7A] uppercase tracking-wider">Photo Proof</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <div className="text-[#FF6B00]">♢</div>
                <span className="text-[10px] font-[600] text-[#7A7A7A] uppercase tracking-wider">Safe & Secure</span>
              </div>
            </div>

            <Section 
              title={
                <div className="space-y-1.5">
                  <h2 className="text-[28px] font-[650] text-[#2D2D2D] tracking-tight leading-tight">Car care services</h2>
                  <p className="text-[17px] text-[#7A7A7A] font-[500]">Everything your car needs</p>
                </div>
              }
              className="mt-[24px] mb-0"
            >
              <div className="relative flex items-center gap-2 overflow-x-auto pb-4 -mx-5 px-5 no-scrollbar touch-pan-x mt-[20px]">
                {["Popular", "Wash", "Interior", "Polish", "Detailing"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "whitespace-nowrap rounded-[14px] px-6 h-[42px] flex items-center justify-center text-[16px] font-[600] transition-all duration-200 active:scale-95",
                      selectedCategory === cat 
                        ? "bg-[#FF6B00] text-white shadow-md shadow-[#FF6B00]/25" 
                        : "bg-white text-[#2D2D2D] border border-[#2D2D2D]/5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-x-2.5 gap-y-3 mt-[26px]">
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
                    onAdd={() => navigate({ to: "/c/service/$slug", params: { slug: s.slug }, search: { vehicleId: selectedVehicleId ?? undefined } })}
                  />
                ))}
              </div>
            </Section>

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
                    trailing={v.id === selectedVehicleId ? <div className="rounded-full bg-[#FF6B00] p-1 text-white"><Check className="h-3 w-3" /></div> : undefined}
                    chevron={v.id !== selectedVehicleId}
                  />
                ))}
                <ListRow title="Add a new car" onClick={() => { setVehicleSheetOpen(false); navigate({ to: "/c/vehicles/add" }); }} icon={Plus} />
              </ListGroup>
            </div>
          </DialogContent>
        </Dialog>

        {activeVehicle && (
          <>
            <EditVehicleDialog open={editOpen} onOpenChange={setEditOpen} vehicle={activeVehicle} />
            <ChangePhotoDialog open={photoOpen} onOpenChange={setPhotoOpen} vehicle={activeVehicle} />
          </>
        )}
      </div>
    </PullToRefresh>
  );
}
