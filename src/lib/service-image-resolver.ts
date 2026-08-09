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
  
  // Premium static fallbacks for consistency
  const FALLBACKS: Record<string, string> = {
    'daily-shine-subscription': 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?q=80&w=1000&auto=format&fit=crop',
    'one-time-wash-basic': 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?q=80&w=1000&auto=format&fit=crop',
    'one-time-wash-premium': 'https://images.unsplash.com/photo-1552933529-e359b24772ff?q=80&w=1000&auto=format&fit=crop',
    'interior-deep-clean': 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?q=80&w=1000&auto=format&fit=crop',
    'body-polish': 'https://images.unsplash.com/photo-1601362840469-51e4d8d59085?q=80&w=1000&auto=format&fit=crop'
  };

  if (FALLBACKS[slug]) {
    return { url: FALLBACKS[slug], source: 'PREMIUM_FALLBACK' };
  }

  return { url: null, source: 'NONE' };
};
