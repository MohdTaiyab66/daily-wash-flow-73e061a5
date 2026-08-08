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
    <div className="mt-8 flex flex-col items-center rounded-[28px] border border-black/5 bg-white p-10 text-center shadow-sm">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/5 text-primary mb-6">
        <Sparkles className="h-8 w-8" />
      </div>
      <h3 className="text-[17px] font-black tracking-tight text-[#1a1a1a]">Start Daily Shine</h3>
      <p className="mt-2 max-w-[240px] text-[13px] font-medium leading-relaxed text-muted-foreground/60">
        {vehicleLabel ? `${vehicleLabel} doesn't` : "Your vehicle doesn't"} have an active membership yet.
      </p>
      <Button
        size="lg"
        className="mt-8 h-12 w-full rounded-2xl px-8 text-[14px] font-black shadow-lg shadow-primary/10 active:scale-[0.98] transition-transform"
        onClick={() =>
          navigate({
            to: "/c/service/$slug",
            params: { slug: "daily-shine" },
            search: vehicleId ? { vehicleId } : undefined,
          })
        }
      >
        Subscribe for ₹999/mo
      </Button>
    </div>
  );
}
