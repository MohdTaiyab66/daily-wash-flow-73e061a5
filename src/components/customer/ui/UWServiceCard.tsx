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

  return (
    <Surface 
      className={cn("p-0 overflow-hidden flex flex-col h-[195px] bg-white border border-[#2D2D2D]/5 rounded-[14px] shadow-[0_2px_8px_-4px_rgba(0,0,0,0.02)] transition-transform active:scale-[0.98] duration-150", className)}

    >
      <div className="relative h-[108px] w-full bg-[#F8F9FB] overflow-hidden rounded-t-[14px]">
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
          <div className="h-full w-full flex flex-col items-center justify-center bg-[#F1F3F5] text-[#2D2D2D]/30 p-2">
            <Car className="h-6 w-6 mb-1 opacity-20" />
            <span className="text-[8px] font-[800] uppercase tracking-widest opacity-60 text-center">Coming soon</span>
          </div>
        )}
        
        {badge && (
          <div className="absolute top-1.5 left-1.5 rounded-full bg-[#FF6B00] px-1.5 py-0.5 backdrop-blur-sm z-[10]">
            <span className="text-[7px] font-black uppercase tracking-widest text-white">
              {badge}
            </span>
          </div>
        )}
      </div>
      
      <div className="flex flex-col flex-1 p-2 pt-1.5 pb-2">
        <div className="h-[60px] flex items-center justify-center overflow-hidden px-0.5">
          <h3 className="text-[13.5px] font-[600] leading-[1.25] text-[#2D2D2D] line-clamp-2 text-center overflow-hidden break-words">
            {name}
          </h3>
        </div>
        
        <div className="mt-auto flex items-center justify-between gap-1">
          <div className="flex items-baseline gap-1 overflow-hidden">
            <span className="text-[17px] font-[700] text-[#FF6B00] truncate">₹{price}</span>
            {oldPrice && (
              <span className="text-[9px] font-medium text-muted-foreground/40 line-through truncate">
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
              "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full transition-all active:scale-[0.85] bg-[#FFF2ED] text-[#FF6B00] shadow-[0_2px_4px_-1px_rgba(255,107,0,0.1)]",
              isAdded && "bg-[#FF6B00] text-white shadow-[#FF6B00]/20"
            )}
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isAdded ? (
              <Check className="h-3 w-3" strokeWidth={3} />
            ) : (
              <Plus className="h-3 w-3" strokeWidth={3} />
            )}
          </button>
        </div>
      </div>
    </Surface>
  );
}
