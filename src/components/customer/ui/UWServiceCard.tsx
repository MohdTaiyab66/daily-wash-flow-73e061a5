import { Plus, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Surface } from "./kit";

interface UWServiceCardProps {
  name: string;
  price: number;
  oldPrice?: number;
  image?: string;
  badge?: string;
  onAdd?: () => void;
  isAdded?: boolean;
  isLoading?: boolean;
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
  className
}: UWServiceCardProps) {
  return (
    <Surface 
      className={cn("p-0 overflow-hidden flex flex-col h-full bg-white", className)}
      raised
    >
      <div className="relative aspect-[4/3] w-full bg-muted overflow-hidden">
        {image ? (
          <img 
            src={image} 
            alt={name} 
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" 
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground/20">
            <span className="text-[10px] font-black uppercase tracking-widest">Urban Wash</span>
          </div>
        )}
        
        {badge && (
          <div className="absolute top-2 left-2 rounded-full bg-primary/90 px-2 py-0.5 backdrop-blur-sm">
            <span className="text-[9px] font-black uppercase tracking-widest text-white">
              {badge}
            </span>
          </div>
        )}
      </div>
      
      <div className="flex flex-col flex-1 p-3">
        <h3 className="text-[14px] font-black leading-tight text-foreground line-clamp-2 min-h-[2.5em]">
          {name}
        </h3>
        
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex flex-col">
            {oldPrice && (
              <span className="text-[11px] font-medium text-muted-foreground/60 line-through">
                ₹{oldPrice}
              </span>
            )}
            <span className="text-[15px] font-black text-foreground">₹{price}</span>
          </div>
          
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAdd?.();
            }}
            disabled={isLoading}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-xl transition-all active:scale-75",
              isAdded 
                ? "bg-success text-white" 
                : "bg-primary/10 text-primary hover:bg-primary/20"
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
