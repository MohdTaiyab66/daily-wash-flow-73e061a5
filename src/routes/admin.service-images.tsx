import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  listServiceImages, 
  upsertServiceImage, 
  deleteServiceImage,
  listAllCatalogServices 
} from "@/lib/service-images.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trash2, ArrowLeft, Image as ImageIcon, Save, Check, Upload, X } from "lucide-react";
import { useState, useMemo, useRef, ErrorInfo, Component } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ServiceImages] UI Crash caught by boundary:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-10 text-center">
          <h2 className="text-xl font-bold text-destructive">Something went wrong in the Service Photography manager.</h2>
          <Button className="mt-4" onClick={() => window.location.reload()}>Reload Page</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const Route = createFileRoute("/admin/service-images")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw new Error("Unauthorized");
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: sess.session.user.id,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: Admin access required");
  },
  component: () => (
    <ErrorBoundary>
      <ServiceImagesAdminPage />
    </ErrorBoundary>
  ),
});

function ServiceImagesAdminPage() {
  const qc = useQueryClient();
  const listImagesFn = useServerFn(listServiceImages);
  const listServicesFn = useServerFn(listAllCatalogServices);
  const upsertFn = useServerFn(upsertServiceImage);
  const deleteFn = useServerFn(deleteServiceImage);

  const { data: images, isLoading: imagesLoading } = useQuery({
    queryKey: ["admin-service-images"],
    queryFn: () => listImagesFn(),
  });

  const { data: catalogServices, isLoading: servicesLoading } = useQuery({
    queryKey: ["admin-catalog-services"],
    queryFn: () => listServicesFn(),
  });

  const upsertMutation = useMutation({
    mutationFn: (data: any) => upsertFn({ data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-service-images"] });
      // CRITICAL: Invalidate customer-side cache too if on same window, 
      // though usually admin and customer are separate contexts.
      qc.invalidateQueries({ queryKey: ["customer-service-images"] });
      toast.success("Changes saved and published");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-service-images"] });
      toast.success("Image removed");
    },
  });

  const imageMap = useMemo(() => {
    const map = new Map();
    // Deterministic: use latest record for each slug
    if (images && Array.isArray(images)) {
      // Sort images by updated_at desc just in case the server function didn't catch everything or for consistency
      const sorted = [...images].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      sorted.forEach(img => {
        if (img && img.service_slug && !map.has(img.service_slug)) {
          map.set(img.service_slug, img);
        }
      });
    }
    return map;
  }, [images]);

  const [localChanges, setLocalChanges] = useState<{ [slug: string]: { url?: string, status?: "draft" | "published" } }>({});
  const [uploading, setUploading] = useState<{ [slug: string]: boolean }>({});

  const handleUpload = async (slug: string, file: File) => {
    try {
      console.log(`[ServiceImages] Starting upload for ${slug}...`);
      setUploading(prev => ({ ...prev, [slug]: true }));
      
      if (!file.type.startsWith('image/')) {
        throw new Error("Invalid file type. Please select an image.");
      }

      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${slug}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${fileName}`; // Removed "services/" prefix to match bucket root RLS check if needed, but path usually starts after bucket name

      console.log(`[ServiceImages] Uploading to bucket 'service-photography' at path '${filePath}'`);
      
      let uploadResult;
      try {
        uploadResult = await supabase.storage
          .from('service-photography')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true
          });
      } catch (err: any) {
        console.error("[ServiceImages] Caught Promise Rejection during upload:", err);
        throw new Error("Connection failed: " + (err.message || "Is the bucket missing?"));
      }

      const { data, error } = uploadResult;

      if (error) {
        console.error("[ServiceImages] Supabase Storage Error details:", {
          message: error.message,
          name: error.name,
          status: (error as any).status,
          statusCode: (error as any).statusCode
        });
        throw error;
      }

      console.log("[ServiceImages] Upload successful, getting public URL...");
      const { data: urlData } = supabase.storage
        .from('service-photography')
        .getPublicUrl(filePath);
      
      const publicUrl = urlData.publicUrl;

      console.log(`[ServiceImages] Public URL generated: ${publicUrl}`);
      
      // Ensure the URL is actually accessible
      try {
        const checkRes = await fetch(publicUrl, { method: 'HEAD' });
        if (!checkRes.ok) {
          console.warn(`[ServiceImages] Generated URL might not be accessible: ${checkRes.status}`);
        }
      } catch (e) {
        console.warn(`[ServiceImages] Could not verify URL accessibility:`, e);
      }

      setLocalChanges(prev => ({
        ...prev,
        [slug]: { ...prev[slug], url: publicUrl, status: "draft" }
      }));
      
      toast.success("Photo uploaded as draft");
    } catch (error: any) {
      console.error("[ServiceImages] Fatal Upload Error:", error);
      toast.error("Upload failed: " + (error.message || "Unknown error"));
    } finally {
      setUploading(prev => ({ ...prev, [slug]: false }));
    }
  };

  const handleStatusChange = (slug: string, status: "draft" | "published") => {
    setLocalChanges(prev => ({
      ...prev,
      [slug]: { ...prev[slug], status }
    }));
  };

  const handleSave = (slug: string) => {
    const change = localChanges[slug];
    const existing = imageMap.get(slug);
    
    if (!change?.url && !existing?.image_url) {
      toast.error("No image to save");
      return;
    }

    const finalData = {
      id: existing?.id,
      service_slug: slug,
      image_url: change?.url || existing.image_url,
      status: change?.status || existing?.status || "published"
    };

    console.log(`[ServiceImages] Publishing change for slug "${slug}":`, finalData);
    
    upsertMutation.mutate(finalData);
    
    setLocalChanges(prev => {
        const newChanges = { ...prev };
        delete newChanges[slug];
        return newChanges;
    });
  };

  const isLoading = imagesLoading || servicesLoading;

  return (
    <div className="max-w-6xl mx-auto p-6 bg-[#fafafa] min-h-screen">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/admin" className="text-muted-foreground hover:text-foreground bg-white p-2 rounded-full border border-border/50 shadow-sm transition-all active:scale-95">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#1a1a1a]">Service Photography</h1>
          <p className="text-muted-foreground mt-1">Manage the photos customers see on each service.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {catalogServices?.filter(s => s.active).map((service) => {
            const saved = imageMap.get(service.slug);
            const local = localChanges[service.slug];
            const currentUrl = local?.url ?? saved?.image_url ?? "";
            const currentStatus = local?.status ?? saved?.status ?? "published";
            const isDirty = local !== undefined;
            const isUploading = uploading[service.slug];
            const fileInputRef = useRef<HTMLInputElement>(null);

            return (
              <Card key={service.id} className="overflow-hidden border-border/40 shadow-sm bg-white hover:shadow-md transition-shadow duration-300">
                <div 
                  className="relative aspect-[16/10] bg-muted group cursor-pointer overflow-hidden border-b border-border/40"
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                >
                  {currentUrl ? (
                    <img src={currentUrl} alt={service.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground/40 space-y-3">
                      <ImageIcon className="h-12 w-12" />
                      <span className="text-[10px] uppercase font-black tracking-widest">No Image Uploaded</span>
                      <Button variant="outline" size="sm" className="bg-white border-dashed text-[10px] font-bold h-7">
                        + UPLOAD PHOTO
                      </Button>
                    </div>
                  )}

                  {isUploading && (
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center text-white space-y-3 z-10">
                      <Loader2 className="h-8 w-8 animate-spin" />
                      <span className="text-[10px] font-bold tracking-widest uppercase">Uploading...</span>
                    </div>
                  )}

                  {currentUrl && !isUploading && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <Button variant="secondary" size="sm" className="bg-white/90 text-[10px] font-bold shadow-lg">
                        REPLACE PHOTO
                      </Button>
                    </div>
                  )}

                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/png, image/jpeg, image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(service.slug, file);
                    }}
                  />
                </div>

                <div className="p-5 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-bold text-base text-[#1a1a1a] truncate">{service.name}</h3>
                      <div className={cn(
                        "text-[9px] uppercase font-black px-2 py-0.5 rounded-full tracking-tighter flex items-center gap-1.5",
                        currentStatus === "published" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-amber-50 text-amber-600 border border-amber-100"
                      )}>
                        <div className={cn("h-1.5 w-1.5 rounded-full", currentStatus === "published" ? "bg-emerald-500" : "bg-amber-500")} />
                        {currentStatus}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 font-mono uppercase tracking-tighter">ID: {service.slug}</span>
                  </div>

                  <div className="flex items-center gap-3 pt-2 border-t border-border/30">
                    <div className="flex-1">
                      <Select value={currentStatus} onValueChange={(val: any) => handleStatusChange(service.slug, val)}>
                        <SelectTrigger className="h-8 text-[11px] font-bold bg-[#fcfcfc] border-border/40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="published" className="text-[11px] font-medium">Published</SelectItem>
                          <SelectItem value="draft" className="text-[11px] font-medium">Draft</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-2">
                       {saved && !isDirty && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (window.confirm("Remove this image?")) deleteMutation.mutate(saved.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      
                      {isDirty && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-muted-foreground hover:bg-muted"
                          onClick={() => setLocalChanges(prev => {
                            const next = { ...prev };
                            delete next[service.slug];
                            return next;
                          })}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}

                      <Button 
                        onClick={() => handleSave(service.slug)}
                        disabled={!isDirty || upsertMutation.isPending}
                        size="sm"
                        className={cn(
                          "h-8 px-4 text-[11px] font-black tracking-tight rounded-lg",
                          isDirty ? "bg-[#ff6b00] hover:bg-[#e66000] text-white shadow-sm" : "bg-muted/50 text-muted-foreground cursor-not-allowed"
                        )}
                      >
                        {upsertMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : isDirty ? (
                          <><Save className="h-3 w-3 mr-2" /> PUBLISH</>
                        ) : (
                          <><Check className="h-3 w-3 mr-2" /> SAVED</>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

