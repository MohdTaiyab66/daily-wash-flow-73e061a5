import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves the best available image URL for a customer vehicle.
 *
 * Priority:
 *   1. Customer's own uploaded photo (`customer_vehicles.image_path` → signed URL from `vehicle-images` bucket)
 *   2. Catalog stock image for the make/model (`vehicle_catalog.image_url`)
 *   3. null → caller renders the silhouette via `<VehicleAvatar />`
 */
export function useVehicleImageUrl(opts: {
  make?: string | null;
  model?: string | null;
  imagePath?: string | null;
}) {
  return useQuery({
    queryKey: ["vehicle-image-url", opts.imagePath, opts.make, opts.model],
    enabled: !!(opts.make && opts.model),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      if (opts.imagePath) {
        const { data } = await supabase.storage
          .from("vehicle-images")
          .createSignedUrl(opts.imagePath, 60 * 60);
        if (data?.signedUrl) return data.signedUrl;
      }
      if (opts.make && opts.model) {
        const { data } = await supabase
          .from("vehicle_catalog")
          .select("image_url")
          .ilike("make", opts.make)
          .ilike("model", opts.model)
          .limit(1)
          .maybeSingle();
        return data?.image_url ?? null;
      }
      return null;
    },
  });
}
