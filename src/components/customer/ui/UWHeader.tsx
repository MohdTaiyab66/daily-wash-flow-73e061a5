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
      
      // 1. Header background: White for premium feel
      header.style.backgroundColor = `rgba(255, 255, 255, ${0.98 + progress * 0.02})`;
      header.style.backdropFilter = progress > 0.1 ? 'blur(16px)' : 'none';
      
      header.style.borderBottom = `1px solid rgba(0, 0, 0, ${0.04 + progress * 0.02})`;
      header.style.boxShadow = progress > 0.5 ? `0 4px 16px rgba(0, 0, 0, ${progress * 0.02})` : 'none';

      if (wrapper) {
        const verticalPadding = 8 - (progress * 2);
        wrapper.style.paddingTop = `calc(${verticalPadding}px + env(safe-area-inset-top))`;
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
        vSelector.style.backgroundColor = `rgba(255, 255, 255, 1)`;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); 

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header 
      ref={containerRef}
      className="fixed top-0 left-0 right-0 z-[60] bg-white will-change-[background-color,border-bottom,box-shadow]"
    >
      <div 
        ref={contentWrapperRef}
        className="px-4 flex items-center justify-between gap-3 w-full transition-[padding] box-border"
      >
        {/* Left: Compact Location Selector */}
        <div 
          className="flex items-center gap-1.5 cursor-pointer active:opacity-60 transition-opacity min-w-0 flex-1 group"
          onClick={onAreaClick}
        >
          <MapPin className="h-[18px] w-[18px] text-[#FF6B00] shrink-0" />
          <div className="flex items-center gap-1 min-w-0">
            <span 
              ref={locationTextRef}
              className="text-[16px] font-semibold text-[#1A1A1A] whitespace-nowrap overflow-hidden text-ellipsis leading-tight tracking-tight"
            >
              {area || "Set location"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-[#8A8A8A] shrink-0 transition-colors" />
          </div>
        </div>

        {/* Right: Compact Vehicle Selector */}
        {activeVehicle && (
          <div 
            ref={vehicleSelectorRef}
            className="flex items-center gap-2 cursor-pointer active:opacity-60 transition-opacity min-w-0 flex-shrink-0 bg-white border border-[rgba(0,0,0,0.06)] rounded-[12px] h-[44px] pl-1.5 pr-2.5 shadow-sm"
            onClick={onVehicleClick}
          >
            <div 
              ref={vehicleThumbRef}
              className="h-[32px] w-[32px] shrink-0 overflow-hidden rounded-[8px] bg-[#F9F9F9] border border-[rgba(0,0,0,0.04)] flex items-center justify-center shadow-inner will-change-transform"
            >
              {vehicleImage ? (
                <img src={vehicleImage} alt={activeVehicle.make} className="h-full w-full object-contain p-0.5" />
              ) : (
                <Car className="h-5 w-5 text-[#8A8A8A]" />
              )}
            </div>
            
            <div className="flex items-center gap-1 min-w-0">
              <span 
                ref={vehicleTextRef}
                className="text-[16px] font-semibold text-[#1A1A1A] whitespace-nowrap overflow-hidden text-ellipsis max-w-[110px] leading-tight tracking-tight"
              >
                {activeVehicle.make} {activeVehicle.model}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-[#8A8A8A] shrink-0" />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
