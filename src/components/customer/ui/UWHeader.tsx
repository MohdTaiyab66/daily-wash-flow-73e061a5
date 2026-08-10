import { MapPin, ChevronDown } from "lucide-react";
import { ReactNode } from "react";
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
  return (
    <header className="relative z-20 px-5 pt-[env(safe-area-inset-top,24px)] bg-[#FFF9F3] border-b border-[#FF6B00]/5 shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
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

        {/* Row 2: Content (Vehicle Selector) */}
        <div className="pb-3">
          {children}
        </div>
      </div>
    </header>
  );
}
