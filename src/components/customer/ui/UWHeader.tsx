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
  const locationRef = useRef<HTMLDivElement>(null);
  const vehicleRef = useRef<HTMLDivElement>(null);
  const vehicleNameRef = useRef<HTMLSpanElement>(null);
  const vehicleThumbRef = useRef<HTMLDivElement>(null);
  
  useLayoutEffect(() => {
    const header = containerRef.current;
    const location = locationRef.current;
    const vehicle = vehicleRef.current;
    const vName = vehicleNameRef.current;
    const vThumb = vehicleThumbRef.current;
    
    if (!header) return;

    const handleScroll = () => {
      // Use window.scrollY for synchronization
      const scrollY = window.scrollY;
      const progress = Math.min(Math.max(scrollY / COLLAPSE_DISTANCE, 0), 1);
      
      // Header background & elevation transition
      // We keep a constant height but animate content inside for smooth collapse
      header.style.backgroundColor = `rgba(255, 249, 243, ${0.95 + progress * 0.05})`;
      header.style.backdropFilter = progress > 0.1 ? 'blur(10px)' : 'none';
      header.style.boxShadow = `0 1px ${progress * 8}px rgba(0,0,0,${progress * 0.04})`;
      header.style.borderBottom = `1px solid rgba(255, 107, 0, ${progress * 0.05})`;

      if (location) {
        // Progressive fade and shift for location
        location.style.opacity = `${1 - progress}`;
        location.style.transform = `translateX(${-progress * 15}px)`;
        location.style.pointerEvents = progress > 0.8 ? 'none' : 'auto';
        // Adjust width to allow vehicle to take space
        location.style.flex = `${0.6 * (1 - progress)}`;
      }

      if (vehicle) {
        // Vehicle selector moves left and background fades
        const xOffset = -progress * (location?.offsetWidth || 0) * 0.1; 
        vehicle.style.transform = `translateX(${xOffset}px)`;
        vehicle.style.backgroundColor = progress > 0.5 ? 'transparent' : 'white';
        vehicle.style.border = progress > 0.5 ? 'none' : '1px solid rgba(255, 107, 0, 0.08)';
        vehicle.style.boxShadow = progress > 0.5 ? 'none' : '0 1px 2px rgba(0,0,0,0.03)';
        vehicle.style.flex = `${0.4 + progress * 0.6}`;
      }

      if (vThumb) {
        // Subtly adjust thumb size
        const scale = 1 - progress * 0.05;
        vThumb.style.transform = `scale(${scale})`;
      }

      if (vName) {
        // Refine name weight or size slightly if needed, but keeping it stable is better for performance
        vName.style.fontSize = `${16 - progress * 0.5}px`;
      }
    };

    // Use passive: true for scroll performance
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); 

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header 
      ref={containerRef}
      className="fixed top-0 left-0 right-0 z-[60] px-4 pt-[env(safe-area-inset-top,24px)] pb-3 h-[calc(56px+env(safe-area-inset-top,24px))] will-change-[background-color,box-shadow]"
    >
      <div className="flex items-center justify-between gap-3 h-full w-full relative">
        {/* Left: Location */}
        <div 
          ref={locationRef}
          className="flex items-center gap-1.5 cursor-pointer active:opacity-60 transition-opacity flex-[0.6] min-w-0 will-change-[opacity,transform,flex]"
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
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-[12px] bg-white border border-[#FF6B00]/8 shadow-[0_1px_2px_rgba(0,0,0,0.03)] cursor-pointer active:scale-[0.97] transition-all min-w-0 flex-[0.4] will-change-[transform,flex,background-color,border,box-shadow]"
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
                className="font-[600] text-[#2D2D2D] tracking-tight whitespace-nowrap truncate text-[16px]"
              >
                {activeVehicle.make} {activeVehicle.model}
              </span>
              <ChevronDown className="text-[#7A7A7A]/30 shrink-0 h-3 w-3" />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
