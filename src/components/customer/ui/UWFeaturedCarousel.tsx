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
}

interface UWFeaturedCarouselProps {
  items: CarouselItem[];
  className?: string;
  onItemClick?: (item: CarouselItem) => void;
}

export function UWFeaturedCarousel({ items, className, onItemClick }: UWFeaturedCarouselProps) {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
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
      className={cn("featured-carousel relative w-full overflow-hidden rounded-[26px] bg-black aspect-[16/9] touch-pan-y", className)}
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
        {items.map((item) => (
          <div 
            key={item.id} 
            className="featured-carousel-item relative h-full w-full shrink-0 overflow-hidden cursor-pointer active:scale-[0.98] transition-transform duration-200"
            onClick={() => onItemClick?.(item)}
          >
            <img 
              src={item.image} 
              alt={item.title} 
              className="h-full w-full object-cover opacity-60 transition-opacity duration-500"
              loading={items.indexOf(item) === 0 ? "eager" : "lazy"}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-6 flex flex-col justify-end">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-1">
                FEATURED SERVICE
              </span>
              <h3 className="text-[22px] font-black text-white leading-tight tracking-tight">
                {item.title}
              </h3>
              <p className="mt-1 text-[13px] font-medium text-white/70">
                {item.subtitle}
              </p>
              
              <div className="mt-4 flex items-center justify-between">
                <div className="text-white">
                  <span className="text-[18px] font-black">₹{item.price}</span>
                </div>
                <button 
                  className="flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-[13px] font-black text-white shadow-lg shadow-primary/30 transition-transform active:scale-90"
                  onClick={(e) => { e.stopPropagation(); onItemClick?.(item); }}
                >
                  Book now <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="absolute bottom-4 left-6 flex gap-1.5">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className={cn(
              "h-1 rounded-full transition-all duration-300",
              i === index ? "w-4 bg-primary" : "w-1.5 bg-white/30"
            )}
          />
        ))}
      </div>
    </div>
  );
}
