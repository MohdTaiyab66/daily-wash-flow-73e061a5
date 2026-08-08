import { SectionTitle, Section, Surface, StatusChip, PageTitle, Muted } from "@/components/customer/ui/kit";
import { CheckCircle2, Car, Sparkles, MapPin } from "lucide-react";

export function PremiumHero({ service, vehicleSubActive, onBookIncluded, previewPayable }: any) {
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
