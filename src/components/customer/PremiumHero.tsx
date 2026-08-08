import { Surface, Muted } from "@/components/customer/ui/kit";
import { CheckCircle2, Car, Sparkles, MapPin, ChevronRight, Clock } from "lucide-react";

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
  return (
    <div className="space-y-4">
      {/* Context Selector: Vehicle & Address */}
      <Surface className="p-0 overflow-hidden border-black/5">
        <button 
          onClick={onVehicleClick}
          className="w-full flex items-center justify-between p-4 border-b border-black/[0.03] active:bg-black/[0.02] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Car className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left">
              <div className="text-[14px] font-black text-foreground">
                {vehicle?.make} {vehicle?.model || "Select Car"}
              </div>
              <Muted className="text-[11px] font-bold">{vehicle?.registration_number || "Tap to select"}</Muted>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
        </button>

        <button 
          onClick={onAddressClick}
          className="w-full flex items-center justify-between p-4 active:bg-black/[0.02] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <div className="text-left min-w-0 flex-1">
              <div className="text-[14px] font-black text-foreground truncate">
                {address?.label || "Select Location"}
              </div>
              <Muted className="text-[11px] font-bold truncate">
                {address?.address_line ? `${address.address_line}, ${address.area}` : "Tap to add address"}
              </Muted>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
        </button>
      </Surface>

      {/* Service Hero */}
      <Surface className="relative overflow-hidden border-primary/10 bg-gradient-to-br from-white to-[#FFF5ED]">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-[11px] font-black text-primary uppercase tracking-wider">
                {purchaseMode === 'new_subscription' ? 'Most Popular Plan' : 'Premium Service'}
              </span>
            </div>
            <h2 className="text-[20px] font-black text-foreground leading-tight">{service.name}</h2>
            
            <div className="mt-4 flex flex-wrap gap-3">
              <div className="flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground">
                <Clock className="h-3.5 w-3.5 text-primary/60" />
                <span>~60-90 min</span>
              </div>
              <div className="flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 text-primary/60" />
                <span>Doorstep</span>
              </div>
            </div>
          </div>
          
          <div className="ml-4 flex flex-col items-end shrink-0">
            <div className="text-[26px] font-black text-primary leading-none">₹{previewPayable}</div>
            <div className="text-[11px] font-bold text-muted-foreground/40 mt-1 uppercase tracking-widest">
              {purchaseMode === 'new_subscription' ? '/ Month' : 'One-time'}
            </div>
          </div>
        </div>
        
        {/* Active Badge or Subscription Info */}
        {vehicleSubActive ? (
          <div className="mt-6 pt-5 border-t border-black/5 flex items-center justify-between">
            <div className="flex items-center gap-2 bg-success/10 text-success px-3 py-1.5 rounded-lg">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="text-[11px] font-black uppercase tracking-widest">Daily Shine Active</span>
            </div>
            {purchaseMode === 'included_wash' && (
              <button 
                onClick={onBookIncluded}
                className="text-[12px] font-black text-primary active:opacity-60"
              >
                Book included wash ›
              </button>
            )}
          </div>
        ) : purchaseMode === 'new_subscription' && (
          <div className="mt-6 grid grid-cols-3 gap-2 border-t border-black/5 pt-5">
             <BenefitItem icon={Car} label="26 Daily" sub="Exterior" />
             <BenefitItem icon={Sparkles} label="1 Premium" sub="Monthly" />
             <BenefitItem icon={CheckCircle2} label="All-round" sub="Protection" />
          </div>
        )}

        {/* Benefits for One-time/Paid add-on */}
        {(purchaseMode === 'one_time_service' || purchaseMode === 'paid_add_on') && service.benefits && service.benefits.length > 0 && (
          <div className="mt-6 pt-5 border-t border-black/5">
            <div className="grid grid-cols-1 gap-2.5">
              {service.benefits.map((b: string, i: number) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="h-5 w-5 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-3 w-3 text-success" />
                  </div>
                  <span className="text-[13px] font-bold text-foreground/80">{b}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="absolute right-0 top-0 h-24 w-24 -translate-y-8 translate-x-8 rounded-full bg-primary/5 blur-3xl" />
      </Surface>
    </div>
  );
}

function BenefitItem({ icon: Icon, label, sub }: { icon: any; label: string; sub: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-1 grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-[11px] font-black text-foreground">{label}</div>
      <div className="text-[10px] font-medium text-muted-foreground/60 leading-none mt-0.5">{sub}</div>
    </div>
  );
}
