import { Bell, MapPin, ChevronDown } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ReactNode } from "react";

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
    <div className="sticky top-0 z-30 bg-[#FFF9F3]/95 px-5 pt-[env(safe-area-inset-top,12px)] pb-3 backdrop-blur-xl border-b border-black/[0.02]">
      <div className="flex flex-col gap-3">
        {/* Row 1: Location & Notifications */}
        <div className="flex items-center justify-between">
          <div 
            className="flex items-center gap-1.5 cursor-pointer active:opacity-70 transition-opacity" 
            onClick={onAreaClick}
          >
            <MapPin className="h-4 w-4 text-primary fill-primary/10" />
            <span className="text-[16px] font-black uppercase tracking-tight text-primary truncate max-w-[240px]">
              {area || "Set location"}
            </span>
            <ChevronDown className="h-4 w-4 text-primary/40" />
          </div>
          
          <Link 
            to="/c/notifications" 
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white shadow-sm border border-black/5 transition-transform active:scale-90"
          >
            <Bell className="h-5 w-5 text-[#1A1A1A]" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black text-white ring-2 ring-[#FFF9F3]">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        </div>

        {/* Row 2: Vehicle Selector Content */}
        {children}
      </div>
    </div>
  );
}
