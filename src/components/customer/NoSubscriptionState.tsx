import { useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NoSubscriptionState({
  vehicleId,
  vehicleLabel,
}: {
  vehicleId: string | null;
  vehicleLabel: string | null;
}) {
  const navigate = useNavigate();
  return (
    <div className="mt-6 flex flex-col items-center rounded-[22px] border border-[#EEEEEE] bg-white p-8 text-center shadow-sm">
      <div className="grid h-[58px] w-[58px] place-items-center rounded-[20px] bg-[#FFF2E8] text-[#FF6B00] mb-5">
        <Sparkles className="h-[28px] w-[28px]" />
      </div>
      <h3 className="text-[20px] font-semibold text-[#1A1A1A]">Start Daily Shine</h3>
      <p className="mt-2 max-w-[240px] text-[15px] font-medium leading-relaxed text-[#8A8A8A]">
        Your vehicle doesn't have an active membership yet.
      </p>

      <Button
        className="mt-8 h-12 w-full rounded-2xl bg-[#1A1A1A] text-white text-[15px] font-semibold active:scale-[0.98] transition-transform"
        onClick={() =>
          navigate({
            to: "/c/service/$slug",
            params: { slug: "daily-shine" },
            search: (prev: any) => ({ ...prev, vehicleId: vehicleId ?? undefined }),
          })
        }
      >
        Subscribe for ₹1,199/mo
      </Button>
    </div>
  );
}
