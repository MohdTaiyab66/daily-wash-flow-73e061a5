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
        "p-0 overflow-hidden flex flex-col h-[202px] bg-white border border-[#2D2D2D]/8 rounded-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-all active:scale-[0.96] duration-150", 
        className
      )}
    >
      <div className="relative h-[98px] w-full bg-[#F1F2F3] overflow-hidden shrink-0">
        {image && loadStatus !== 'error' ? (
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
          <div className="h-full w-full flex flex-col items-center justify-center bg-[#F1F2F3] text-[#7A7A7A] p-2">
            <Car className="h-8 w-8 mb-1.5 opacity-20" />
            <span className="text-[9px] font-[800] uppercase tracking-[0.14em] text-[#7A7A7A] text-center">Coming soon</span>
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
      
      <div className="flex flex-col flex-1 px-2.5 pt-2 pb-2.5 min-w-0">
        <div className="h-[48px] flex items-start justify-center overflow-hidden">
          <h3 className={cn(
            "text-[13.5px] font-[600] leading-[1.25] text-[#2D2D2D] text-center break-words line-clamp-3",
            isComingSoon && "text-[#7A7A7A]"
          )}>
            {name}
          </h3>
        </div>
        
        <div className="mt-auto flex items-center justify-between gap-1 h-[32px]">
          <div className="flex items-baseline gap-0.5 overflow-hidden">
            <span className="text-[15.5px] font-[750] text-[#FF6B00] truncate">₹{price}</span>
            {oldPrice && (
              <span className="text-[11px] font-medium text-[#7A7A7A]/30 line-through truncate ml-0.5">
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
              "flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full transition-all active:scale-[0.85] bg-[#FFF2ED] text-[#FF6B00] border border-[#FF6B00]/5",
              isAdded && "bg-[#FF6B00] text-white"
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
