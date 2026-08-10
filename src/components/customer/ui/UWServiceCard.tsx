import { Plus, Check, Loader2, Car } from "lucide-react";
import { cn } from "@/lib/utils";
import { Surface } from "./kit";
import { useState } from "react";

interface UWServiceCardProps {
  name: string;
  price: number;
  oldPrice?: number;
  image?: string;
  badge?: string;
  onAdd?: () => void;
  isAdded?: boolean;
  isLoading?: boolean;
  slug?: string;
  className?: string;
}

export function UWServiceCard({
  name,
  price,
  oldPrice,
  image,
  badge,
  onAdd,
  isAdded,
  isLoading,
  slug,
  className,
}: UWServiceCardProps) {
  const [loadStatus, setLoadStatus] = useState<'loading' | 'success' | 'error'>(image ? 'loading' : 'error');

  const isComingSoon = !image || loadStatus === 'error';

  return (
    <Surface 
      className={cn(
        "p-0 overflow-hidden flex flex-col h-[198px] bg-white border border-[#2D2D2D]/5 rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-all active:scale-[0.96] duration-150", 
        className
      )}
    >
      <div className="relative h-[108px] w-full bg-[#F8F9FB] overflow-hidden rounded-t-[12px] shrink-0">
        {image ? (
          <img 
            src={image} 
            alt={name} 
            data-slug={slug}
            className={cn(
              "h-full w-full object-cover transition-opacity duration-500",
              loadStatus === 'success' ? "opacity-100" : "opacity-0"
            )} 
            onLoad={() => setLoadStatus('success')}
            onError={() => setLoadStatus('error')}
          />
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center bg-[#F8F9FA] text-[#7A7A7A]/30 p-2">
            <Car className="h-7 w-7 mb-1.5 opacity-20" />
            <span className="text-[8px] font-[800] uppercase tracking-[0.12em] opacity-60 text-center text-[#7A7A7A]">Coming soon</span>
          </div>
        )}
        
        {badge && (
          <div className="absolute top-2 left-2 rounded-full bg-[#FF6B00] px-2 py-0.5 shadow-sm z-[10]">
            <span className="text-[8px] font-black uppercase tracking-widest text-white">
              {badge}
            </span>
          </div>
        )}
      </div>
      
      <div className="flex flex-col flex-1 p-2 pt-1.5 pb-2 min-w-0">
        <div className="h-[58px] flex items-center justify-center overflow-hidden px-1">
          <h3 className={cn(
            "text-[13px] font-[550] leading-[1.3] text-[#2D2D2D] text-center overflow-hidden break-words line-clamp-3",
            isComingSoon && "text-[#7A7A7A]"
          )}>
            {name}
          </h3>
        </div>
        
        <div className="mt-auto flex items-center justify-between gap-1 h-[36px]">
          <div className="flex items-baseline gap-0.5 overflow-hidden">
            <span className={cn(
              "text-[16px] font-[750] text-[#FF6B00] truncate",
              isComingSoon && "text-[#FF6B00]/60"
            )}>₹{price}</span>
            {oldPrice && (
              <span className="text-[10px] font-medium text-[#7A7A7A]/30 line-through truncate ml-0.5">
                ₹{oldPrice}
              </span>
            )}
          </div>
          
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAdd?.();
            }}
            disabled={isLoading}
            className={cn(
              "flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full transition-all active:scale-[0.85] bg-[#FFF2ED] text-[#FF6B00] border border-[#FF6B00]/5",
              isAdded && "bg-[#FF6B00] text-white",
              isComingSoon && "bg-[#FFF2ED]/50 text-[#FF6B00]/50"
            )}
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isAdded ? (
              <Check className="h-3 w-3" strokeWidth={3} />
            ) : (
              <Plus className="h-3.5 w-3.5" strokeWidth={3} />
            )}
          </button>
        </div>
      </div>
    </Surface>
  );
}
