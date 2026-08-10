import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/lib/admin-middleware";
import { z } from "zod";

export const listServiceGallery = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ service_slug: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = (supabaseAdmin as any).from("service_gallery").select("*").order("sort_order");
    
    if (data.service_slug) {
      query = query.eq("service_slug", data.service_slug);
    }
    
    const { data: result, error } = await query;
    if (error) throw error;
    return result as Array<{ 
      id: string; 
      service_slug: string; 
      image_url: string; 
      sort_order: number; 
      is_hero: boolean;
      created_at: string;
      updated_at: string;
    }>;
  });

export const upsertGalleryItem = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({
    id: z.string().optional(),
    service_slug: z.string(),
    image_url: z.string(),
    sort_order: z.number().optional(),
    is_hero: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // If setting this as hero, unset others for this service_slug
    if (data.is_hero) {
      await (supabaseAdmin as any)
        .from("service_gallery")
        .update({ is_hero: false })
        .eq("service_slug", data.service_slug);
    }

    const { data: result, error } = await (supabaseAdmin as any)
      .from("service_gallery")
      .upsert({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
      
    if (error) throw error;
    return result;
  });

export const deleteGalleryItem = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("service_gallery")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

export const reorderGallery = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.array(z.object({ id: z.string(), sort_order: z.number() })).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (const item of data) {
      await (supabaseAdmin as any)
        .from("service_gallery")
        .update({ sort_order: item.sort_order })
        .eq("id", item.id);
    }
    return { success: true };
  });
