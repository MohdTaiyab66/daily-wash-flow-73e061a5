import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const SERVICE_IMAGE_QUERY_KEY = ["customer-service-images"];

export const useServiceGallery = (slug?: string) => {
  return useQuery({
    queryKey: ["service-gallery", slug],
    queryFn: async () => {
      let query = supabase
        .from("service_gallery")
        .select("*")
        .order("sort_order", { ascending: true });
      
      if (slug) {
        query = query.eq("service_slug", slug);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    staleTime: 60000,
  });
};

export const getServiceImage = (slug: string, gallery?: any[]) => {
  if (gallery && gallery.length > 0) {
    // Filter gallery for this specific service first
    const serviceGallery = gallery.filter(i => i.service_slug === slug);
    if (serviceGallery.length > 0) {
      const hero = serviceGallery.find(i => i.is_hero) || serviceGallery[0];
      return { url: hero.image_url, source: 'GALLERY', slug };
    }
  }
  
  const FALLBACKS: Record<string, string> = {
    'daily-shine': 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?q=80&w=1920&auto=format&fit=crop',
    'one-time-wash': 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?q=80&w=1920&auto=format&fit=crop',
    'one-time-wash-no-polish': 'https://images.unsplash.com/photo-1552933529-e359b24772ff?q=80&w=1920&auto=format&fit=crop',
    'deep-clean': 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?q=80&w=1920&auto=format&fit=crop',
    'body-polish': 'https://images.unsplash.com/photo-1601362840469-51e4d8d59085?q=80&w=1920&auto=format&fit=crop'
  };

  return { url: FALLBACKS[slug] || FALLBACKS['one-time-wash'], source: 'FALLBACK', slug };
};
