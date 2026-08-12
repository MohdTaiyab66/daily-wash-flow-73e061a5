import { useEffect, useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

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
  onItemClick?: (item: CarouselItem) => void;
  isLoading?: boolean;
}

export function UWFeaturedCarousel({ items, onItemClick, isLoading }: UWFeaturedCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const scrollLeft = scrollRef.current.scrollLeft;
    const width = scrollRef.current.offsetWidth;
    const index = Math.round(scrollLeft / width);
    if (index !== activeIndex) {
      setActiveIndex(index);
    }
  }, [activeIndex]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("scroll", handleScroll, { passive: true });
      return () => el.removeEventListener("scroll", handleScroll);
    }
  }, [handleScroll]);

  // Auto-scroll
  useEffect(() => {
    if (items.length <= 1) return;
    const interval = setInterval(() => {
      if (!scrollRef.current) return;
      const nextIndex = (activeIndex + 1) % items.length;
      scrollRef.current.scrollTo({
        left: nextIndex * scrollRef.current.offsetWidth,
        behavior: "smooth"
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [activeIndex, items.length]);

  return (
    <div className="relative w-full aspect-[21/9] overflow-hidden rounded-[16px]">
      {isLoading ? (
        <Skeleton className="w-full h-full rounded-[16px]" />
      ) : (
        <>
          <div 
            ref={scrollRef}
            className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar w-full h-full"
          >
            {items.map((item, idx) => (
              <div 
                key={item.id || idx}
                onClick={() => onItemClick?.(item)}
                className="flex-shrink-0 w-full h-full snap-center cursor-pointer overflow-hidden"
              >
                <img 
                  src={item.image} 
                  alt={item.title} 
                  className="w-full h-full object-cover transition-opacity duration-700 ease-in-out"
                  onLoad={(e) => (e.currentTarget.style.opacity = "1")}
                  style={{ opacity: 0 }}
                />
              </div>
            ))}
          </div>
          
          {items.length > 1 && (
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
              {items.map((_, idx) => (
                <div 
                  key={idx}
                  className={cn(
                    "h-1 rounded-full transition-all duration-300",
                    idx === activeIndex ? "w-3 bg-white" : "w-1 bg-white/40"
                  )}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
