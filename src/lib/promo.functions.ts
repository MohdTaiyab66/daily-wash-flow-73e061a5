import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/lib/admin-middleware";
import { z } from "zod";

export const listPromoImages = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("daily_shine_promo_images")
      .select("*")
      .order("sort_order");
    if (error) throw error;
    return data;
  });

export const upsertPromoImage = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({
    id: z.string().optional(),
    image_url: z.string().url(),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    sort_order: z.number().optional(),
    is_active: z.boolean().optional(),
    status: z.enum(["draft", "published"]).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await (supabaseAdmin as any)
      .from("daily_shine_promo_images")
      .upsert({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return result;
  });

export const deletePromoImage = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("daily_shine_promo_images")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });
