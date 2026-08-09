import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const touchStart = useRef<number | null>(null);
  const touchEnd = useRef<number | null>(null);

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
    if (distance > minSwipeDistance) {
      setIndex((prev) => (prev + 1) % items.length);
    } else if (distance < -minSwipeDistance) {
      setIndex((prev) => (prev - 1 + items.length) % items.length);
    }
    setIsPaused(true);
    setTimeout(() => setIsPaused(false), 5000);
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
      className={cn(
        "featured-carousel relative w-full overflow-hidden rounded-[20px] bg-white aspect-[1.87/1] touch-pan-y shadow-sm", 
        className
      )}
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
        {items.map((item, i) => (
          <div 
            key={item.id} 
            className="featured-carousel-item relative h-full w-full shrink-0 cursor-pointer overflow-hidden"
            onClick={() => onItemClick?.(item)}
          >
            {/* 
              Requirement: IMAGE IS THE ENTIRE CARD. 
              Aspect ratio is fixed to 1.87/1 to match the measured card dimensions.
              object-cover ensures the creative fills the space without distortion.
            */}
            <img 
              src={item.image} 
              alt={item.title || "Urban Wash Daily Shine"} 
              className="w-full h-full object-cover block"
              loading={i === 0 ? "eager" : "lazy"}
            />

            {/* Restored Daily Shine Booking Button - Visual Overlay */}
            <div className="absolute bottom-6 right-6 z-10">
              <button 
                className="flex h-11 items-center gap-2 rounded-full bg-[#FF6B00] px-6 text-[14px] font-black text-white shadow-lg shadow-[#FF6B00]/30 transition-all active:scale-95"
                onClick={(e) => {
                  e.stopPropagation();
                  onItemClick?.(item);
                }}
              >
                Book now <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination indicators - matching target design */}
      {items.length > 1 && (
        <div className="absolute bottom-4 left-6 flex gap-2 z-20 pointer-events-none">
          {items.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-all duration-300",
                i === index ? "w-4 bg-[#FF6B00]" : "bg-white/50 shadow-sm"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}




