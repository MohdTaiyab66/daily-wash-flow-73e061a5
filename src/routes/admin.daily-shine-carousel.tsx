import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCarouselSlides, upsertCarouselSlide, deleteCarouselSlide } from "@/lib/daily-shine-carousel.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Trash2, ArrowLeft, Image as ImageIcon, Save, Check, Upload, X } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/daily-shine-carousel")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw new Error("Unauthorized");
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: sess.session.user.id,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: Admin access required");
  },
  component: DailyShineCarouselPage,
});

function DailyShineCarouselPage() {
  const qc = useQueryClient();
  const listSlidesFn = useServerFn(listCarouselSlides);
  const upsertFn = useServerFn(upsertCarouselSlide);
  const deleteFn = useServerFn(deleteCarouselSlide);

  const { data: slides, isLoading } = useQuery({
    queryKey: ["admin-carousel-slides"],
    queryFn: () => listSlidesFn(),
  });

  const upsertMutation = useMutation({
    mutationFn: (data: any) => upsertFn({ data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-carousel-slides"] });
      toast.success("Slide saved and published");
    },
    onError: (err: any) => toast.error(err.message || "Failed to save"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-carousel-slides"] });
      toast.success("Slide removed");
    },
  });

  return (
    <div className="max-w-6xl mx-auto p-6 bg-[#fafafa] min-h-screen">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/admin" className="text-muted-foreground hover:text-foreground bg-white p-2 rounded-full border border-border/50 shadow-sm transition-all active:scale-95">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#1a1a1a]">Daily Shine Carousel</h1>
          <p className="text-muted-foreground mt-1">Manage the promotional slides on the customer home screen.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3].map((num) => (
            <CarouselSlideCard 
              key={num}
              slideNumber={num}
              slide={slides?.find(s => s.slide_number === num)}
              onSave={(data) => upsertMutation.mutate({ ...data, slide_number: num })}
              onDelete={(id) => deleteMutation.mutate(id)}
              isSaving={upsertMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CarouselSlideCard({ slideNumber, slide, onSave, onDelete, isSaving }: any) {
  const [uploading, setUploading] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"draft" | "published">(slide?.status || "published");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentUrl = localUrl || slide?.image_url;
  const isDirty = localUrl !== null || (slide && status !== slide.status);

  const handleUpload = async (file: File) => {
    try {
      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `slide-${slideNumber}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const { error } = await supabase.storage.from('daily-shine-carousel').upload(fileName, file);
      if (error) throw error;

      const { data: urlData } = supabase.storage.from('daily-shine-carousel').getPublicUrl(fileName);
      setLocalUrl(urlData.publicUrl);
    } catch (e: any) {
      toast.error("Upload failed: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="overflow-hidden border-border/40 shadow-sm bg-white">
      <div className="p-4 border-b border-border/40 bg-muted/30 flex justify-between items-center">
        <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Slide {slideNumber}</h3>
        <div className={cn(
          "text-[9px] uppercase font-black px-2 py-0.5 rounded-full border",
          status === "published" ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-amber-50 text-amber-600 border-amber-100"
        )}>
          {status}
        </div>
      </div>

      <div 
        className="relative aspect-video bg-muted group cursor-pointer overflow-hidden"
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        {currentUrl ? (
          <img src={currentUrl} alt={`Slide ${slideNumber}`} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/30 space-y-2">
            <ImageIcon className="h-10 w-10" />
            <span className="text-[10px] font-bold uppercase tracking-widest">No Image</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <Button variant="secondary" size="sm" className="bg-white/90 text-[10px] font-bold">
            {currentUrl ? "REPLACE IMAGE" : "UPLOAD IMAGE"}
          </Button>
        </div>
        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
      </div>

      <div className="p-5 space-y-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-[10px] font-black uppercase text-muted-foreground/60 mb-1 block">Status</label>
            <select 
              value={status} 
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full h-8 text-[11px] font-bold bg-[#fcfcfc] border border-border/40 rounded-lg px-2"
            >
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-border/30">
          {slide && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/60 hover:text-destructive" onClick={() => window.confirm("Remove?") && onDelete(slide.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <div className="flex-1" />
          <Button 
            disabled={!isDirty || isSaving || !currentUrl} 
            size="sm" 
            className={cn("h-8 px-4 text-[11px] font-black rounded-lg", isDirty ? "bg-[#ff6b00] text-white" : "bg-muted/50 text-muted-foreground")}
            onClick={() => onSave({ id: slide?.id, image_url: currentUrl, status })}
          >
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : isDirty ? "PUBLISH" : "SAVED"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
