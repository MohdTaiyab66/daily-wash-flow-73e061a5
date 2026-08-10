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

const COLLAPSE_DISTANCE = 60; 

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
  const vehicleSelectorRef = useRef<HTMLDivElement>(null);
  
  useLayoutEffect(() => {
    const header = containerRef.current;
    const wrapper = contentWrapperRef.current;
    const locText = locationTextRef.current;
    const vText = vehicleTextRef.current;
    const vThumb = vehicleThumbRef.current;
    const vSelector = vehicleSelectorRef.current;
    
    if (!header) return;

    const handleScroll = () => {
      const scrollY = window.scrollY;
      const progress = Math.min(Math.max(scrollY / COLLAPSE_DISTANCE, 0), 1);
      
      // 1. Header background: Deeper warm ivory / muted peach (#F4E1D1 range)
      header.style.backgroundColor = `rgba(244, 225, 209, ${0.98 + progress * 0.02})`;
      header.style.backdropFilter = progress > 0.1 ? 'blur(16px)' : 'none';
      
      // 6. Header divider: subtle separation
      header.style.borderBottom = `1px solid rgba(120, 70, 40, ${0.08 + progress * 0.04})`;
      
      // 7. Header shadow: extremely subtle
      header.style.boxShadow = progress > 0.5 ? `0 4px 16px rgba(120, 70, 40, ${progress * 0.04})` : 'none';

      // 5. Header height: transitions smoothly
      if (wrapper) {
        const verticalPadding = 14 - (progress * 4);
        wrapper.style.paddingTop = `${verticalPadding}px`;
        wrapper.style.paddingBottom = `${verticalPadding}px`;
      }

      if (locText) {
        locText.style.fontSize = `${16 - progress * 1}px`;
      }

      if (vText) {
        vText.style.fontSize = `${16 - progress * 1}px`;
      }

      if (vThumb) {
        const scale = 1 - progress * 0.05;
        vThumb.style.transform = `scale(${scale})`;
      }
      
      if (vSelector) {
        vSelector.style.backgroundColor = `rgba(255, 255, 255, ${0.7 - progress * 0.1})`;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); 

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header 
      ref={containerRef}
      className="fixed top-0 left-0 right-0 z-[60] bg-[#F4E1D1] will-change-[background-color,border-bottom,box-shadow]"
    >
      <div 
        ref={contentWrapperRef}
        className="px-6 py-3.5 flex items-center justify-between gap-4 w-full transition-[padding]"
      >
        {/* 3. Left: Polished Location Control */}
        <div 
          className="flex items-center gap-1.5 cursor-pointer active:opacity-60 transition-opacity min-w-0 flex-1 group"
          onClick={onAreaClick}
        >
          <MapPin className="h-4.5 w-4.5 text-[#FF6B00] shrink-0" />
          <div className="flex items-center gap-1 min-w-0">
            <span 
              ref={locationTextRef}
              className="text-[16px] font-[650] text-[#2D2D2D] whitespace-nowrap overflow-hidden text-ellipsis leading-none"
            >
              {area || "Set location"}
            </span>
            <ChevronDown className="h-3 w-3 text-[#2D2D2D]/30 shrink-0 mt-0.5 group-hover:text-[#FF6B00] transition-colors" />
          </div>
        </div>

        {/* 4. Right: Premium Vehicle Selector */}
        {activeVehicle && (
          <div 
            ref={vehicleSelectorRef}
            className="flex items-center gap-2 cursor-pointer active:opacity-60 transition-opacity min-w-0 flex-shrink-0 bg-white/70 backdrop-blur-sm border border-[rgba(120,70,40,0.1)] rounded-[14px] px-2.5 py-1.5 shadow-[0_2px_8px_rgba(120,70,40,0.04)]"
            onClick={onVehicleClick}
          >
            <div 
              ref={vehicleThumbRef}
              className="h-[32px] w-[32px] shrink-0 overflow-hidden rounded-[10px] bg-white border border-[rgba(120,70,40,0.05)] flex items-center justify-center shadow-inner will-change-transform"
            >
              {vehicleImage ? (
                <img src={vehicleImage} alt={activeVehicle.make} className="h-full w-full object-contain p-0.5" />
              ) : (
                <Car className="h-4.5 w-4.5 text-[#2D2D2D]/20" />
              )}
            </div>
            
            <div className="flex items-center gap-1 min-w-0">
              <span 
                ref={vehicleTextRef}
                className="text-[15px] font-[650] text-[#2D2D2D] whitespace-nowrap overflow-hidden text-ellipsis max-w-[100px] leading-none"
              >
                {activeVehicle.make} {activeVehicle.model}
              </span>
              <ChevronDown className="h-3 w-3 text-[#2D2D2D]/30 shrink-0 mt-0.5" />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
