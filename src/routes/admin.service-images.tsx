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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, ArrowLeft, Image as ImageIcon, Save, Check } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/service-images")({
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw new Error("Unauthorized");
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: sess.session.user.id,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: Admin access required");
  },
  component: ServiceImagesAdminPage,
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
      toast.success("Saved successfully");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-service-images"] });
      toast.success("Deleted");
    },
  });

  const imageMap = useMemo(() => {
    const map = new Map();
    images?.forEach(img => map.set(img.service_slug, img));
    return map;
  }, [images]);

  const [uploadState, setUploadState] = useState<{ [slug: string]: { url: string, status: "draft" | "published" } }>({});

  const handleUpdateLocal = (slug: string, url: string) => {
    setUploadState(prev => ({ ...prev, [slug]: { ...prev[slug], url } }));
  };

  const handleStatusLocal = (slug: string, status: "draft" | "published") => {
    const current = uploadState[slug]?.url || imageMap.get(slug)?.image_url || "";
    setUploadState(prev => ({ ...prev, [slug]: { url: current, status } }));
  };

  const handleSave = (slug: string) => {
    const local = uploadState[slug];
    const existing = imageMap.get(slug);
    
    if (!local?.url && !existing?.image_url) {
      toast.error("Please provide an image URL");
      return;
    }

    upsertMutation.mutate({
      id: existing?.id,
      service_slug: slug,
      image_url: local?.url || existing.image_url,
      status: local?.status || existing?.status || "published"
    });
  };

  const isLoading = imagesLoading || servicesLoading;

  return (
    <div className="max-w-5xl p-6">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/admin/marketplace" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#1a1a1a]">Service Photography</h1>
          <p className="text-muted-foreground mt-1">Manage individual images for service cards shown to customers.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-6">
          {catalogServices?.filter(s => s.active).map((service) => {
            const saved = imageMap.get(service.slug);
            const local = uploadState[service.slug];
            const currentUrl = local?.url ?? saved?.image_url ?? "";
            const currentStatus = local?.status ?? saved?.status ?? "published";
            const isDirty = local !== undefined && (local.url !== saved?.image_url || local.status !== saved?.status);

            return (
              <Card key={service.id} className="overflow-hidden border-border/50 shadow-sm">
                <div className="p-5 flex flex-col md:flex-row gap-6">
                  {/* Image Preview */}
                  <div className="w-full md:w-56 h-36 shrink-0 rounded-xl overflow-hidden bg-muted flex items-center justify-center border border-border">
                    {currentUrl ? (
                      <img src={currentUrl} alt={service.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center text-muted-foreground/30">
                        <ImageIcon className="h-10 w-10 mb-2" />
                        <span className="text-[10px] uppercase font-bold tracking-widest">No Image</span>
                      </div>
                    )}
                  </div>

                  {/* Controls */}
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-lg text-foreground">{service.name}</h3>
                      <div className="flex items-center gap-2">
                        {saved && (
                          <span className={cn(
                            "text-[10px] uppercase font-black px-2 py-0.5 rounded-full tracking-widest",
                            saved.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                          )}>
                            {saved.status}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-2 space-y-1.5">
                        <Label className="text-xs uppercase font-bold tracking-widest text-muted-foreground">Image URL</Label>
                        <Input 
                          value={currentUrl} 
                          onChange={(e) => handleUpdateLocal(service.slug, e.target.value)}
                          placeholder="https://images.unsplash.com/..."
                          className="bg-muted/30 focus-visible:ring-primary/20"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs uppercase font-bold tracking-widest text-muted-foreground">Status</Label>
                        <Select value={currentStatus} onValueChange={(val: any) => handleStatusLocal(service.slug, val)}>
                          <SelectTrigger className="bg-muted/30">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="published">Published</SelectItem>
                            <SelectItem value="draft">Draft</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border/40">
                      <div className="text-[10px] text-muted-foreground/60 flex items-center gap-2">
                        <span className="font-mono uppercase">Slug: {service.slug}</span>
                        {saved?.updated_at && (
                          <span>• Updated {new Date(saved.updated_at).toLocaleDateString()}</span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {saved && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8"
                            onClick={() => deleteMutation.mutate(saved.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Remove
                          </Button>
                        )}
                        <Button 
                          onClick={() => handleSave(service.slug)}
                          disabled={!isDirty || upsertMutation.isPending}
                          size="sm"
                          className={cn(
                            "h-8 px-4 font-bold tracking-tight",
                            isDirty ? "bg-primary hover:bg-primary/90 text-white" : "bg-muted text-muted-foreground"
                          )}
                        >
                          {upsertMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isDirty ? (
                            <><Save className="h-4 w-4 mr-2" /> Save & Publish</>
                          ) : (
                            <><Check className="h-4 w-4 mr-2" /> Saved</>
                          )}
                        </Button>
                      </div>
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

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(" ");
}
