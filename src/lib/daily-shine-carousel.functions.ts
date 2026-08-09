import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/lib/admin-middleware";
import { z } from "zod";

export const listCarouselSlides = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("daily_shine_carousel")
      .select("*")
      .order("slide_number", { ascending: true });
    
    if (error) throw error;
    return data as Array<{ 
      id: string; 
      slide_number: number; 
      image_url: string; 
      status: "draft" | "published"; 
      updated_at: string;
      title?: string;
      subtitle?: string;
      service_slug?: string;
    }>;
  });

export const upsertCarouselSlide = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({
    id: z.string().optional(),
    slide_number: z.number(),
    image_url: z.string(),
    status: z.enum(["draft", "published"]),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    service_slug: z.string().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await (supabaseAdmin as any)
      .from("daily_shine_carousel")
      .upsert({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
      
    if (error) throw error;
    return result;
  });

export const deleteCarouselSlide = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("daily_shine_carousel")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });
