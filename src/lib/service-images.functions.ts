import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/lib/admin-middleware";
import { z } from "zod";

export const listServiceImages = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("service_images")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data as Array<{ id: string; service_slug: string; image_url: string; status: "draft" | "published"; updated_at: string }>;
  });

export const upsertServiceImage = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({
    id: z.string().optional(),
    service_slug: z.string(),
    image_url: z.string(),
    status: z.enum(["draft", "published"]).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await (supabaseAdmin as any)
      .from("service_images")
      .upsert({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return result;
  });

export const deleteServiceImage = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("service_images")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

export const listAllCatalogServices = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("service_catalog")
      .select("id, slug, name, active")
      .order("sort_order");
    if (error) throw error;
    
    // DEV LOGGING: Trace slugs from Admin side
    console.log("[ServiceImages] Catalog Slugs:", data?.map((s: any) => ({ name: s.name, slug: s.slug })));
    
    return data as Array<{ id: string; slug: string; name: string; active: boolean }>;
  });
