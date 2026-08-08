import { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Calendar, Sparkles, MapPin } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

type Photo = {
  stage: string;
  angle: string;
  storage_path: string;
  captured_at: string;
  url?: string;
};

interface ServicePhotoViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: Photo[];
  initialIndex?: number;
  serviceName?: string;
  serviceDate?: string;
}

export function ServicePhotoViewer({
  open,
  onOpenChange,
  photos,
  initialIndex = 0,
  serviceName = "Daily Shine",
  serviceDate,
}: ServicePhotoViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) setCurrentIndex(initialIndex);
  }, [open, initialIndex]);

  useEffect(() => {
    if (!open || !photos.length) return;

    const fetchUrls = async () => {
      const pathsToFetch = photos.filter(p => !p.url).map(p => p.storage_path);
      
      if (pathsToFetch.length === 0) {
        const urlMap: Record<string, string> = {};
        photos.forEach(p => { if (p.url) urlMap[p.storage_path] = p.url; });
        setSignedUrls(urlMap);
        return;
      }

      const { data } = await supabase.storage
        .from("service-photos")
        .createSignedUrls(pathsToFetch, 3600);

      if (data) {
        const urlMap: Record<string, string> = {};
        photos.forEach(p => { if (p.url) urlMap[p.storage_path] = p.url; });
        
        let fetchIdx = 0;
        photos.forEach(p => {
          const signed = data[fetchIdx]?.signedUrl;
          if (!p.url && signed) {
            urlMap[p.storage_path] = signed;
            fetchIdx++;
          }
        });

        setSignedUrls(urlMap);
      }
    };


    fetchUrls();
  }, [open, photos]);

  if (!photos.length) return null;

  const currentPhoto = photos[currentIndex];
  const currentUrl = signedUrls[currentPhoto?.storage_path];

  const next = () => setCurrentIndex((i) => (i + 1) % photos.length);
  const prev = () => setCurrentIndex((i) => (i - 1 + photos.length) % photos.length);

  const stageLabels: Record<string, string> = {
    before: "Before",
    after: "After",
    proof: "Proof",
    dirty: "Dirty Vehicle",
    unavailable: "Unavailable",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-none bg-black/95 p-0 shadow-2xl outline-none sm:rounded-3xl">
        <div className="relative flex h-[80vh] flex-col overflow-hidden">
          {/* Header */}
          <div className="absolute inset-x-0 top-0 z-50 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-6 py-6">
            <div className="text-white">
              <h3 className="text-lg font-black">{serviceName}</h3>
              {serviceDate && (
                <div className="mt-1 flex items-center gap-2 text-xs font-bold text-white/60">
                  <Calendar className="h-3 w-3" />
                  {new Date(serviceDate).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              )}
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-transform active:scale-90"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Main Image View */}
          <div className="relative flex flex-1 items-center justify-center p-4">
            {currentUrl ? (
              <img
                src={currentUrl}
                alt={currentPhoto.stage}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-64 w-64 items-center justify-center rounded-3xl bg-white/5">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              </div>
            )}

            {photos.length > 1 && (
              <>
                <button
                  onClick={prev}
                  className="absolute left-4 flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition-transform active:scale-90"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  onClick={next}
                  className="absolute right-4 flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition-transform active:scale-90"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </div>

          {/* Footer Info */}
          <div className="bg-gradient-to-t from-black/80 to-transparent px-8 pb-10 pt-6">
             <div className="flex items-center justify-between">
                <div>
                   <div className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">
                      {stageLabels[currentPhoto.stage] || currentPhoto.stage}
                   </div>
                   <div className="mt-2 text-sm font-bold text-white/80">
                      {currentPhoto.angle.charAt(0).toUpperCase() + currentPhoto.angle.slice(1)} View
                   </div>
                </div>
                <div className="text-[14px] font-black text-white/40">
                   {currentIndex + 1} / {photos.length}
                </div>
             </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
