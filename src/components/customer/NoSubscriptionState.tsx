import { useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveDailyShinePrice } from "@/lib/pricing";

export function NoSubscriptionState({
  vehicleId,
  vehicleLabel,
}: {
  vehicleId: string | null;
  vehicleLabel: string | null;
}) {
  const navigate = useNavigate();
  // DIAGNOSTIC DATA
  const diagPrice = resolveDailyShinePrice(vehicleLabel?.toLowerCase()?.includes("suv") ? "sedan_suv" : "hatchback", null);
  
  return (
    <div className="mt-5 flex flex-col items-center rounded-[18px] border border-[#EEEEEE] bg-white p-8 text-center shadow-sm">
      <div className="grid h-[52px] w-[52px] place-items-center rounded-[16px] bg-[#FFF1E8] text-[#FF6B00] mb-5">
        <Sparkles className="h-[24px] w-[24px]" />
      </div>
      <h3 className="text-[20px] font-semibold text-[#1A1A1A]">Start Daily Shine</h3>
      
      {/* DIAGNOSTIC BLOCK */}
      <div className="text-[8px] text-left opacity-50 mb-2 border p-1 font-mono">
        BUILD: 2026-08-13-DIAG-A<br/>
        VEHICLE: {vehicleLabel}<br/>
        PRICE: ₹{diagPrice}<br/>
        COMP: NoSubscriptionState
      </div>

      <p className="mt-2 max-w-[240px] text-[14px] font-normal leading-relaxed text-[#8A8A8A]">
        Your vehicle doesn't have an active membership yet.
      </p>

      <Button
        className="mt-7 h-11 w-full rounded-xl bg-[#181818] text-white text-[15px] font-semibold active:scale-[0.98] transition-transform"
        onClick={() =>
          navigate({
            to: "/c/service/$slug",
            params: { slug: "daily-shine" },
            search: (prev: any) => ({ ...prev, vehicleId: vehicleId ?? undefined }),
          })
        }
      >
        Subscribe for ₹{diagPrice}/mo
      </Button>
    </div>
  );
}
