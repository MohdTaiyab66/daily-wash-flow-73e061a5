import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Camera, ChevronRight, Plus, Check, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { getServiceImage, useServiceGallery } from "@/lib/service-image-resolver";
import { getDailyShineCarouselImageUrl } from "@/lib/daily-shine-carousel.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAreaAvailability } from "@/lib/area-availability";
import { vehicleBodyLabel } from "@/lib/vehicle-category";
import { usePlanInclusions } from "@/components/customer/PlanInclusionsCard";

import { EditVehicleDialog, ChangePhotoDialog } from "@/components/customer/EditVehicleInline";
import { useVehicleImageUrl } from "@/lib/vehicle-image";
import { PullToRefresh } from "@/components/customer/ui/PullToRefresh";
import { SkeletonCard } from "@/components/customer/ui/Skeletons";
import { UWHeader } from "@/components/customer/ui/UWHeader";
import { UWFeaturedCarousel } from "@/components/customer/ui/UWFeaturedCarousel";
import { UWServiceCard } from "@/components/customer/ui/UWServiceCard";
import { ListGroup, ListRow, Section } from "@/components/customer/ui/kit";
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
  const queryClient = useQueryClient();
  const [area, setArea] = useState<string>("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("Popular");
  const [vehicleSheetOpen, setVehicleSheetOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  useEffect(() => {
    const savedArea = localStorage.getItem("uw_customer_area") ?? "";
    setArea(savedArea);
    setSelectedVehicleId(localStorage.getItem("uw_customer_vehicle") ?? null);
  }, []);


  const profileQ = useQuery({
    queryKey: ["customer-profile"],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      // Get session from canonical client
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return null;
      
      const { data, error } = await supabase
        .from("customer_profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();
      
      if (error) {
        console.error("[HOME] Profile query failed:", error);
        return null; // Return null instead of throwing to keep page alive
      }
      return data;
    }
  });

  const vehiclesQ = useQuery({
    queryKey: ["customer-vehicles"],
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<Vehicle[]> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      
      const { data, error } = await supabase.from("customer_vehicles").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as Vehicle[];
    },

    retry: 2
  });

  const servicesQ = useQuery({
    queryKey: ["service-catalog"],
    queryFn: async (): Promise<Service[]> => {
      console.log("[SERVICE-DATA] request started");
      const { data, error } = await supabase
        .from("service_catalog")
        .select("id, slug, name, description, banner_url, price_hatchback, price_sedan_suv, service_type, sort_order, duration_minutes")
        .eq("active", true)
        .order("sort_order");

      if (error) {
        console.error("[SERVICE-DATA] query error:", error);
        throw error;
      }
      
      const rawData = (data ?? []) as Service[];
      console.log("[SERVICE-DATA] response received, raw count:", rawData.length);
      return rawData;
    },
    retry: 2,
    staleTime: 1000 * 60 * 10,
  });

  const imagesQ = useQuery({
    queryKey: ["customer-promo-images"],
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    queryFn: async () => {
      try {
        console.log("[CAROUSEL-DATA] request started");
        const { data, error } = await (supabase as any)
          .from("daily_shine_carousel")
          .select("id, image_url, status, slide_number, updated_at, service_slug")
          .eq("status", "published")
          .order("slide_number");
        if (error) {
          console.error("[CAROUSEL-DATA] query error:", error);
          throw error;
        }
        
        const rawSlides = data || [];
        console.log("[CAROUSEL-DATA] response received, raw count:", rawSlides.length);
        
        return rawSlides.map((img: any) => ({
          ...img,
          image_url: getDailyShineCarouselImageUrl(img.image_url)
        }));
      } catch (err: any) {
        console.error("[CAROUSEL-DATA] failed:", err);
        return []; 
      }
    },
    retry: 1,
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

  const galleryQ = useServiceGallery();
  
  const resolvedServiceImage = (slug: string) => {
    return getServiceImage(slug, galleryQ.data || []);
  };

  const refreshAll = () => {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["customer-vehicles"] }),
      queryClient.invalidateQueries({ queryKey: ["service-catalog"] }),
      queryClient.invalidateQueries({ queryKey: ["service-gallery"] }),
      queryClient.invalidateQueries({ queryKey: ["customer-promo-images"] }),
      queryClient.invalidateQueries({ queryKey: ["customer-profile"] })
    ]);
  };

  return (
    <PullToRefresh onRefresh={refreshAll}>
      <div className="min-h-screen bg-white">
        <UWHeader 
          area={area} 
          onAreaClick={() => { navigate({ to: "/c/location/search", search: {} as any }); }}
          activeVehicle={activeVehicle}
          vehicleImage={catalogImageQ.data}
          onVehicleClick={() => (vehicles.length > 1 ? setVehicleSheetOpen(true) : setEditOpen(true))}
        />

        <div className="flex flex-col">
          <div className="px-4">
            <div className="mt-3">
              <UWFeaturedCarousel 
                isLoading={imagesQ.isLoading}
                isError={imagesQ.isError && (!imagesQ.data || imagesQ.data.length === 0)}
                onRetry={() => imagesQ.refetch()}

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
              title={<h2 className="text-[19px] font-semibold text-[#171717] tracking-tight leading-tight">Our Services</h2>}
              className="mt-[20px] mb-0"
            >
              <div className="relative flex items-center gap-2 overflow-x-auto pb-1.5 -mx-4 px-4 no-scrollbar touch-pan-x mt-3 w-screen max-w-full">
                {["Popular", "Wash", "Interior", "Polish", "Detailing"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "whitespace-nowrap rounded-[22px] px-[16px] h-[42px] flex items-center justify-center text-[14px] font-medium transition-all duration-200 active:scale-[0.97] shrink-0",
                      selectedCategory === cat ? "bg-[#FF6B00] text-white" : "bg-white text-[#555555] border border-[#E5E5E5]"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-x-[10px] gap-y-[12px] mt-[12px]">
                {servicesQ.isLoading ? (
                   [1, 2, 3].map(i => <SkeletonCard key={i} className="aspect-[1/1.4]" />)
                ) : servicesQ.isError && servicesQ.data?.length === 0 ? (
                  <div className="col-span-3 py-8 text-center bg-[#F5F5F5] rounded-[16px]">
                    <p className="text-[#555] text-sm mb-3">Unable to load services</p>
                    <button onClick={() => servicesQ.refetch()} className="px-4 py-1.5 bg-[#FF6B00] text-white text-xs font-semibold rounded-full">Try Again</button>
                  </div>

                ) : filteredServices.length === 0 ? (
                  <div className="col-span-3 py-8 text-center"><p className="text-[#888] text-sm">No services found in this category.</p></div>
                ) : filteredServices.map((s) => (
                  <UWServiceCard
                    key={s.id}
                    name={s.name
                      .replace("One-Time Interior & Exterior Wash", "Interior & Exterior")
                      .replace("One-Time Wash (No Body Polish)", "Wash (No Body Polish)")
                      .replace("Deep Clean (Full)", "Deep Clean (Full)")
                      .replace("One-Time ", "")
                      .replace("Butting Polish", "Buffing Polish")
                      .replace("Root Cleaning", "Roof Cleaning")}
                    price={priceFor(s)}
                    image={resolvedServiceImage(s.slug).url || undefined}
                    slug={s.slug}
                    badge={s.slug.includes('premium') ? 'Premium' : undefined}
                    duration={s.duration_minutes}
                    onOpen={() => navigate({ to: "/c/service/$slug", params: { slug: s.slug }, search: { vehicleId: selectedVehicleId || undefined } })}
                    onAdd={() => navigate({ to: "/c/service/$slug", params: { slug: s.slug }, search: { vehicleId: selectedVehicleId || undefined } })}
                  />
                ))}
              </div>

              <div className="mt-6 mb-4">
                <button 
                  onClick={() => navigate({ to: "/c/service/$slug", params: { slug: "daily-shine" }, search: { vehicleId: selectedVehicleId || undefined } } as any)}
                  className="w-full bg-[#FFF2ED] border border-[#FF6B00]/5 rounded-[16px] p-4 text-left active:scale-[0.98] transition-transform h-[96px] flex items-center"
                >
                  <div className="flex flex-row items-center justify-between gap-4 w-full">
                    <div className="flex-1">
                      <p className="text-[11px] font-semibold text-[#FF6B00] uppercase tracking-wider mb-1">Your car deserves better</p>
                      <h3 className="text-[16px] font-semibold text-[#2D2D2D] leading-tight">Keep it clean every day <br/> with Daily Shine.</h3>
                    </div>
                    <div className="inline-flex items-center justify-center px-3.5 py-1.5 bg-[#FF6B00] rounded-full text-white text-[13.5px] font-semibold shrink-0">
                      EXPLORE <ChevronRight className="ml-1 h-3.5 w-3.5" />
                    </div>
                  </div>
                </button>
              </div>
            </Section>
          </div>
        </div>

        <Dialog open={vehicleSheetOpen} onOpenChange={setVehicleSheetOpen}>
          <DialogContent className="max-w-md rounded-t-3xl border-none p-0">
            <DialogHeader className="p-6 pb-2"><DialogTitle className="text-xl font-bold">Select Vehicle</DialogTitle></DialogHeader>
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
