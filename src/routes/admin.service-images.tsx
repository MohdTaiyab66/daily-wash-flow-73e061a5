import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  listServiceGallery, 
  upsertGalleryItem, 
  deleteGalleryItem, 
  reorderGallery 
} from "@/lib/service-gallery.functions";
import { listAllCatalogServices } from "@/lib/service-images.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Trash2, ArrowLeft, Image as ImageIcon, Save, Check, Upload, Plus } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/service-images")({
  component: ServiceGalleryManager,
});

function ServiceGalleryManager() {
  const qc = useQueryClient();
  const listGalleryFn = useServerFn(listServiceGallery);
  const listServicesFn = useServerFn(listAllCatalogServices);
  const upsertFn = useServerFn(upsertGalleryItem);
  const deleteFn = useServerFn(deleteGalleryItem);

  const { data: services, isLoading: servicesLoading } = useQuery({
    queryKey: ["admin-catalog-services"],
    queryFn: () => listServicesFn(),
  });

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  return (
    <div className="max-w-6xl mx-auto p-6 bg-[#fafafa] min-h-screen">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/admin" className="text-muted-foreground hover:text-foreground bg-white p-2 rounded-full border border-border/50 shadow-sm">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Service Photography</h1>
          <p className="text-muted-foreground">Manage professional imagery per service.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-1 space-y-2">
          {servicesLoading ? <Loader2 className="animate-spin" /> : services?.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedSlug(s.slug)}
              className={cn("w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-all", selectedSlug === s.slug ? "bg-[#ff6b00] text-white shadow-md" : "bg-white hover:bg-muted")}
            >
              {s.name}
            </button>
          ))}
        </div>
        <div className="md:col-span-3">
          {selectedSlug ? <GalleryEditor slug={selectedSlug} /> : (
            <div className="h-64 flex items-center justify-center border-2 border-dashed rounded-3xl text-muted-foreground">
              Select a service to manage photos
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GalleryEditor({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listServiceGallery);
  const upsertFn = useServerFn(upsertGalleryItem);
  const deleteFn = useServerFn(deleteGalleryItem);

  const { data: items, isLoading } = useQuery({
    queryKey: ["gallery", slug],
    queryFn: () => listFn({ data: { service_slug: slug } }),
  });

  const upsertMutation = useMutation({
    mutationFn: (data: any) => upsertFn({ data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gallery", slug] }),
  });

  const handleUpload = async (file: File) => {
    try {
      const fileName = `${slug}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("service-photography").upload(fileName, file);
      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage.from("service-photography").getPublicUrl(fileName);
      await upsertMutation.mutateAsync({ service_slug: slug, image_url: publicUrl, sort_order: (items?.length || 0) });
      toast.success("Uploaded!");
    } catch (e) {
      toast.error("Upload failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 mb-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold capitalize">{slug.replace(/-/g, ' ')} Gallery</h2>
          <Button onClick={() => document.getElementById('file-upload')?.click()}>
            <Plus className="mr-2 h-4 w-4" /> Upload
          </Button>
          <input id="file-upload" type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
        </div>
        <div className="bg-orange-50 border border-orange-100 p-3 rounded-xl mt-2">
          <p className="text-[11px] font-bold text-orange-800 uppercase tracking-wider mb-1">Recommended Specifications</p>
          <p className="text-xs text-orange-700 leading-relaxed">
            <span className="font-bold">1600 × 900 px (16:9)</span>. JPG, JPEG or WebP. Up to 5 images per service. 
            Source images should be landscape for the best carousel experience.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {items?.map((item) => (
          <div key={item.id} className={cn("relative group aspect-square rounded-2xl overflow-hidden border-2 transition-all", item.is_hero ? "border-[#ff6b00]" : "border-border")}>
            <img src={item.image_url} className="w-full h-full object-cover" alt="Gallery item" />
            
            {item.is_hero && (
              <div className="absolute top-2 left-2 bg-[#ff6b00] text-white text-[8px] font-black px-2 py-0.5 rounded-full z-10 shadow-sm">
                HERO / COVER
              </div>
            )}

            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity gap-2">
              <div className="flex gap-2">
                {!item.is_hero && (
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="h-8 text-[10px] font-bold"
                    onClick={() => upsertMutation.mutate({ ...item, is_hero: true })}
                  >
                    SET HERO
                  </Button>
                )}
                <Button 
                  variant="destructive" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => deleteFn({ data: { id: item.id } }).then(() => qc.invalidateQueries({ queryKey: ["gallery", slug] }))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
