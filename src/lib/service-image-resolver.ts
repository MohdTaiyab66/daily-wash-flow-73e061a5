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

export const getServiceImage = (slug: string, imageMap?: Record<string, any>) => {
  if (imageMap && imageMap[slug]) {
    return { url: imageMap[slug].url, source: 'ADMIN' };
  }
  // NO PHOTOGRAPHIC FALLBACKS DURING DEBUGGING
  return { url: null, source: 'NONE' };
};
