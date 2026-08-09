import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const SERVICE_IMAGE_QUERY_KEY = ["customer-service-images"];

export const useServiceImages = () => {
  return useQuery({
    queryKey: SERVICE_IMAGE_QUERY_KEY,
    queryFn: async () => {
      // 1. Fetch all published service images
      const { data, error } = await supabase
        .from("service_images")
        .select("id, service_slug, image_url, status, updated_at")
        .eq("status", "published")
        .order("updated_at", { ascending: false });
      
      if (error) {
        console.error("[UW_SERVICE_IMAGE_DEBUG] Fetch Error:", error);
        throw error;
      }
      
      const imageMap: Record<string, any> = {};
      data?.forEach(img => {
        // Deterministic: use the latest one if duplicates exist for a slug
        if (!imageMap[img.service_slug]) {
          imageMap[img.service_slug] = {
            url: img.image_url,
            id: img.id,
            updatedAt: img.updated_at
          };
        }
      });
      
      console.log("[UW_SERVICE_IMAGE_DEBUG] Image Map Keys:", Object.keys(imageMap));
      return imageMap;
    },
    staleTime: 5000,
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
  });
};

export const getServiceImage = (slug: string, imageMap?: Record<string, any>) => {
  // 1. Check Admin Database first
  if (imageMap && imageMap[slug]) {
    const imgData = imageMap[slug];
    // Force absolute URL and add cache busting
    let finalUrl = imgData.url;
    
    // Safety check: ensure it's a full URL
    if (finalUrl && !finalUrl.startsWith('http')) {
      // Fallback if the DB only stored the path
      finalUrl = `https://qsnzrdoomakackspawjv.supabase.co/storage/v1/object/public/service-photography/${finalUrl}`;
    }

    if (finalUrl) {
      const cacheBuster = imgData.updatedAt ? new Date(imgData.updatedAt).getTime() : Date.now();
      finalUrl = `${finalUrl}${finalUrl.includes('?') ? '&' : '?'}v=${cacheBuster}`;
      return { url: finalUrl, source: 'ADMIN', slug };
    }
  }
  
  // 2. Premium static fallbacks (only if Admin is missing)
  const FALLBACKS: Record<string, string> = {
    'daily-shine-subscription': 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?q=80&w=1000&auto=format&fit=crop',
    'one-time-wash': 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?q=80&w=1000&auto=format&fit=crop',
    'one-time-wash-no-polish': 'https://images.unsplash.com/photo-1552933529-e359b24772ff?q=80&w=1000&auto=format&fit=crop',
    'deep-clean': 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?q=80&w=1000&auto=format&fit=crop',
    'body-polish': 'https://images.unsplash.com/photo-1601362840469-51e4d8d59085?q=80&w=1000&auto=format&fit=crop'
  };

  if (FALLBACKS[slug]) {
    return { url: FALLBACKS[slug], source: 'PREMIUM_FALLBACK', slug };
  }

  return { url: null, source: 'NONE', slug };
};
