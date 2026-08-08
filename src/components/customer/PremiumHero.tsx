import { SectionTitle, Section, Surface, StatusChip, PageTitle, Muted } from "@/components/customer/ui/kit";
import { CheckCircle2, Car, Sparkles, MapPin } from "lucide-react";

export function PremiumHero({ service, vehicleSubActive, onBookIncluded, previewPayable, purchaseMode }: any) {
  if (purchaseMode === 'one_time_service' || purchaseMode === 'paid_add_on') {
    return (
      <Surface className="relative overflow-hidden border-primary/10 bg-gradient-to-br from-white to-[#FFF5ED] mb-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary animate-pulse" />
              <span className="text-[13px] font-black text-primary uppercase tracking-wider">Premium Service</span>
            </div>
            <h2 className="text-[22px] font-black text-foreground leading-tight">{service.name}</h2>
            <p className="mt-2 text-[14px] font-medium text-muted-foreground/80 leading-relaxed">
              {service.description || "Professional doorstep car care treatment"}
            </p>
            
            {vehicleSubActive && (
              <div className="mt-4 flex items-center gap-2 bg-success/10 text-success px-3 py-1.5 rounded-lg w-fit">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="text-[11px] font-black uppercase tracking-widest">Daily Shine Active</span>
              </div>
            )}
          </div>
          <div className="ml-4 flex flex-col items-end">
            <div className="text-[28px] font-black text-primary leading-none">₹{previewPayable}</div>
            <div className="text-[11px] font-bold text-muted-foreground/40 mt-1">One-time</div>
          </div>
        </div>
        
        {service.benefits && service.benefits.length > 0 && (
          <div className="mt-6 pt-5 border-t border-black/5">
            <div className="text-[12px] font-black text-foreground/40 uppercase tracking-widest mb-3">What's included</div>
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
      </Surface>
    );
  }

  if (vehicleSubActive) {
    return (
      <Surface className="relative overflow-hidden border-success/20 bg-success/5 mb-6 p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-success font-black">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-[17px]">Daily Shine is Active</span>
            </div>
            <p className="mt-1 text-[13px] font-medium text-success/70">You already have a subscription for this vehicle.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button onClick={() => window.location.href='/c/subscriptions'} className="px-4 py-2 rounded-xl border border-success/20 bg-white text-success font-bold text-[12px] active:scale-95 transition-transform">
                View My Plan
              </button>
              <button onClick={onBookIncluded} className="px-4 py-2 rounded-xl bg-success text-white font-bold text-[12px] hover:bg-success/90 active:scale-95 transition-transform">
                Book Included Wash
              </button>
            </div>
          </div>
          <Sparkles className="h-10 w-10 text-success/20" />
        </div>
      </Surface>
    );
  }

  return (
    <Surface className="relative overflow-hidden border-primary/10 bg-gradient-to-br from-white to-[#FFF5ED]">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <h2 className="text-[20px] font-black text-foreground">{service.name}</h2>
          <p className="mt-1 text-[13px] font-medium text-muted-foreground/70">{service.description || "Premium doorstep car care"}</p>
          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-[28px] font-black text-primary">₹{previewPayable}</span>
            <span className="text-[14px] font-bold text-muted-foreground/50">/ month</span>
          </div>
        </div>
        <div className="rounded-full bg-[#FFE6D6] px-3 py-1 text-[11px] font-black text-primary uppercase tracking-widest">Best Value</div>
      </div>
      
      <div className="mt-6 grid grid-cols-3 gap-2 border-t border-black/5 pt-4">
         <BenefitItem icon={Car} label="26 Daily" sub="Exterior" />
         <BenefitItem icon={Sparkles} label="1 Premium" sub="Monthly" />
         <BenefitItem icon={MapPin} label="Doorstep" sub="Service" />
      </div>
      <div className="absolute right-0 top-0 h-24 w-24 -translate-y-8 translate-x-8 rounded-full bg-primary/5 blur-3xl" />
    </Surface>
  );
}

function BenefitItem({ icon: Icon, label, sub }: { icon: any; label: string; sub: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-1 grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-[11px] font-black text-foreground">{label}</div>
      <div className="text-[10px] font-medium text-muted-foreground/60">{sub}</div>
    </div>
  );
}
