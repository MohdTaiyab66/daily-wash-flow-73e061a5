import { Bell, MapPin, ChevronDown } from "lucide-react";
import { Link } from "@tanstack/react-router";

interface UWHeaderProps {
  area: string;
  unread: number;
  onAreaClick: () => void;
}

export function UWHeader({ 
  area, 
  unread, 
  onAreaClick 
}: UWHeaderProps) {
  return (
    <div className="sticky top-0 z-20 bg-[#FFF9F3]/95 px-5 pt-3 pb-2 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div 
          className="flex items-center gap-2 cursor-pointer active:opacity-70 transition-opacity" 
          onClick={onAreaClick}
        >
          <MapPin className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-black uppercase tracking-widest text-primary truncate max-w-[200px]">
            {area || "Set location"}
          </span>
          <ChevronDown className="h-3 w-3 text-primary/40" />
        </div>
        
        <Link 
          to="/c/notifications" 
          className="relative grid h-12 w-12 shrink-0 place-items-center rounded-[18px] bg-white shadow-[0_4px_12px_-4px_rgba(0,0,0,0.08)] border border-black/5 transition-transform active:scale-90"
        >
          <Bell className="h-5 w-5 text-foreground" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-black text-white ring-2 ring-background">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>
      </div>
    </div>
  );
}
