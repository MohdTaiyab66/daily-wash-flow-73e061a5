import { MapPin, ChevronDown } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface UWHeaderProps {
  area: string;
  onAreaClick: () => void;
  children?: ReactNode;
  scrollY?: number;
}

export function UWHeader({ 
  area, 
  onAreaClick,
  children,
  scrollY = 0
}: UWHeaderProps) {
  // Collapse starts at 20px, finishes at 80px
  const collapseStart = 20;
  const collapseEnd = 80;
  
  // Progress from 0 (expanded) to 1 (collapsed)
  const progress = Math.min(1, Math.max(0, (scrollY - collapseStart) / (collapseEnd - collapseStart)));
  
  return (
    <div 
      className={cn(
        "sticky top-0 z-30 px-5 pt-[env(safe-area-inset-top,12px)] transition-colors duration-200",
        progress > 0.8 ? "bg-white shadow-[0_2px_10px_rgba(0,0,0,0.03)]" : "bg-[#FFF9F3]"
      )}
    >
      {/* Subtle orange accent line */}
      <div 
        className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#FF6B00]/20 to-transparent pointer-events-none transition-opacity duration-200" 
        style={{ opacity: progress > 0.8 ? 1 : 0.4 }}
      />
      
      <div className="relative flex flex-col">
        {/* Row 1: Location - Fades out and slides up */}
        <div 
          className="flex items-center py-0 transition-all duration-300 ease-out overflow-hidden"
          style={{ 
            height: `${Math.max(0, (1 - progress) * 24)}px`,
            opacity: 1 - progress,
            marginBottom: `${Math.max(0, (1 - progress) * 8)}px`,
            transform: `translateY(${-progress * 20}px)`
          }}
        >
          <div 
            className="flex items-center gap-1.5 cursor-pointer active:opacity-70 transition-opacity" 
            onClick={onAreaClick}
          >
            <MapPin className="h-4 w-4 text-[#FF6B00]" />
            <span className="text-[16px] font-[600] uppercase tracking-[0.2px] text-[#FF6B00] truncate max-w-[280px]">
              {area || "Set location"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-[#FF6B00]/40" />
          </div>
        </div>

        {/* Subtle orange/peach divider row - Fades out */}
        <div 
          className="h-[1px] w-full bg-[#FF6B00]/5 transition-all duration-300 ease-out" 
          style={{ 
            opacity: Math.max(0, 1 - progress * 1.5),
            transform: `scaleX(${1 - progress * 0.2})`,
            marginBottom: progress > 0.5 ? 0 : 8
          }}
        />

        {/* Row 2: Vehicle Selector Content - Shrinks and animates */}
        <div 
          className="pb-2 transition-all duration-200"
          style={{
            paddingBottom: progress > 0.8 ? '8px' : '4px'
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
