import { Plus, Check, Loader2 } from "lucide-react";
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
      className={cn("p-0 overflow-hidden flex flex-col h-[184px] bg-white transition-opacity duration-200 border-none rounded-[12px]", className)}
      raised
    >
      <div className="relative aspect-[1/0.8] w-full bg-[#F8F9FB] overflow-hidden rounded-t-[12px]">
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
          <div className="h-full w-full flex flex-col items-center justify-center bg-[#F1F3F5] text-muted-foreground/30">
            <Car className="h-6 w-6 mb-1 opacity-20" />
            <span className="text-[8px] font-black uppercase tracking-wider opacity-40">Coming soon</span>
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
        <div className="h-[46px] flex items-center overflow-hidden">
          <h3 className="text-[12px] font-bold leading-[1.2] text-[#1A1A1A] line-clamp-3 w-full text-center">
            {name}
          </h3>
        </div>
        
        <div className="mt-auto flex items-center justify-between gap-1">
          <div className="flex items-baseline gap-1 overflow-hidden">
            <span className="text-[13px] font-black text-[#1A1A1A] truncate">₹{price}</span>
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
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all active:scale-[0.85] bg-[#FFF2ED] text-[#FF6B00] hover:bg-[#FFE5D9]"
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
