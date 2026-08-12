import { Plus, Check, Loader2, Car } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface UWServiceCardProps {
  name: string;
  price: number;
  oldPrice?: number;
  image?: string;
  badge?: string;
  onAdd?: () => void;
  onOpen?: () => void;
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
  onOpen,
  isAdded,
  isLoading,
  slug,
  className,
}: UWServiceCardProps) {
  const [loadStatus, setLoadStatus] = useState<'loading' | 'success' | 'error'>(image ? 'loading' : 'error');

  const isComingSoon = !image || loadStatus === 'error';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${name}`}
      onClick={() => onOpen?.()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.();
        }
      }}
      className={cn(
        "cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]/40",
        "p-0 overflow-hidden flex flex-col h-[210px] bg-white border border-[#F0F0F0] rounded-[18px] shadow-sm transition-all active:scale-[0.96] duration-150", 
        className
      )}
    >
      <div className="relative h-[115px] w-full bg-[#F5F6F7] overflow-hidden shrink-0">
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
          <div className="h-full w-full flex flex-col items-center justify-center bg-[#F5F6F7] text-[#7A7A7A] p-2">
            <Car className="h-7 w-7 mb-1.5 opacity-20" />
            <span className="text-[8px] font-bold uppercase tracking-wider text-[#7A7A7A] text-center">Coming soon</span>
          </div>
        )}
        
        {badge && (
          <div className="absolute top-2 left-2 rounded-full bg-[#FF6B00] px-2 py-0.5 shadow-sm z-[10]">
            <span className="text-[8px] font-bold uppercase tracking-widest text-white">
              {badge}
            </span>
          </div>
        )}
      </div>
      
      <div className="flex flex-col flex-1 px-3 pt-2.5 pb-3 min-w-0">
        <div className="h-[44px] flex items-start overflow-hidden w-full">
          <h3 className={cn(
            "text-[14px] font-semibold leading-[1.3] text-[#1A1A1A] break-words line-clamp-2 w-full",
            isComingSoon && "text-[#7A7A7A]"
          )}>
            {name}
          </h3>
        </div>
        
        <div className="mt-auto flex items-end justify-between gap-1">
          <div className="flex items-baseline gap-0.5 overflow-hidden">
            <span className="text-[18px] font-bold text-[#FF6B00] truncate tracking-tight">₹{price}</span>
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
              "flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full transition-all active:scale-[0.9] bg-[#FFF8F4] text-[#FF6B00] border border-[#FF6B00]/10 z-10",
              isAdded && "bg-[#FF6B00] text-white"
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
    </div>
  );
}
