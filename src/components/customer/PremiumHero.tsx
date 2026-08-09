import { MapPin, Car, Sparkles, ChevronDown, CheckCircle2 } from "lucide-react";
import { Surface, Muted } from "./ui/kit";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface PremiumHeroProps {
  service: any;
  vehicleSubActive: boolean;
  previewPayable: number;
  purchaseMode: string;
  vehicle: any;
  address: any;
  onVehicleClick: () => void;
  onAddressClick: () => void;
}

export function PremiumHero({ 
  service, 
  vehicleSubActive, 
  previewPayable, 
  purchaseMode,
  vehicle,
  address,
  onVehicleClick,
  onAddressClick
}: PremiumHeroProps) {
  const serviceImagesQ = useQuery({
    queryKey: ["customer-service-images"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_images")
        .select("service_slug, image_url, updated_at")
        .eq("status", "published")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const uniqueImages = new Map();
      data?.forEach(img => {
        if (!uniqueImages.has(img.service_slug)) {
          uniqueImages.set(img.service_slug, img.image_url);
        }
      });
      return Array.from(uniqueImages.entries()).map(([service_slug, image_url]) => ({
        service_slug,
        image_url
      }));
    },
    staleTime: 5000,
  });

  const getServiceImage = (serviceSlug: string) => {
    const custom = serviceImagesQ.data?.find(img => img.service_slug === serviceSlug);
    if (custom) return custom.image_url;
    
    const mapping: Record<string, string> = {
      "one-time-wash-premium": "https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&q=80&w=800",
      "one-time-wash-basic": "https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&q=80&w=800",
      "deep-clean": "https://images.unsplash.com/photo-1552933529-e359b2477262?auto=format&fit=crop&q=80&w=800",
      "interior-deep-clean": "https://images.unsplash.com/photo-1599256621730-535171e28e50?auto=format&fit=crop&q=80&w=800",
    };
    return mapping[serviceSlug];
  };

  const currentImage = getServiceImage(service?.slug);
  const isIncluded = purchaseMode === 'included_wash';

  return (
    <Surface className="relative overflow-hidden border-primary/10 bg-gradient-to-br from-white to-[#FFF5ED] p-0">
      {currentImage && (
        <div className="absolute inset-0 z-0 opacity-10 grayscale mix-blend-multiply">
           <img src={currentImage} className="w-full h-full object-cover" alt="" />
        </div>
      )}
      
      <div className="relative z-10">
        {/* Top Layer: Service Category & Price */}
        <div className="px-5 pt-5 pb-4 flex items-start justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-[11px] font-black text-primary uppercase tracking-wider">
                {isIncluded ? 'Included with Daily Shine' : 'Premium Service'}
              </span>
            </div>
            {vehicleSubActive && !isIncluded && (
              <div className="flex items-center gap-1.5 text-[10px] font-black text-success uppercase tracking-wider">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Daily Shine active</span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end shrink-0">
            <div className="text-[24px] font-black text-primary leading-none">₹{previewPayable}</div>
            <div className="text-[10px] font-bold text-muted-foreground/40 mt-1 uppercase tracking-widest">
              {isIncluded ? 'Included' : 'One-time'}
            </div>
          </div>
        </div>

        {/* Middle Layer: Service Info */}
        <div className="px-5 pb-5">
          <div className="flex items-center gap-3 bg-white/50 backdrop-blur-sm p-3 rounded-2xl border border-white/80">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5" onClick={onVehicleClick}>
                <Car className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[13px] font-black truncate">{vehicle?.make} {vehicle?.model}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground/40" />
              </div>
              <div className="flex items-center gap-2" onClick={onAddressClick}>
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-bold text-muted-foreground/70 truncate uppercase tracking-tight">
                  Serving at {address?.label || 'Home'}
                </span>
                <ChevronDown className="h-3 w-3 text-muted-foreground/40" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Surface>
  );
}
