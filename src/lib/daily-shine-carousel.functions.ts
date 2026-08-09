import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/lib/admin-middleware";
import { z } from "zod";
import { DAILY_SHINE_CAROUSEL_BUCKET, BUILD_VERSION } from "@/lib/build-info";

/**
 * Requirement 5: Normalize carousel storage paths
 * Handles old malformed paths, full URLs, and bucket prefixes.
 */
export function normalizeCarouselStoragePath(value: string): string {
  if (!value) return "";
  
  // Rule: If value contains service-photography/ -> Invalid for carousel
  if (value.includes("service-photography/")) {
    return "";
  }

  // Rule: If it's a full Supabase public URL containing /object/public/daily-shine-carousel/
  if (value.includes("/object/public/daily-shine-carousel/")) {
    const parts = value.split("/object/public/daily-shine-carousel/");
    return parts[parts.length - 1].split("?")[0]; // Extract path and remove query params
  }

  // Rule: If value starts with the bucket name prefix
  if (value.startsWith("daily-shine-carousel/")) {
    return value.replace("daily-shine-carousel/", "");
  }

  // Otherwise return as is (assuming it's a relative path slide-x/photo.jpg)
  return value;
}

/**
 * Requirement 10: Canonical Resolver
 */
export function getDailyShineCarouselImageUrl(storagePath: string): string {
  if (!storagePath) return "";
  const normalized = normalizeCarouselStoragePath(storagePath);
  if (!normalized) return "";

  // This is the canonical format: .../object/public/daily-shine-carousel/slide-x/file.jpg
  return `https://qsnzrdoomakackspawjv.supabase.co/storage/v1/object/public/daily-shine-carousel/${normalized}`;
}

export const listCarouselSlides = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("daily_shine_carousel")
      .select("*")
      .order("slide_number", { ascending: true });
    
    if (error) throw error;
    
    // Normalize existing data on the fly for the UI
    return (data || []).map((slide: any) => ({
      ...slide,
      image_url: normalizeCarouselStoragePath(slide.image_url)
    })) as Array<{ 
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
    image_url: z.string(), // This should be the relative path
    status: z.enum(["draft", "published"]),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    service_slug: z.string().optional(),
    bucket_name: z.string().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const bucket = DAILY_SHINE_CAROUSEL_BUCKET;
    const normalizedPath = normalizeCarouselStoragePath(data.image_url);
    
    if (!normalizedPath) {
      throw new Error("Invalid image path. Please re-upload.");
    }

    console.log(`[UW_CAROUSEL_VERIFY] Verifying slide ${data.slide_number}: ${normalizedPath}`);
    
    try {
      // 1. Verify storage object exists via API (Requirement 6 & 9)
      const folder = normalizedPath.split('/')[0];
      const fileName = normalizedPath.split('/').pop();
      
      const { data: listData, error: listError } = await (supabaseAdmin as any).storage
        .from(bucket)
        .list(folder, { search: fileName });
        
      if (listError || !listData || listData.length === 0) {
        throw new Error(`Storage object verification failed: Object not found at ${normalizedPath}`);
      }
      
      console.log(`[UW_CAROUSEL_VERIFY] Object exists in bucket.`);
      
      // 2. Generate and Verify Public URL via GET (Requirement 8)
      const publicUrl = getDailyShineCarouselImageUrl(normalizedPath);
      console.log(`[UW_CAROUSEL_VERIFY] Testing public URL: ${publicUrl}`);
      
      // Use normal fetch (GET) to verify content
      const response = await fetch(publicUrl);
      if (!response.ok) {
        console.warn(`[UW_CAROUSEL_VERIFY] Public URL returned ${response.status}. Bucket might not be public yet.`);
        // Requirement 6: If published, we really want it to work.
        if (data.status === 'published') {
          throw new Error(`Public URL verification failed: HTTP ${response.status}. Ensure bucket is public.`);
        }
      } else {
        const contentType = response.headers.get('content-type');
        console.log(`[UW_CAROUSEL_VERIFY] Public URL verified. Content-Type: ${contentType}`);
      }
      
    } catch (err: any) {
      console.error(`[UW_CAROUSEL_VERIFY] Verification FAILED for slide ${data.slide_number}`, err);
      if (data.status === 'published') {
        throw new Error(`Image verification failed: ${err.message}`);
      }
    }

    // SAVE DATABASE RECORD WITH NORMALIZED PATH
    const { data: result, error } = await (supabaseAdmin as any)
      .from("daily_shine_carousel")
      .upsert({
        ...data,
        image_url: normalizedPath, // Store only the relative path (Requirement 3)
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