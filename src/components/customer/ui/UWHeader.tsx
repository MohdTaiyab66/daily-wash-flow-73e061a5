import { MapPin, ChevronDown, Car } from "lucide-react";
import { ReactNode } from "react";
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
      "fixed top-0 left-0 right-0 z-[60] px-5 pt-[env(safe-area-inset-top,24px)] transition-all duration-300 ease-in-out",
      "bg-[#FFF9F3] border-b border-[#FF6B00]/10 shadow-[0_2px_12px_rgba(0,0,0,0.03)]",
      isCollapsed ? "h-[calc(56px+env(safe-area-inset-top,24px))]" : "h-[calc(82px+env(safe-area-inset-top,24px))]"
    )}>
      <div className="flex flex-col h-full justify-center">
        {/* Main Row: Location + Vehicle */}
        <div className="flex items-center justify-between w-full">
          {/* Left: Location */}
          <div 
            className={cn(
              "flex items-center gap-1.5 cursor-pointer active:opacity-70 transition-opacity duration-300",
              isCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
            )} 
            onClick={onAreaClick}
          >
            <MapPin className="h-4 w-4 text-[#FF6B00]" />
            <span className="text-[15px] font-[600] uppercase tracking-[0.2px] text-[#FF6B00] truncate max-w-[140px]">
              {area || "Set location"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-[#FF6B00]/40" />
          </div>

          {/* Right: Vehicle Selector (Compact) */}
          {activeVehicle && (
            <div 
              className={cn(
                "flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-white border border-[#FF6B00]/10 shadow-[0_2px_6px_rgba(255,107,0,0.05)] cursor-pointer active:scale-[0.97] transition-all duration-300",
                isCollapsed ? "absolute left-5 right-5 justify-start" : "max-w-[180px]"
              )}
              onClick={onVehicleClick}
            >
              <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-[#FF6B00]/5 flex items-center justify-center">
                {vehicleImage ? (
                  <img src={vehicleImage} alt={activeVehicle.make} className="h-full w-full object-contain p-0.5" />
                ) : (
                  <Car className="h-4 w-4 text-[#FF6B00]/40" />
                )}
              </div>
              
              <div className="min-w-0 flex-1 flex items-center gap-1">
                <span className={cn(
                  "truncate font-[600] text-[#2D2D2D] leading-tight",
                  isCollapsed ? "text-[15px]" : "text-[14px]"
                )}>
                  {activeVehicle.make} {activeVehicle.model}
                </span>
                
                {isCollapsed && (
                   <span className="truncate font-[500] text-[14px] text-[#7A7A7A] leading-tight shrink-0">
                    · {activeVehicle.registration_number}
                  </span>
                )}
                
                <ChevronDown className="text-[#7A7A7A]/40 shrink-0 h-3.5 w-3.5" />
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Subtle bottom accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#FF6B00]/10 to-transparent" />
    </header>
  );
}
