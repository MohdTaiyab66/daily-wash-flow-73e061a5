import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Camera, ChevronRight, Plus, Check, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { getServiceImage, useServiceGallery } from "@/lib/service-image-resolver";
import { getDailyShineCarouselImageUrl } from "@/lib/daily-shine-carousel.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAreaAvailability } from "@/lib/area-availability";
import { vehicleBodyLabel } from "@/lib/vehicle-category";
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

  const galleryQ = useServiceGallery();
  const resolvedServiceImage = (slug: string) => {
    // Pass the entire gallery data to getServiceImage which filters by slug
    return getServiceImage(slug, galleryQ.data || []);
  };


  const refreshAll = () => Promise.all([
    vehiclesQ.refetch(), 
    servicesQ.refetch(), 
    galleryQ.refetch()
  ]);


  return (
    <PullToRefresh onRefresh={refreshAll}>
      <div className="min-h-screen bg-[#FFFCF9] pb-[80px]">
        
        <UWHeader 
          area={area} 
          onAreaClick={() => { navigate({ to: "/c/location/search" }); }}
          activeVehicle={activeVehicle}
          vehicleImage={catalogImageQ.data}
          onVehicleClick={() => (vehicles.length > 1 ? setVehicleSheetOpen(true) : setEditOpen(true))}
        />

        <div className="pt-[52px]">
          <div className="px-4">
            <div className="mt-[18px]">
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

            {/* Refined Trust Strip - Tighter */}
            <div className="flex justify-between items-center px-4 w-full h-[60px] mt-[16px] bg-[#FFF8F1] rounded-[18px] border border-[#FF6B00]/5">
              <div className="flex flex-col items-center gap-0.5 flex-1">
                <div className="h-7 w-7 rounded-full bg-white shadow-sm flex items-center justify-center text-[#FF6B00]">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <span className="text-[8.5px] font-[700] text-[#2D2D2D] uppercase tracking-wider mt-1">Expert Care</span>
              </div>
              <div className="flex flex-col items-center gap-0.5 flex-1">
                <div className="h-7 w-7 rounded-full bg-white shadow-sm flex items-center justify-center text-[#FF6B00]">
                  <Camera className="h-3.5 w-3.5" />
                </div>
                <span className="text-[8.5px] font-[700] text-[#2D2D2D] uppercase tracking-wider mt-1">Photo Proof</span>
              </div>
              <div className="flex flex-col items-center gap-0.5 flex-1">
                <div className="h-7 w-7 rounded-full bg-white shadow-sm flex items-center justify-center text-[#FF6B00]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </div>
                <span className="text-[8.5px] font-[700] text-[#2D2D2D] uppercase tracking-wider mt-1">Safe & Secure</span>
              </div>
            </div>

            <Section 
              title={
                <div className="flex flex-col gap-1">
                  <h2 className="text-[24px] font-[700] text-[#2D2D2D] tracking-tight leading-tight uppercase">Car care services</h2>
                  <p className="text-[13px] text-[#7A7A7A] font-[500]">Everything your car needs</p>
                </div>
              }
              className="mt-[22px] mb-0"
            >
              <div className="relative flex items-center gap-2 overflow-x-auto pb-3 -mx-4 px-4 no-scrollbar touch-pan-x mt-[14px] w-screen max-w-full">
                {["Popular", "Wash", "Interior", "Polish", "Detailing", "Premium"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "whitespace-nowrap rounded-full px-4 h-[32px] flex items-center justify-center text-[12px] font-semibold transition-all duration-200 active:scale-[0.96] shrink-0",
                      selectedCategory === cat 
                        ? "bg-[#FF6B00] text-white shadow-sm shadow-[#FF6B00]/10" 
                        : "bg-white text-[#4A4A4A] border border-[rgba(0,0,0,0.06)] shadow-sm"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-x-2 gap-y-3.5 mt-[20px]">
                {servicesQ.isLoading ? (
                   [1, 2, 3].map(i => <SkeletonCard key={i} className="aspect-[1/1.4]" />)
                ) : filteredServices.map((s) => (
                  <UWServiceCard
                    key={s.id}
                    name={s.name}
                    price={priceFor(s)}
                    image={resolvedServiceImage(s.slug).url || undefined}
                    slug={s.slug}
                    badge={s.slug.includes('premium') ? 'Premium' : undefined}
                    onOpen={() => navigate({ to: "/c/service/$slug", params: { slug: s.slug }, search: { vehicleId: selectedVehicleId || undefined } })}
                    onAdd={() => navigate({ to: "/c/service/$slug", params: { slug: s.slug }, search: { vehicleId: selectedVehicleId || undefined } })}
                  />
                ))}
              </div>

              {/* Refined Daily Shine Closing CTA */}
              <div className="mt-8 mb-4 pb-0">
                <button 
                  onClick={() => navigate({ to: "/c/service/$slug", params: { slug: "daily-shine" }, search: { vehicleId: selectedVehicleId || undefined } } as any)}
                  className="w-full bg-[#FFF2ED] border border-[#FF6B00]/10 rounded-[20px] p-5 text-left active:scale-[0.98] transition-transform"
                >
                  <div className="flex flex-row items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-[10px] font-[800] text-[#FF6B00] uppercase tracking-widest mb-1">Your car deserves better</p>
                      <h3 className="text-[17px] font-[700] text-[#2D2D2D] leading-tight">
                        Keep it clean every day <br/> with Daily Shine.
                      </h3>
                    </div>
                    <div className="inline-flex items-center justify-center px-3.5 py-1.5 bg-[#FF6B00] rounded-full text-white text-[11px] font-[800] shadow-md shadow-[#FF6B00]/20 shrink-0">
                      EXPLORE <ChevronRight className="ml-1 h-3 w-3" />
                    </div>
                  </div>
                </button>
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
