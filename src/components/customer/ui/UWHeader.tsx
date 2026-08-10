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
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

const COLLAPSE_DISTANCE = 80;

export function UWHeader({ 
  area, 
  onAreaClick,
  activeVehicle,
  vehicleImage,
  onVehicleClick,
  scrollRef
}: UWHeaderProps) {
  const containerRef = useRef<HTMLElement>(null);
  const locationRef = useRef<HTMLDivElement>(null);
  const vehicleRef = useRef<HTMLDivElement>(null);
  const vehicleNameRef = useRef<HTMLSpanElement>(null);
  const vehicleMetaRef = useRef<HTMLSpanElement>(null);
  const vehicleThumbRef = useRef<HTMLDivElement>(null);
  
  useLayoutEffect(() => {
    const scrollEl = scrollRef?.current || window;
    const header = containerRef.current;
    const location = locationRef.current;
    const vehicle = vehicleRef.current;
    const vName = vehicleNameRef.current;
    const vMeta = vehicleMetaRef.current;
    const vThumb = vehicleThumbRef.current;
    
    if (!header) return;

    const handleScroll = () => {
      const scrollY = scrollEl instanceof Window ? scrollEl.scrollY : scrollEl.scrollTop;
      const progress = Math.min(Math.max(scrollY / COLLAPSE_DISTANCE, 0), 1);
      
      // 1. Header background & height
      // Expanded: 72px + safe-area, Collapsed: 58px + safe-area
      const expandedHeight = 72;
      const collapsedHeight = 58;
      const currentHeight = expandedHeight - (progress * (expandedHeight - collapsedHeight));
      header.style.height = `calc(${currentHeight}px + env(safe-area-inset-top, 24px))`;
      header.style.backgroundColor = progress > 0.1 ? `rgba(255, 249, 243, ${0.95 + progress * 0.05})` : '#FFF9F3';
      header.style.backdropFilter = progress > 0.1 ? 'blur(8px)' : 'none';
      header.style.boxShadow = `0 1px ${progress * 10}px rgba(0,0,0,${progress * 0.05})`;

      if (location) {
        // Location fades and slides left/up slightly
        location.style.opacity = `${1 - progress}`;
        location.style.transform = `translateX(${-progress * 10}px) scale(${1 - progress * 0.1})`;
        location.style.pointerEvents = progress > 0.8 ? 'none' : 'auto';
      }

      if (vehicle) {
        // Vehicle selector moves left to center/occupy more space
        // In expanded: right-aligned. In collapsed: takes over row.
        const xOffset = -progress * 20; // Move left slightly as location disappears
        vehicle.style.transform = `translateX(${xOffset}px)`;
        vehicle.style.backgroundColor = progress > 0.5 ? 'transparent' : 'white';
        vehicle.style.border = progress > 0.5 ? 'none' : '1px solid rgba(255, 107, 0, 0.1)';
        vehicle.style.boxShadow = progress > 0.5 ? 'none' : '0 1px 3px rgba(0,0,0,0.04)';
      }

      if (vThumb) {
        // Thumbnail gets slightly larger/smaller
        const scale = 1 + progress * 0.1;
        vThumb.style.transform = `scale(${scale})`;
      }

      if (vName) {
        vName.style.fontSize = `${15.5 + progress * 0.5}px`;
      }

      if (vMeta) {
        // Metadata fades IN when collapsed to show full identity
        vMeta.style.opacity = `${progress}`;
        vMeta.style.display = progress > 0.1 ? 'inline' : 'none';
        vMeta.style.transform = `translateX(${(1 - progress) * 10}px)`;
      }
    };

    const target = scrollEl instanceof Window ? window : scrollEl;
    target.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial state

    return () => target.removeEventListener('scroll', handleScroll);
  }, [scrollRef]);

  return (
    <header 
      ref={containerRef}
      className="fixed top-0 left-0 right-0 z-[60] px-4 pt-[env(safe-area-inset-top,24px)] will-change-[height,background-color]"
    >
      <div className="flex flex-col h-full justify-center">
        <div className="flex items-center justify-between gap-4 w-full relative">
          {/* Left: Location */}
          <div 
            ref={locationRef}
            className="flex items-center gap-1.5 cursor-pointer active:opacity-60 transition-opacity flex-[0.6] min-w-0 will-change-transform"
            onClick={onAreaClick}
          >
            <MapPin className="h-[18px] w-[18px] text-[#FF6B00] shrink-0" />
            <span className="text-[17px] font-[650] text-[#FF6B00] whitespace-nowrap overflow-hidden text-ellipsis">
              {area || "Set location"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-[#FF6B00]/30 shrink-0" />
          </div>

          {/* Right: Vehicle Selector */}
          {activeVehicle && (
            <div 
              ref={vehicleRef}
              className="flex items-center gap-2 px-2 py-1.5 rounded-[12px] cursor-pointer active:scale-[0.97] transition-all min-w-0 flex-[0.4] will-change-transform"
              onClick={onVehicleClick}
            >
              <div 
                ref={vehicleThumbRef}
                className="h-[32px] w-[32px] shrink-0 overflow-hidden rounded-full bg-white flex items-center justify-center will-change-transform"
              >
                {vehicleImage ? (
                  <img src={vehicleImage} alt={activeVehicle.make} className="h-full w-full object-contain p-0.5" />
                ) : (
                  <Car className="h-4 w-4 text-[#FF6B00]/40" />
                )}
              </div>
              
              <div className="min-w-0 flex-1 flex items-center gap-1">
                <span 
                  ref={vehicleNameRef}
                  className="font-[600] text-[#2D2D2D] tracking-tight whitespace-nowrap truncate"
                >
                  {activeVehicle.make} {activeVehicle.model}
                </span>
                
                <span 
                  ref={vehicleMetaRef}
                  className="truncate font-[500] text-[14px] text-[#7A7A7A] leading-tight shrink-0 hidden"
                >
                  · {activeVehicle.registration_number} · {activeVehicle.category.includes('suv') ? 'SUV' : 'Car'}
                </span>
                
                <ChevronDown className="text-[#7A7A7A]/30 shrink-0 h-3 w-3" />
              </div>
            </div>
          )}

        </div>
      </div>
    </header>
  );
}
