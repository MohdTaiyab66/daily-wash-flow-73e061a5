import { Surface, Muted } from "@/components/customer/ui/kit";
import { CheckCircle2, Car, Sparkles, MapPin, ChevronRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export function PremiumHero({ 
  service, 
  vehicleSubActive, 
  onBookIncluded, 
  previewPayable, 
  purchaseMode,
  vehicle,
  address,
  onVehicleClick,
  onAddressClick
}: any) {
  const isIncluded = purchaseMode === 'included_wash';

  return (
    <Surface className="relative overflow-hidden border-primary/10 bg-gradient-to-br from-white to-[#FFF5ED] p-0">
      {/* Top Layer: Service Category & Price */}
      <div className="px-5 pt-5 pb-4 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-[11px] font-black text-primary uppercase tracking-wider">
            {isIncluded ? 'Included with Daily Shine' : 'Premium Service'}
          </span>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <div className="text-[24px] font-black text-primary leading-none">₹{previewPayable}</div>
          <div className="text-[10px] font-bold text-muted-foreground/40 mt-1 uppercase tracking-widest">
            {isIncluded ? 'Included' : 'One-time'}
          </div>
        </div>
      </div>

      {/* Middle Layer: Service Info */}
      <div className="px-5 pb-5">
        <h2 className="text-[20px] font-black text-foreground leading-tight">{service.name}</h2>
        <p className="mt-2 text-[13px] font-medium text-muted-foreground/70 leading-relaxed">
          {service.description || "Pressure wash, body polish, tyre polish, vacuum, dashboard polish and fragrance."}
        </p>
        
        <div className="mt-4 flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-primary/60" />
            <span>~60-90 min</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 text-primary/60" />
            <span>Doorstep</span>
          </div>
          {vehicleSubActive && (
            <div className="flex items-center gap-1.5 text-[11px] font-black text-success uppercase tracking-wider">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Daily Shine active</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Layer: Context Selector (Vehicle & Address) */}
      <button 
        onClick={onVehicleClick} // Both trigger the same consolidated context feeling, but we'll prioritize vehicle drawer
        className="w-full text-left px-5 py-4 bg-black/[0.02] border-t border-black/[0.04] flex items-center justify-between active:bg-black/[0.05] transition-colors"
      >
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[13px] font-bold text-foreground/80 truncate">
            <Car className="h-3.5 w-3.5 text-muted-foreground/40" />
            <span className="truncate">{vehicle?.make} {vehicle?.model} · {vehicle?.registration_number}</span>
          </div>
          <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground/60 truncate">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground/40" />
            <span className="truncate">{address?.label} · {address?.area}</span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/30 ml-2 shrink-0" />
      </button>

      <div className="absolute right-0 top-0 h-24 w-24 -translate-y-12 translate-x-12 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
    </Surface>
  );
}
