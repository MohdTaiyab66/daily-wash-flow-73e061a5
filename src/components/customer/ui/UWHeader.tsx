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
  hideLocationIcon?: boolean;
}


const COLLAPSE_DISTANCE = 30; 
const HEADER_HEIGHT_NORMAL = 78;
const HEADER_HEIGHT_COLLAPSED = 72;

export function UWHeader({ 
  area, 
  onAreaClick,
  activeVehicle,
  vehicleImage,
  onVehicleClick,
  hideLocationIcon = false,
}: UWHeaderProps) {

  const containerRef = useRef<HTMLElement>(null);
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const locationTextRef = useRef<HTMLSpanElement>(null);
  const vehicleTextRef = useRef<HTMLSpanElement>(null);
  const vehicleThumbRef = useRef<HTMLDivElement>(null);
  const vehicleSelectorRef = useRef<HTMLDivElement>(null);
  
  useLayoutEffect(() => {
    const wrapper = contentWrapperRef.current;
    if (wrapper) {
      wrapper.style.paddingTop = `env(safe-area-inset-top)`;
    }
  }, []);

  return (
    <header 
      ref={containerRef}
      className="bg-white border-b border-[rgba(0,0,0,0.04)]"
    >
      <div 
        ref={contentWrapperRef}
        className="px-4 flex items-center justify-between gap-3 w-full transition-[height] box-border h-[78px]"
      >
        {/* Left: Compact Location Selector */}
        <div 
          className={cn(
            "flex items-center gap-1.5 transition-opacity min-w-0 flex-1 group",
            !hideLocationIcon && "cursor-pointer active:opacity-60"
          )}
          onClick={hideLocationIcon ? undefined : onAreaClick}
        >
          {!hideLocationIcon && <MapPin className="h-[18px] w-[18px] text-[#FF6B00] shrink-0" />}

          <div className="flex items-center gap-1 min-w-0">
            <span 
              ref={locationTextRef}
              className="text-[15px] font-medium text-[#1A1A1A] whitespace-nowrap overflow-hidden text-ellipsis leading-tight tracking-tight max-w-[130px]"
            >
              {area || "Set location"}
            </span>
            {!hideLocationIcon && <ChevronDown className="h-3.5 w-3.5 text-[#8A8A8A] shrink-0 transition-colors" />}
          </div>
        </div>

        {/* Right: Compact Vehicle Selector */}
        {activeVehicle && (
          <div 
            ref={vehicleSelectorRef}
            className="flex items-center gap-2 cursor-pointer active:opacity-60 transition-opacity min-w-0 flex-shrink-0 bg-[#F9F9F9] border border-[rgba(0,0,0,0.06)] rounded-[10px] h-[32px] pl-1 pr-2.5 shadow-sm"
            onClick={onVehicleClick}
          >
            <div 
              ref={vehicleThumbRef}
              className="h-[28px] w-[28px] shrink-0 overflow-hidden rounded-[6px] bg-[#F9F9F9] border border-[rgba(0,0,0,0.04)] flex items-center justify-center shadow-inner will-change-transform"
            >
              {vehicleImage ? (
                <img src={vehicleImage} alt={activeVehicle.make} className="h-full w-full object-contain p-0.5" />
              ) : (
                <Car className="h-[21px] w-[21px] text-[#8A8A8A]" />
              )}
            </div>
            
            <div className="flex items-center gap-1 min-w-0">
              <span 
                ref={vehicleTextRef}
                className="text-[15px] font-medium text-[#1A1A1A] whitespace-nowrap overflow-hidden text-ellipsis max-w-[100px] leading-tight tracking-tight"
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
