import { MapPin, ChevronDown } from "lucide-react";
import { ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface UWHeaderProps {
  area: string;
  onAreaClick: () => void;
  children?: ReactNode;
}

export function UWHeader({ 
  area, 
  onAreaClick,
  children
}: UWHeaderProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef<HTMLDivElement>(null);
  const expandedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const isCollapsed = !entry.isIntersecting;
        
        if (compactRef.current) {
          compactRef.current.style.opacity = isCollapsed ? "1" : "0";
          compactRef.current.style.transform = isCollapsed ? "translateY(0)" : "translateY(-8px)";
          compactRef.current.style.pointerEvents = isCollapsed ? "auto" : "none";
        }
        
        if (expandedRef.current) {
          // Subtle background shift for the sticky container
          expandedRef.current.style.backgroundColor = isCollapsed ? "white" : "#FFF9F3";
          expandedRef.current.style.boxShadow = isCollapsed ? "0 2px 10px rgba(0,0,0,0.03)" : "none";
        }
      },
      { threshold: 0, rootMargin: "-20px 0px 0px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);
  
  return (
    <>
      {/* 1. Normal Flow Header (Expanded) */}
      <div 
        ref={expandedRef}
        className="relative z-20 px-5 pt-[env(safe-area-inset-top,12px)] bg-[#FFF9F3] transition-colors duration-200"
      >
        <div className="flex flex-col">
          {/* Row 1: Location */}
          <div className="flex items-center pb-2">
            <div 
              className="flex items-center gap-1.5 cursor-pointer active:opacity-70" 
              onClick={onAreaClick}
            >
              <MapPin className="h-4 w-4 text-[#FF6B00]" />
              <span className="text-[16px] font-[600] uppercase tracking-[0.2px] text-[#FF6B00] truncate max-w-[280px]">
                {area || "Set location"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-[#FF6B00]/40" />
            </div>
          </div>

          {/* Divider */}
          <div className="h-[1px] w-full bg-[#FF6B00]/5 mb-2" />

          {/* Row 2: Vehicle Selector Content */}
          <div className="pb-3">
            {children}
          </div>
        </div>
      </div>

      {/* Sentinel for IntersectionObserver */}
      <div ref={sentinelRef} className="h-px w-full -mt-2 pointer-events-none" />

      {/* 2. Sticky Compact Header (Overlay) */}
      <div 
        ref={compactRef}
        className="fixed top-0 left-0 right-0 z-50 px-5 pt-[env(safe-area-inset-top,12px)] pb-2 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.03)] opacity-0 translate-y-[-8px] transition-all duration-[220ms] ease-out pointer-events-none"
      >
         {/* Subtle orange accent line */}
        <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#FF6B00]/20 to-transparent pointer-events-none" />
        
        {/* Compact Vehicle View handled by parent via portal or re-render is avoided by using a separate UI structure if possible, 
            but for consistency with the "children" pattern while fixing performance, we'll keep it simple. */}
        <div className="compact-header-content" />
      </div>
    </>
  );
}
