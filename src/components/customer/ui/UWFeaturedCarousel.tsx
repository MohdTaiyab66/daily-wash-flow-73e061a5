import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronRight, AlertCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUILD_VERSION } from "@/lib/build-info";

interface CarouselItem {
  id: string;
  title: string;
  subtitle: string;
  price: number;
  image: string;
  link: string;
  slideNumber?: number;
}

interface UWFeaturedCarouselProps {
  items: CarouselItem[];
  className?: string;
  onItemClick?: (item: CarouselItem) => void;
}

export function UWFeaturedCarousel({ items, className, onItemClick }: UWFeaturedCarouselProps) {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [loadErrors, setLoadErrors] = useState<Record<string, boolean>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<number | null>(null);
  const touchEnd = useRef<number | null>(null);

  // Min distance for swipe
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    touchEnd.current = null;
    touchStart.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEnd.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) return;
    const distance = touchStart.current - touchEnd.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isLeftSwipe) {
      setIndex((prev) => (prev + 1) % items.length);
      setIsPaused(true);
      setTimeout(() => setIsPaused(false), 5000);
    }
    if (isRightSwipe) {
      setIndex((prev) => (prev - 1 + items.length) % items.length);
      setIsPaused(true);
      setTimeout(() => setIsPaused(false), 5000);
    }
  };

  const next = useCallback(() => {
    if (!document.hidden) {
      setIndex((prev) => (prev + 1) % items.length);
    }
  }, [items.length]);

  useEffect(() => {
    if (isPaused || items.length <= 1) return;
    const timer = setInterval(next, 4000);
    return () => clearInterval(timer);
  }, [isPaused, items.length, next]);

  if (!items.length) return null;

  return (
    <div 
      ref={containerRef}
      className={cn("featured-carousel relative w-full overflow-hidden rounded-[26px] bg-[#1a1a1a] aspect-[16/9] touch-pan-y", className)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div 
        className="flex h-full transition-transform duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {items.map((item, i) => {
          const hasError = loadErrors[item.id];
          // If it's from Unsplash or our dedicated carousel bucket, it's a banner with embedded text
          const isBanner = item.image.includes('images.unsplash.com') || item.image.includes('daily-shine-carousel');
          

          
          return (
            <div 
              key={item.id} 
              className="featured-carousel-item relative h-full w-full shrink-0 overflow-hidden cursor-pointer active:scale-[0.98] transition-transform duration-200"
              onClick={() => onItemClick?.(item)}
            >
              {hasError ? (
                <div className="flex h-full w-full flex-col items-center justify-center bg-destructive/10 text-destructive p-4 text-center">
                  <AlertCircle className="h-10 w-10 mb-2" />
                  <span className="text-[14px] font-black uppercase">IMAGE LOAD ERROR</span>
                  <div className="mt-4 flex flex-col gap-2 w-full max-w-[200px] mx-auto">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(item.image, '_blank');
                      }}
                      className="bg-destructive text-white px-3 py-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="h-3 w-3" /> TEST URL
                    </button>
                    <span className="text-[8px] font-mono break-all opacity-70 bg-white/10 p-2 rounded">{item.image}</span>
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0">
                  <img 
                    src={item.image} 
                    alt={item.title} 
                    className={cn(
                      "h-full w-full object-cover transition-opacity duration-500",
                      isBanner ? "opacity-100" : "opacity-100"
                    )}
                    loading={i === 0 ? "eager" : "lazy"}
                    onLoad={() => {
                      console.log(`[UW_CAROUSEL_DEBUG] IMAGE_LOAD_SUCCESS slide=${item.slideNumber || i+1} url=${item.image}`);
                    }}
                    onError={(e) => {
                      console.error(`[UW_CAROUSEL_DEBUG] IMAGE_LOAD_ERROR slide=${item.slideNumber || i+1} url=${item.image}`);
                      setLoadErrors(prev => ({ ...prev, [item.id]: true }));
                    }}
                  />
                  {/* Premium gradient overlay for readability - always show slightly if text is present */}
                  <div className={cn(
                    "absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent",
                    isBanner ? "opacity-60" : "opacity-100"
                  )} />
                </div>
              )}

              {/* Debug Overlay */}
              <div className="absolute top-2 left-2 z-50 bg-black/80 p-2 rounded-lg border border-white/20 pointer-events-none">
                <div className="text-[8px] font-mono text-white leading-tight">
                  <div className="text-[#FF6B00] font-black">BUILD: {BUILD_VERSION}</div>
                  <div>SLIDE: {item.slideNumber || i+1}</div>
                  <div>SOURCE: {isBanner ? "BANNER" : "DATABASE"}</div>
                  <div className="max-w-[150px] truncate">URL: {item.image}</div>
                </div>
              </div>

              {/* Only render text overlay if it's NOT a banner (which already contains text) */}
              {!isBanner && (
                <div className="absolute inset-0 p-6 flex flex-col justify-end pb-20">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#FF6B00] mb-1">
                    FEATURED SERVICE
                  </span>
                  <h3 className="text-[22px] font-black text-white leading-tight tracking-tight">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-[13px] font-medium text-white/70">
                    {item.subtitle}
                  </p>
                </div>
              )}

              {/* Always show price/button overlay as these are actionable UI */}
              <div className="absolute inset-x-0 bottom-0 p-6 flex items-center justify-between z-10 pointer-events-none">
                <div className="text-white">
                  <span className="text-[18px] font-black">₹{item.price}</span>
                </div>
                <button 
                  className="flex h-10 items-center gap-2 rounded-full bg-[#FF6B00] px-4 text-[13px] font-black text-white shadow-lg shadow-[#FF6B00]/30 transition-transform active:scale-90 pointer-events-auto"
                  onClick={(e) => { e.stopPropagation(); onItemClick?.(item); }}
                >
                  Book now <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-4 left-6 flex gap-1.5">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              setIndex(i);
              setIsPaused(true);
              setTimeout(() => setIsPaused(false), 5000);
            }}
            className={cn(
              "h-1 rounded-full transition-all duration-300",
              i === index ? "w-4 bg-[#FF6B00]" : "w-1.5 bg-[#9CA3AF]/50"
            )}
          />
        ))}
      </div>
    </div>
  );
}
