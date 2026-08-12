import { useState, useEffect, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Calendar, Sparkles, MapPin, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Photo = {
  stage: string;
  angle: string;
  storage_path: string;
  captured_at: string;
  url?: string;
  partner_name?: string | null;
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
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    touchStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!touchStart.current) return;
    const dx = e.clientX - touchStart.current.x;
    setSwipeOffset(dx);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!touchStart.current) return;
    const dx = e.clientX - touchStart.current.x;
    const dy = e.clientY - touchStart.current.y;
    touchStart.current = null;

    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) prev();
      else next();
    }
    setSwipeOffset(0);
  };

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
    before: "BEFORE",
    after: "AFTER",
    proof: "SERVICE PHOTO",
    dirty: "DIRTY VEHICLE",
    unavailable: "UNAVAILABLE",
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-none bg-black p-0 shadow-2xl outline-none sm:rounded-3xl">
        <div className="relative flex h-[85vh] flex-col overflow-hidden">
          {/* Header */}
          <div className="absolute inset-x-0 top-0 z-50 flex items-center justify-between px-6 py-6">
            <button
              onClick={() => onOpenChange(false)}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white backdrop-blur-md active:scale-95"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="rounded-full bg-white/10 px-3 py-1 text-[13px] font-black text-white backdrop-blur-md">
              {currentIndex + 1} / {photos.length}
            </div>
          </div>

          {/* Main Image View - with Swipe area */}
          <div 
            className="relative flex flex-1 items-center justify-center p-0 touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {currentUrl ? (
              <img
                src={currentUrl}
                alt={currentPhoto.stage}
                className="h-full w-full object-contain select-none transition-transform duration-300"
                draggable={false}
                style={{
                  transform: `translateX(${swipeOffset}px)`,
                }}
              />
            ) : (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-white/20" />
                <span className="text-[12px] font-medium text-white/20 uppercase tracking-widest">Loading Photo</span>
              </div>
            )}

            {/* Tap areas for navigation */}
            {photos.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); prev(); }}
                  className="absolute left-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur-md transition-all active:scale-90"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); next(); }}
                  className="absolute right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur-md transition-all active:scale-90"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          {/* Footer Info */}
          <div className="bg-gradient-to-t from-black/95 to-transparent px-8 pb-12 pt-16">
             <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                   <div className="space-y-1">
                      <div className="text-[20px] font-black text-white leading-tight">
                        {serviceName}
                      </div>
                      <div className="flex items-center gap-2 text-[14px] font-bold text-white/50">
                        <span>{new Date(currentPhoto.captured_at || serviceDate || "").toLocaleDateString("en-IN", { day: 'numeric', month: 'short' })}</span>
                        <span className="h-1 w-1 rounded-full bg-white/20" />
                        <span>{new Date(currentPhoto.captured_at || serviceDate || "").toLocaleTimeString("en-IN", { hour: 'numeric', minute: '2-digit' })}</span>
                      </div>
                   </div>
                   {(currentPhoto.stage === 'before' || currentPhoto.stage === 'after') && (
                     <div className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.15em] text-black shadow-lg">
                       {currentPhoto.stage}
                     </div>
                   )}
                </div>

                {(currentPhoto.partner_name || (currentPhoto as any).vehicle_label) && (
                  <div className="text-[13px] font-bold text-white/40 space-y-1">
                    {(currentPhoto as any).vehicle_label && (
                      <p>{(currentPhoto as any).vehicle_label} · {(currentPhoto as any).vehicle_registration}</p>
                    )}
                    {currentPhoto.partner_name && (
                      <p>Serviced by {currentPhoto.partner_name}</p>
                    )}
                  </div>
                )}

                {/* Page Indicator */}
                <div className="flex items-center justify-between border-t border-white/10 pt-6">
                  <div className="flex gap-2">
                    {photos.map((_, i) => (
                      <div 
                        key={i} 
                        className={cn(
                          "h-1 rounded-full transition-all duration-300",
                          i === currentIndex ? "w-8 bg-[#FF6B00]" : "w-2 bg-white/20"
                        )} 
                      />
                    ))}
                  </div>
                </div>
             </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
