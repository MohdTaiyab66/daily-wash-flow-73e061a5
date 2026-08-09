import { useState, useEffect, useCallback, useRef } from "react";
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
        "featured-carousel relative w-full overflow-hidden rounded-[28px] bg-[#1a1a1a] aspect-[1.87/1] touch-pan-y", 
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
            className="featured-carousel-item relative h-full w-full shrink-0 overflow-hidden cursor-pointer active:scale-[0.99] transition-transform duration-200"
            onClick={() => onItemClick?.(item)}
          >
            <img 
              src={item.image} 
              alt={item.title} 
              className="absolute inset-0 h-full w-full object-cover object-center"
              loading={i === 0 ? "eager" : "lazy"}
            />
          </div>
        ))}
      </div>

      {/* Pagination indicators - kept outside the image flow but over the bottom */}
      <div className="absolute bottom-4 left-6 flex gap-1.5 z-20">
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
              i === index ? "w-4 bg-[#FF6B00]" : "w-1.5 bg-white/50"
            )}
          />
        ))}
      </div>
    </div>
  );
}


