import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/lib/admin-middleware";
import { z } from "zod";
import { DAILY_SHINE_CAROUSEL_BUCKET } from "@/lib/build-info";


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
      bucket_name?: string;
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
    bucket_name: z.string().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const bucket = DAILY_SHINE_CAROUSEL_BUCKET;
    
    // VERIFICATION FLOW (Requirement 3)
    console.log(`[UW_CAROUSEL_VERIFY] Verifying slide ${data.slide_number} in bucket ${bucket}: ${data.image_url}`);
    
    try {
      // 1. Verify storage object exists
      const { data: fileData, error: downloadError } = await (supabaseAdmin as any).storage
        .from(bucket)
        .download(data.image_url);
        
      if (downloadError || !fileData) {
        throw new Error(`Storage object verification failed: ${downloadError?.message || 'Object not found'}`);
      }
      
      console.log(`[UW_CAROUSEL_VERIFY] Object exists. Size: ${fileData.size} bytes`);
      
      // 2. Generate and Verify Public URL
      const { data: urlData } = (supabaseAdmin as any).storage
        .from(bucket)
        .getPublicUrl(data.image_url);
        
      const publicUrl = urlData.publicUrl;
      console.log(`[UW_CAROUSEL_VERIFY] Testing public URL: ${publicUrl}`);
      
      const response = await fetch(publicUrl, { method: 'HEAD' });
      if (!response.ok) {
        throw new Error(`Public URL verification failed: HTTP ${response.status}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType?.startsWith('image/')) {
        throw new Error(`Public URL verification failed: Invalid content-type ${contentType}`);
      }
      
      console.log(`[UW_CAROUSEL_VERIFY] Public URL verified. Status 200, Content-Type: ${contentType}`);
      
    } catch (err: any) {
      console.error(`[UW_CAROUSEL_VERIFY] Verification FAILED for slide ${data.slide_number}`, err);
      if (data.status === 'published') {
        throw new Error(`Image verification failed: ${err.message}. Please check if the bucket is public and the image exists.`);
      }
    }

    // ONLY THEN SAVE DATABASE RECORD
    const { data: result, error } = await (supabaseAdmin as any)
      .from("daily_shine_carousel")
      .upsert({
        ...data,
        bucket_name: bucket,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'slide_number' })
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