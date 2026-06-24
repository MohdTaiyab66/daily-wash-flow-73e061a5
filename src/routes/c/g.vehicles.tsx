import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Car, Plus, Trash2, Check } from "lucide-react";
import { readGuestCart, writeGuestCart, tierToPriceKey, type GuestVehicle } from "@/lib/guest-cart";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/c/g/vehicles")({
  ssr: false,
  head: () => ({ meta: [{ title: "My vehicle — Urban Wash" }] }),
  component: GuestVehicles,
});

function GuestVehicles() {
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState<GuestVehicle | undefined>(undefined);

  useEffect(() => {
    setVehicle(readGuestCart().vehicle);
  }, []);

  const remove = () => {
    writeGuestCart({ vehicle: undefined, vehicleCategory: undefined });
    setVehicle(undefined);
    toast.success("Vehicle removed");
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link to="/c/services" className="p-1.5 -ml-1.5 rounded-lg hover:bg-accent">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-base font-semibold tracking-tight">My vehicle</h1>
        </div>
      </div>

      <div className="px-5 pt-5">
        {vehicle ? (
          <div className="rounded-3xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Car className="h-6 w-6" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold">
                  {vehicle.make} {vehicle.model}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {vehicle.bodyLabel ?? (vehicle.category === "sedan_suv" ? "Sedan / SUV" : "Hatchback")}
                  {vehicle.color ? ` • ${vehicle.color}` : ""}
                </p>
                {vehicle.registration && (
                  <p className="mt-0.5 text-xs font-mono uppercase">{vehicle.registration}</p>
                )}
              </div>
              <button onClick={remove} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => navigate({ to: "/c/g/vehicles/add" })}>
                Switch vehicle
              </Button>
              <Button onClick={() => navigate({ to: "/c/services" })}>
                <Check className="mr-1.5 h-4 w-4" /> Browse services
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => navigate({ to: "/c/g/vehicles/add" })}
            className="flex w-full items-center justify-between rounded-3xl border border-dashed border-border bg-card p-6 text-left transition hover:border-primary/40"
          >
            <div>
              <p className="text-base font-semibold">Add your car</p>
              <p className="mt-1 text-xs text-muted-foreground">
                We'll auto-detect the size tier and show correct pricing.
              </p>
            </div>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Plus className="h-5 w-5" />
            </span>
          </button>
        )}

        <p className="mt-4 text-[11px] text-muted-foreground">
          {vehicle
            ? `Pricing tier: ${tierToPriceKey(vehicle.category) === "sedan_suv" ? "Sedan / SUV" : "Hatchback"}`
            : "You can add a vehicle without signing in. We'll save it permanently once you log in."}
        </p>
      </div>
    </div>
  );
}
