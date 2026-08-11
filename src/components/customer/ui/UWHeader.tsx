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
      
      // 6. Header divider: subtle separation (rgba(0,0,0,0.04))
      header.style.borderBottom = `1px solid rgba(0, 0, 0, ${0.04 + progress * 0.02})`;
      
      // 7. Header shadow: extremely subtle
      header.style.boxShadow = progress > 0.5 ? `0 4px 16px rgba(0, 0, 0, ${progress * 0.02})` : 'none';

      // 5. Header height: transitions smoothly (Target 70-80px total height)
      if (wrapper) {
        const verticalPadding = 12 - (progress * 2);
        wrapper.style.paddingTop = `${verticalPadding}px`;
        wrapper.style.paddingBottom = `${verticalPadding}px`;
      }

      if (locText) {
        locText.style.fontSize = `${14 - progress * 0.5}px`;
      }

      if (vText) {
        vText.style.fontSize = `${14 - progress * 0.5}px`;
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
        className="px-4 py-3 flex items-center justify-between gap-3 w-full transition-[padding] box-border pt-[env(safe-area-inset-top)]"
      >
        {/* Left: Compact Location Selector */}
        <div 
          className="flex items-center gap-1.5 cursor-pointer active:opacity-60 transition-opacity min-w-0 flex-1 group"
          onClick={onAreaClick}
        >
          <MapPin className="h-4 w-4 text-[#FF6B00] shrink-0" />
          <div className="flex items-center gap-1 min-w-0">
            <span 
              ref={locationTextRef}
              className="text-[14px] font-semibold text-[#1A1A1A] whitespace-nowrap overflow-hidden text-ellipsis leading-tight"
            >
              {area || "Set location"}
            </span>
            <ChevronDown className="h-3 w-3 text-[#8A8A8A] shrink-0 transition-colors" />
          </div>
        </div>

        {/* Right: Compact Vehicle Selector */}
        {activeVehicle && (
          <div 
            ref={vehicleSelectorRef}
            className="flex items-center gap-2 cursor-pointer active:opacity-60 transition-opacity min-w-0 flex-shrink-0 bg-white border border-[rgba(0,0,0,0.06)] rounded-xl px-2 py-1 shadow-sm"
            onClick={onVehicleClick}
          >
            <div 
              ref={vehicleThumbRef}
              className="h-[28px] w-[28px] shrink-0 overflow-hidden rounded-lg bg-white border border-[rgba(0,0,0,0.04)] flex items-center justify-center shadow-inner will-change-transform"
            >
              {vehicleImage ? (
                <img src={vehicleImage} alt={activeVehicle.make} className="h-full w-full object-contain p-0.5" />
              ) : (
                <Car className="h-4 w-4 text-[#8A8A8A]" />
              )}
            </div>
            
            <div className="flex items-center gap-1 min-w-0">
              <span 
                ref={vehicleTextRef}
                className="text-[14px] font-semibold text-[#1A1A1A] whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px] leading-tight"
              >
                {activeVehicle.make} {activeVehicle.model}
              </span>
              <ChevronDown className="h-3 w-3 text-[#8A8A8A] shrink-0" />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
