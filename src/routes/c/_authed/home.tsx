import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  MapPin,
  Plus,
  ChevronRight,
  Sparkles,
  Droplets,
  Wrench,
  ShowerHead,
  ChevronDown,
  BellRing,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SERVICE_AREA_NAMES } from "@/lib/areas";
import { vehicleBodyLabel } from "@/lib/vehicle-category";
import { VehicleAvatar } from "@/components/VehicleAvatar";
import { toast } from "sonner";

export const Route = createFileRoute("/c/_authed/home")({
  ssr: false,
  head: () => ({ meta: [{ title: "Home — Urban Wash" }] }),
  component: CustomerHome,
});

type Vehicle = {
  id: string;
  make: string;
  model: string;
  category: string;
  registration_number: string;
  color: string | null;
  image_path: string | null;
};
type Service = {
  id: string;
  slug: string;
  name: string;
  description: string;
  banner_url: string | null;
  price_hatchback: number;
  price_sedan_suv: number;
  service_type: string;
  sort_order: number;
};

const SERVICE_ICON: Record<string, LucideIcon> = {
  daily_shine: Sparkles,
  one_time_basic: Droplets,
  one_time_plus: Droplets,
  deep_clean: ShowerHead,
  interior_deep: Wrench,
};

function CustomerHome() {
  const navigate = useNavigate();
  const [area, setArea] = useState<string>("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [vehicleSheetOpen, setVehicleSheetOpen] = useState(false);

  useEffect(() => {
    setArea(localStorage.getItem("uw_customer_area") ?? "");
    setSelectedVehicleId(localStorage.getItem("uw_customer_vehicle") ?? null);
  }, []);

  const vehiclesQ = useQuery({
    queryKey: ["customer-vehicles"],
    queryFn: async (): Promise<Vehicle[]> => {
      const { data, error } = await supabase
        .from("customer_vehicles")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Vehicle[];
    },
  });

  const servicesQ = useQuery({
    queryKey: ["service-catalog"],
    queryFn: async (): Promise<Service[]> => {
      const { data, error } = await supabase
        .from("service_catalog")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Service[];
    },
  });

  const vehicles = vehiclesQ.data ?? [];
  const activeVehicle = vehicles.find((v) => v.id === selectedVehicleId) ?? vehicles[0];
  const category = activeVehicle?.category ?? "hatchback_compact_sedan";
  const bodyLabel = activeVehicle
    ? vehicleBodyLabel(activeVehicle.make, activeVehicle.model, activeVehicle.category)
    : "";

  // Lookup catalog image for the active vehicle (by make + model)
  const catalogImageQ = useQuery({
    queryKey: ["vehicle-catalog-image", activeVehicle?.make, activeVehicle?.model],
    enabled: !!activeVehicle,
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase
        .from("vehicle_catalog")
        .select("image_url")
        .ilike("make", activeVehicle!.make)
        .ilike("model", activeVehicle!.model)
        .limit(1)
        .maybeSingle();
      return data?.image_url ?? null;
    },
  });

  const pickVehicle = (id: string) => {
    setSelectedVehicleId(id);
    localStorage.setItem("uw_customer_vehicle", id);
    setVehicleSheetOpen(false);
  };

  const priceFor = (s: Service) =>
    category === "sedan_suv" ? s.price_sedan_suv : s.price_hatchback;

  return (
    <div className="px-5 pt-6">
      {/* Top bar: location (left) · vehicle chip (right) */}
      <div className="flex items-start justify-between gap-3">
        <button
          onClick={() => navigate({ to: "/c" })}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <MapPin className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{area || "Pick area"}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>

        {activeVehicle ? (
          <button
            onClick={() =>
              vehicles.length > 1 ? setVehicleSheetOpen(true) : navigate({ to: "/c/vehicles/add" })
            }
            className="group flex items-center gap-2 rounded-full border border-border bg-card px-2 py-1.5 pr-3 shadow-sm transition-all hover:border-primary/40"
          >
            <VehicleAvatar
              imageUrl={catalogImageQ.data}
              make={activeVehicle.make}
              model={activeVehicle.model}
              color={activeVehicle.color}
              className="h-9 w-9 rounded-full"
            />
            <span className="flex flex-col items-start leading-tight">
              <span className="text-[11px] font-semibold uppercase tracking-wide">
                {activeVehicle.model}
              </span>
              <span className="text-[10px] text-muted-foreground">{bodyLabel}</span>
            </span>
            {vehicles.length > 1 && <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
        ) : (
          <Link
            to="/c/vehicles/add"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Add vehicle
          </Link>
        )}
      </div>

      {/* Vehicle hero card */}
      {activeVehicle ? (
        <div className="mt-4 rounded-3xl border border-border bg-gradient-to-br from-accent/60 to-card p-5">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Your car</p>
              <h2 className="mt-1 truncate text-2xl font-semibold tracking-tight">
                {activeVehicle.make} {activeVehicle.model}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {activeVehicle.registration_number} ·{" "}
                <span className="font-medium text-foreground">
                  {activeVehicle.model.toUpperCase()} — {bodyLabel}
                </span>
              </p>
            </div>
            <VehicleAvatar
              imageUrl={catalogImageQ.data}
              make={activeVehicle.make}
              model={activeVehicle.model}
              color={activeVehicle.color}
              className="h-16 w-24 rounded-2xl bg-card"
            />
          </div>
          <Link
            to="/c/vehicles/add"
            className="mt-3 inline-flex items-center gap-1 text-xs text-primary"
          >
            <Plus className="h-3.5 w-3.5" /> Add another vehicle
          </Link>
        </div>
      ) : (
        <Link
          to="/c/vehicles/add"
          className="mt-4 flex items-center justify-between rounded-3xl border border-border bg-gradient-to-br from-accent/60 to-card p-5"
        >
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Add your car</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">Get started in 30 seconds</h2>
            <p className="mt-1 text-xs text-muted-foreground">Add your vehicle to see pricing.</p>
          </div>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Plus className="h-5 w-5" />
          </span>
        </Link>
      )}

      {/* Services / Coming-soon gate */}
      <div className="mt-7">
        {area && !SERVICE_AREA_NAMES.includes(area) ? (
          <ComingSoon area={area} onChange={() => navigate({ to: "/c" })} />
        ) : (
          <>
            <h3 className="text-lg font-semibold tracking-tight">Choose a service</h3>
            <p className="text-xs text-muted-foreground">
              Prices for{" "}
              {bodyLabel || (category === "sedan_suv" ? "Sedan / SUV" : "Hatchback / Compact")}
            </p>

            <div className="mt-4 space-y-3">
              {servicesQ.isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
                ))}
              {(servicesQ.data ?? []).map((s) => {
                const Icon = SERVICE_ICON[s.slug] ?? Sparkles;
                const recurring = s.service_type === "subscription";
                return (
                  <Link
                    key={s.id}
                    to="/c/service/$slug"
                    params={{ slug: s.slug }}
                    className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
                  >
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent text-accent-foreground">
                      <Icon className="h-6 w-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="truncate text-base font-semibold">{s.name}</h4>
                        {recurring && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            SUBSCRIPTION
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {s.description}
                      </p>
                      <p className="mt-1.5 text-sm font-semibold text-foreground">
                        ₹{priceFor(s)}
                        {recurring ? (
                          <span className="text-xs font-normal text-muted-foreground"> /month</span>
                        ) : null}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                );
              })}
            </div>

            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              Pay after service. Razorpay coming soon.
            </p>
          </>
        )}
      </div>

      {/* Vehicle switcher sheet */}
      <Dialog open={vehicleSheetOpen} onOpenChange={setVehicleSheetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Switch vehicle</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {vehicles.map((v) => (
              <button
                key={v.id}
                onClick={() => pickVehicle(v.id)}
                className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left ${
                  v.id === activeVehicle?.id
                    ? "border-primary bg-accent"
                    : "border-border hover:bg-muted"
                }`}
              >
                <div>
                  <div className="font-medium">
                    {v.make} {v.model}
                  </div>
                  <div className="text-xs text-muted-foreground">{v.registration_number}</div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {vehicleBodyLabel(v.make, v.model, v.category)}
                </span>
              </button>
            ))}
            <Button asChild variant="outline" className="w-full">
              <Link to="/c/vehicles/add">
                <Plus className="mr-1 h-4 w-4" /> Add another
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ComingSoon({ area, onChange }: { area: string; onChange: () => void }) {
  const notify = async () => {
    try {
      const { data: u } = await supabase.auth.getUser();
      const phone = u.user?.phone ?? null;
      await supabase.from("area_waitlist").insert({
        area,
        phone: phone ?? "",
      });
      toast.success("We'll notify you when we launch in your area!");
    } catch {
      toast.error("Could not save. Try again.");
    }
  };
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <h2 className="text-3xl font-extrabold tracking-tight text-muted-foreground">
        WE ARE <br />
        COMING <span className="text-primary">SOON</span>
      </h2>
      <p className="mt-4 max-w-xs text-sm text-muted-foreground">
        We're currently live in select areas and expanding quickly. Get notified when we are near
        you!
      </p>
      <Button onClick={notify} size="lg" className="mt-6 rounded-full px-8">
        <BellRing className="mr-2 h-4 w-4" /> Notify me!
      </Button>
      <button
        onClick={onChange}
        className="mt-4 text-sm font-medium text-primary underline underline-offset-4"
      >
        Change location
      </button>
    </div>
  );
}
