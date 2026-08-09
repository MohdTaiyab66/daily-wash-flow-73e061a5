import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const SERVICE_IMAGE_QUERY_KEY = ["customer-service-images"];

export const useServiceImages = () => {
  return useQuery({
    queryKey: SERVICE_IMAGE_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_images")
        .select("id, service_slug, image_url, status, updated_at")
        .eq("status", "published")
        .order("updated_at", { ascending: false });
      
      if (error) {
        console.error("[ServiceImages] Fetch Error:", error);
        throw error;
      }
      
      const uniqueImages = new Map();
      data?.forEach(img => {
        if (!uniqueImages.has(img.service_slug)) {
          uniqueImages.set(img.service_slug, {
            url: img.image_url,
            id: img.id,
            updatedAt: img.updated_at
          });
        }
      });
      
      return Object.fromEntries(uniqueImages);
    },
    staleTime: 5000,
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
  });
};

export const STATIC_SERVICE_IMAGES: Record<string, string> = {
  "one-time-wash-premium": "https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&q=80&w=800",
  "one-time-wash-basic": "https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&q=80&w=800",
  "deep-clean": "https://images.unsplash.com/photo-1552933529-e359b2477262?auto=format&fit=crop&q=80&w=800",
  "interior-deep-clean": "https://images.unsplash.com/photo-1599256621730-535171e28e50?auto=format&fit=crop&q=80&w=800",
  "body-polish": "https://images.unsplash.com/photo-1507136566006-cfc505b114fc?auto=format&fit=crop&q=80&w=800",
  "dusting": "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&q=80&w=800",
};

export const getServiceImage = (slug: string, imageMap?: Record<string, any>) => {
  if (imageMap && imageMap[slug]) {
    return imageMap[slug].url;
  }
  return STATIC_SERVICE_IMAGES[slug];
};
