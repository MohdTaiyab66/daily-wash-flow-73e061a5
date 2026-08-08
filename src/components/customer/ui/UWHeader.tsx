import { Bell, MapPin, ChevronDown } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Shimmer } from "./Skeletons";

interface UWHeaderProps {
  greeting: string;
  firstName: string;
  area: string;
  unread: number;
  isLoading?: boolean;
  onAreaClick: () => void;
}

export function UWHeader({ 
  greeting, 
  firstName, 
  area, 
  unread, 
  isLoading,
  onAreaClick 
}: UWHeaderProps) {
  return (
    <div className="sticky top-0 z-20 bg-background/95 px-5 pt-6 pb-4 backdrop-blur-xl">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2" onClick={onAreaClick}>
            <MapPin className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-black uppercase tracking-widest text-primary truncate max-w-[120px]">
              {area || "Set location"}
            </span>
            <ChevronDown className="h-3 w-3 text-primary/40" />
          </div>
          
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-[20px] font-medium text-foreground/40">{greeting},</p>
            {isLoading ? (
              <Shimmer className="h-7 w-32 rounded-lg" />
            ) : (
              <h1 className="truncate text-[22px] font-black tracking-tight text-foreground">
                {firstName}
              </h1>
            )}
          </div>
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
