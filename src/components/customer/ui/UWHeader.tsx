import { MapPin, ChevronDown, Car } from "lucide-react";
import { cn } from "@/lib/utils";

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
  isCollapsed?: boolean;
}

export function UWHeader({ 
  area, 
  onAreaClick,
  activeVehicle,
  vehicleImage,
  onVehicleClick,
  isCollapsed = false
}: UWHeaderProps) {
  return (
    <header className={cn(
      "fixed top-0 left-0 right-0 z-[60] px-4 pt-[env(safe-area-inset-top,24px)] transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]",
      "bg-[#FFF9F3] border-b border-[#FF6B00]/5 shadow-[0_1px_4px_rgba(0,0,0,0.02)]",
      isCollapsed ? "h-[calc(56px+env(safe-area-inset-top,24px))]" : "h-[calc(72px+env(safe-area-inset-top,24px))]"
    )}>
      <div className="flex flex-col h-full justify-center">
        {/* Unified Toolbar Row */}
        <div className="flex items-center justify-between gap-4 w-full">
          {/* Left: Location - 60% approx */}
          <div 
            className={cn(
              "flex items-center gap-1.5 cursor-pointer active:opacity-60 transition-all duration-400 flex-[0.6] min-w-0",
              isCollapsed ? "opacity-0 pointer-events-none -translate-y-2" : "opacity-100 translate-y-0"
            )} 
            onClick={onAreaClick}
          >
            <MapPin className="h-[18px] w-[18px] text-[#FF6B00] shrink-0" />
            <span className="text-[17px] font-[650] text-[#FF6B00] whitespace-nowrap overflow-hidden text-ellipsis">
              {area || "Set location"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-[#FF6B00]/30 shrink-0" />
          </div>

          {/* Right: Vehicle Selector - Compact Control */}
          {activeVehicle && (
            <div 
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-[12px] bg-white border border-[#FF6B00]/10 shadow-[0_1px_3px_rgba(0,0,0,0.04)] cursor-pointer active:scale-[0.97] transition-all duration-400 min-w-0 flex-[0.4]",
                isCollapsed ? "absolute left-4 right-4 bg-white/95 backdrop-blur-sm border-none shadow-sm h-[42px] px-3 translate-y-0" : ""
              )}
              onClick={onVehicleClick}
            >
              <div className={cn(
                "shrink-0 overflow-hidden rounded-full bg-white flex items-center justify-center transition-all duration-400",
                isCollapsed ? "h-[34px] w-[34px]" : "h-[32px] w-[32px]"
              )}>
                {vehicleImage ? (
                  <img src={vehicleImage} alt={activeVehicle.make} className="h-full w-full object-contain p-0.5" />
                ) : (
                  <Car className="h-4 w-4 text-[#FF6B00]/40" />
                )}
              </div>
              
              <div className="min-w-0 flex-1 flex items-center gap-1">
                <span className={cn(
                  "font-[600] text-[#2D2D2D] tracking-tight whitespace-nowrap truncate",
                  isCollapsed ? "text-[16px]" : "text-[15.5px]"
                )}>
                  {activeVehicle.make} {activeVehicle.model}
                </span>
                
                {isCollapsed && (
                   <span className="truncate font-[500] text-[14px] text-[#7A7A7A] leading-tight shrink-0">
                    · {activeVehicle.registration_number} · {activeVehicle.category.includes('suv') ? 'SUV' : 'Car'}
                  </span>
                )}
                
                <ChevronDown className="text-[#7A7A7A]/30 shrink-0 h-3 w-3" />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}