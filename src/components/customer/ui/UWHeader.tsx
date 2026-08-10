import { Bell, MapPin, ChevronDown } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface UWHeaderProps {
  area: string;
  unread: number;
  onAreaClick: () => void;
  children?: ReactNode;
}

export function UWHeader({ 
  area, 
  unread, 
  onAreaClick,
  children
}: UWHeaderProps) {
  return (
    <div className="sticky top-0 z-30 bg-gradient-to-b from-[#FFF9F3] via-[#FFFDFB] to-[#FFFDFB] px-5 pt-[env(safe-area-inset-top,12px)] pb-2 backdrop-blur-xl">
      {/* Subtle brand glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_20%_20%,rgba(255,107,0,0.02)_0%,transparent_50%)] pointer-events-none" />
      
      <div className="relative flex flex-col gap-2">
        {/* Row 1: Location & Notifications */}
        <div className="flex items-center justify-between py-1">
          <div 
            className="flex items-center gap-1.5 cursor-pointer active:opacity-70 transition-opacity" 
            onClick={onAreaClick}
          >
            <MapPin className="h-4 w-4 text-[#FF6B00]" />
            <span className="text-[15px] font-semibold uppercase tracking-[0.5px] text-[#FF6B00] truncate max-w-[240px]">
              {area || "Set location"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-[#FF6B00]/40" />
          </div>
          
          <Link 
            to="/c/notifications" 
            className="relative grid h-[48px] w-[48px] shrink-0 place-items-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-black/5 transition-transform active:scale-90"
          >
            <Bell className={cn("h-5 w-5", unread > 0 ? "text-[#FF6B00]" : "text-muted-foreground")} />
            {unread > 0 && (
              <span className="absolute right-2.5 top-2.5 flex h-2 w-2 rounded-full bg-[#FF6B00] ring-2 ring-white" />
            )}
          </Link>
        </div>

        {/* Subtle orange/peach divider row */}
        <div className="h-[1px] w-full bg-[#FF6B00]/5 -mt-1 mb-1" />

        {/* Row 2: Vehicle Selector Content */}
        <div className="pb-1">
          {children}
        </div>
      </div>
    </div>
  );
}
