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
      className={cn("p-0 overflow-hidden flex flex-col h-full bg-white transition-opacity duration-200 border-none", className)}
      raised
    >
      <div className="relative aspect-[1.2/1] w-full bg-[#F8F9FB] overflow-hidden rounded-t-[18px]">
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
          <div className="h-full w-full flex flex-col items-center justify-center bg-muted/20 text-muted-foreground/30">
            <span className="text-[20px] mb-1">🚗</span>
            <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Coming soon</span>
          </div>
        )}
        
        {badge && (
          <div className="absolute top-2 left-2 rounded-full bg-[#FF6B00] px-2 py-0.5 backdrop-blur-sm z-[10]">
            <span className="text-[9px] font-black uppercase tracking-widest text-white">
              {badge}
            </span>
          </div>
        )}
      </div>
      
      <div className="flex flex-col flex-1 p-3">
        <h3 className="text-[15px] font-black leading-[1.2] text-[#1A1A1A] line-clamp-2 h-[2.4em]">
          {name}
        </h3>
        
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex flex-col">
            {oldPrice && (
              <span className="text-[11px] font-medium text-muted-foreground/60 line-through">
                ₹{oldPrice}
              </span>
            )}
            <span className="text-[16px] font-black text-[#1A1A1A]">₹{price}</span>
          </div>
          
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAdd?.();
            }}
            disabled={isLoading}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full transition-all active:scale-[0.85] bg-[#FFF2ED] text-[#FF6B00] hover:bg-[#FFE5D9]"
            )}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isAdded ? (
              <Check className="h-4 w-4" strokeWidth={3} />
            ) : (
              <Plus className="h-4 w-4" strokeWidth={3} />
            )}
          </button>
        </div>
      </div>
    </Surface>
  );
}
