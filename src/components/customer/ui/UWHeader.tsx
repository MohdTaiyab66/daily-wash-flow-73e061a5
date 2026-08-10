import { MapPin, ChevronDown, Car } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLayoutEffect, useRef } from "react";

interface UWHeaderProps {
  area: string;
  onAreaClick: () => void;
  activeVehicle?: {
    make: string;
    model: string;
    registration_number: string;
    category: string;
    color: string | null;
  } | null;
  vehicleImage?: string | null;
  onVehicleClick?: () => void;
}

const COLLAPSE_DISTANCE = 60; // Distance over which header collapses

export function UWHeader({ 
  area, 
  onAreaClick,
  activeVehicle,
  vehicleImage,
  onVehicleClick,
}: UWHeaderProps) {
  const containerRef = useRef<HTMLElement>(null);
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const locationTextRef = useRef<HTMLSpanElement>(null);
  const vehicleTextRef = useRef<HTMLSpanElement>(null);
  const vehicleThumbRef = useRef<HTMLDivElement>(null);
  
  useLayoutEffect(() => {
    const header = containerRef.current;
    const wrapper = contentWrapperRef.current;
    const locText = locationTextRef.current;
    const vText = vehicleTextRef.current;
    const vThumb = vehicleThumbRef.current;
    
    if (!header) return;

    const handleScroll = () => {
      const scrollY = window.scrollY;
      const progress = Math.min(Math.max(scrollY / COLLAPSE_DISTANCE, 0), 1);
      
      // Header background & shadow
      // Transition from #FFF1E6 (peach) to a slightly more opaque version or sticky state
      header.style.backgroundColor = `rgba(255, 241, 230, ${0.98 + progress * 0.02})`;
      header.style.backdropFilter = progress > 0.1 ? 'blur(12px)' : 'none';
      // Subtile warm/orange-grey divider
      header.style.borderBottom = `1px solid rgba(255, 107, 0, ${0.08 + progress * 0.04})`;
      header.style.boxShadow = progress > 0.5 ? `0 4px 12px rgba(255, 107, 0, ${progress * 0.03})` : 'none';

      // Compact state adjustments
      if (wrapper) {
        // Vertical padding: 16px -> 12px
        const verticalPadding = 16 - (progress * 4);
        wrapper.style.paddingTop = `${verticalPadding}px`;
        wrapper.style.paddingBottom = `${verticalPadding}px`;
      }

      if (locText) {
        locText.style.fontSize = `${18 - progress * 1}px`;
      }

      if (vText) {
        vText.style.fontSize = `${18 - progress * 1}px`;
      }

      if (vThumb) {
        const scale = 1 - progress * 0.08;
        vThumb.style.transform = `scale(${scale})`;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); 

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header 
      ref={containerRef}
      className="fixed top-0 left-0 right-0 z-[60] bg-[#FFF1E6] will-change-[background-color,border-bottom,box-shadow]"
    >
      <div 
        ref={contentWrapperRef}
        className="px-6 py-4 flex items-center justify-between gap-4 w-full transition-[padding]"
      >
        {/* Left: Unified Location */}
        <div 
          className="flex items-center gap-2 cursor-pointer active:opacity-60 transition-opacity min-w-0 flex-1"
          onClick={onAreaClick}
        >
          <MapPin className="h-5 w-5 text-[#FF6B00] shrink-0" />
          <div className="flex items-center gap-1 min-w-0">
            <span 
              ref={locationTextRef}
              className="text-[18px] font-[600] text-[#FF6B00] whitespace-nowrap overflow-hidden text-ellipsis"
            >
              {area || "Set location"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-[#FF6B00]/40 shrink-0 mt-0.5" />
          </div>
        </div>

        {/* Right: Premium Vehicle Selector */}
        {activeVehicle && (
          <div 
            className="flex items-center gap-2.5 cursor-pointer active:opacity-60 transition-opacity min-w-0 flex-shrink-0 bg-white/60 backdrop-blur-sm border border-[#FF6B00]/10 rounded-[12px] px-2.5 py-1.5 shadow-sm"
            onClick={onVehicleClick}
          >
            <div 
              ref={vehicleThumbRef}
              className="h-[34px] w-[34px] shrink-0 overflow-hidden rounded-[10px] bg-white border border-[#FF6B00]/5 flex items-center justify-center shadow-inner will-change-transform"
            >
              {vehicleImage ? (
                <img src={vehicleImage} alt={activeVehicle.make} className="h-full w-full object-cover" />
              ) : (
                <Car className="h-5 w-5 text-[#2D2D2D]/20" />
              )}
            </div>
            
            <div className="flex items-center gap-1 min-w-0">
              <span 
                ref={vehicleTextRef}
                className="text-[17px] font-[600] text-[#2D2D2D] whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]"
              >
                {activeVehicle.make}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-[#2D2D2D]/40 shrink-0 mt-0.5" />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
