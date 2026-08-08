import { z } from "zod";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPromoImages, upsertPromoImage, deletePromoImage } from "@/lib/promo.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, ArrowLeft, GripVertical, Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/marketplace-settings")({
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
  component: MarketplaceSettingsPage,
});

function MarketplaceSettingsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPromoImages);
  const upsertFn = useServerFn(upsertPromoImage);
  const deleteFn = useServerFn(deletePromoImage);

  const { data: images, isLoading } = useQuery({
    queryKey: ["admin-promo-images"],
    queryFn: () => listFn(),
  });

  const upsertMutation = useMutation({
    mutationFn: (data: any) => upsertFn({ data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-promo-images"] });
      toast.success("Saved successfully");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-promo-images"] });
      toast.success("Deleted");
    },
  });

  const [newImage, setNewImage] = useState({ image_url: "", title: "", subtitle: "", sort_order: 0, status: "draft" as const });

  const handleAdd = () => {
    if (!newImage.image_url) return toast.error("Image URL is required");
    upsertMutation.mutate(newImage);
    setNewImage({ image_url: "", title: "", subtitle: "", sort_order: 0, status: "draft" });
  };

  return (
    <div className="max-w-4xl p-6">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/admin/marketplace" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-[#1a1a1a]">Featured Photography</h1>
      </div>

      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="text-lg font-bold mb-4">Add Daily Shine Creative</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Image URL</Label>
              <Input 
                value={newImage.image_url} 
                onChange={e => setNewImage(prev => ({ ...prev, image_url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input 
                type="number"
                value={newImage.sort_order} 
                onChange={e => setNewImage(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Main Title (Baked in look)</Label>
              <Input 
                value={newImage.title} 
                onChange={e => setNewImage(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Your car, clean every morning"
              />
            </div>
            <div className="space-y-2">
              <Label>Subtitle</Label>
              <Input 
                value={newImage.subtitle} 
                onChange={e => setNewImage(prev => ({ ...prev, subtitle: e.target.value }))}
                placeholder="Doorstep detailing..."
              />
            </div>
          </div>
          <Button onClick={handleAdd} className="mt-4 bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" /> Add Image
          </Button>
        </Card>

        <div className="space-y-4">
          <h2 className="text-lg font-bold">Manage Published Creative</h2>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : images?.map((img: any) => (
            <Card key={img.id} className="overflow-hidden">
              <div className="flex flex-col sm:flex-row gap-4 p-4">
                <div className="w-full sm:w-48 h-28 shrink-0 rounded-lg overflow-hidden bg-muted">
                  <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <Input 
                        value={img.title || ""} 
                        onChange={e => upsertMutation.mutate({ ...img, title: e.target.value })}
                        className="font-bold border-none p-0 h-auto focus-visible:ring-0 bg-transparent"
                        placeholder="No title"
                      />
                      <Input 
                        value={img.subtitle || ""} 
                        onChange={e => upsertMutation.mutate({ ...img, subtitle: e.target.value })}
                        className="text-sm text-muted-foreground border-none p-0 h-auto focus-visible:ring-0 bg-transparent"
                        placeholder="No subtitle"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={img.status === "published" ? "default" : "outline"}
                        size="sm"
                        className="h-8"
                        onClick={() => upsertMutation.mutate({ ...img, status: img.status === "published" ? "draft" : "published" })}
                      >
                        {img.status === "published" ? "Published" : "Draft"}
                      </Button>
                      <Switch 
                        checked={img.is_active} 
                        onCheckedChange={val => upsertMutation.mutate({ ...img, is_active: val })}
                      />
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => deleteMutation.mutate(img.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><GripVertical className="h-3 w-3" /> Order: {img.sort_order}</span>
                    <span className="truncate flex-1">{img.image_url.slice(0, 40)}...</span>
                  </div>
                  <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground/40 pt-2">
                    ID: {img.id.slice(0, 8)} • Service: {img.service_id ? 'Scoped' : 'Global Daily Shine'}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
