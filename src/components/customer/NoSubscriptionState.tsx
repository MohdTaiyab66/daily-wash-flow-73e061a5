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
    <div className="mt-8 flex flex-col items-center rounded-3xl border border-dashed border-border p-10 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
        <Sparkles className="h-7 w-7 text-primary" />
      </div>
      <h3 className="mt-4 text-base font-semibold">No Active Subscription</h3>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
        {vehicleLabel ? `${vehicleLabel} doesn't` : "This vehicle doesn't"} have an active Daily Shine
        subscription yet.
      </p>
      <Button
        size="lg"
        className="mt-6 h-11 rounded-full px-8 text-sm font-semibold"
        onClick={() =>
          navigate({
            to: "/c/service/$slug",
            params: { slug: "daily-shine" },
            search: vehicleId ? { vehicleId } : undefined,
          })
        }
      >
        Subscribe Now
      </Button>
    </div>
  );
}
