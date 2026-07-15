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
  Check,
  Clock,
  Pencil,
  Camera,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAreaAvailability, isServiceAllowed } from "@/lib/area-availability";
import { vehicleBodyLabel } from "@/lib/vehicle-category";
import { VehicleAvatar } from "@/components/VehicleAvatar";
import { toast } from "sonner";
import { EditVehicleDialog, ChangePhotoDialog } from "@/components/customer/EditVehicleInline";

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
  duration_minutes: number | null;
};

const SERVICE_ICON: Record<string, LucideIcon> = {
  "daily-shine": Sparkles,
  "one-time-wash-basic": Droplets,
  "one-time-wash-premium": ShowerHead,
  "deep-clean": Wrench,
  "interior-deep-clean": Wrench,
  daily_shine: Sparkles,
  one_time_basic: Droplets,
  one_time_plus: ShowerHead,
  deep_clean: Wrench,
  interior_deep: Wrench,
};

const PLAN_INCLUDED_SERVICE_SLUGS = ["daily-shine-exterior", "daily-shine-interior", "daily-shine-dusting"];

function CustomerHome() {
  const navigate = useNavigate();
  const [area, setArea] = useState<string>("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [vehicleSheetOpen, setVehicleSheetOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);

  useEffect(() => {
    const savedArea = localStorage.getItem("uw_customer_area") ?? "";
    setArea(savedArea);
    setSelectedVehicleId(localStorage.getItem("uw_customer_vehicle") ?? null);
    // Self-heal: older sessions stored `uw_customer_area` without `uw_customer_geo`.
    // Without geo the coverage lookup returns matched:false and the home banner
    // wrongly says "Daily Shine not yet available in your area". Back-fill from
    // the canonical service-area list so the coverage RPC has coordinates to test.
    try {
      if (savedArea && !localStorage.getItem("uw_customer_geo")) {
        // Late import so the module isn't loaded before hydration.
        import("@/lib/areas").then(({ SERVICE_AREAS }) => {
          const match = SERVICE_AREAS.find((a) => a.name.toLowerCase() === savedArea.toLowerCase());
          if (match) {
            localStorage.setItem(
              "uw_customer_geo",
              JSON.stringify({ lat: match.lat, lng: match.lng, pincode: null, state: "Uttar Pradesh", city: "Lucknow" }),
            );
            window.dispatchEvent(new StorageEvent("storage", { key: "uw_customer_geo" }));
          }
        });
      }
    } catch { /* ignore */ }
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

  // Uses useVehicleImageUrl so the customer's own uploaded photo (from
  // `customer_vehicles.image_path`) takes priority over the catalog stock
  // image. Change photo dialog invalidates ["vehicle-image-url", ...] on
  // success so Home reflects the new picture instantly.
  const catalogImageQ = useVehicleImageUrl({
    make: activeVehicle?.make,
    model: activeVehicle?.model,
    imagePath: activeVehicle?.image_path,
  });

  const pickVehicle = (id: string) => {
    setSelectedVehicleId(id);
    localStorage.setItem("uw_customer_vehicle", id);
    setVehicleSheetOpen(false);
  };

  const priceFor = (s: Service) =>
    category === "sedan_suv" ? s.price_sedan_suv : s.price_hatchback;

  const services = servicesQ.data ?? [];
  const subscription = services.find((s) => s.service_type === "subscription");
  const oneTime = services.filter((s) => s.service_type !== "subscription" && !PLAN_INCLUDED_SERVICE_SLUGS.includes(s.slug));

  const availability = useAreaAvailability();
  const a = availability.data;
  const bothOff = !a.daily_shine && !a.premium;
  const showCatalog = !area || !bothOff;

  return (
    <div className="px-5 pt-6">
      {/* Top bar */}
      <div className="flex items-start justify-between gap-3">
        <button
          onClick={() => {
            try { localStorage.removeItem("uw_customer_area"); } catch {}
            if (typeof window !== "undefined") window.location.href = "/c?change=1";
          }}
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
                <span className="font-medium text-foreground">{bodyLabel}</span>
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
          <div className="mt-3 flex items-center gap-4 text-xs">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1 font-medium text-primary"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit vehicle
            </button>
            <button
              type="button"
              onClick={() => setPhotoOpen(true)}
              className="inline-flex items-center gap-1 font-medium text-primary"
            >
              <Camera className="h-3.5 w-3.5" /> Change photo
            </button>
            <Link
              to="/c/vehicles/add"
              className="ml-auto inline-flex items-center gap-1 text-muted-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Add another
            </Link>
          </div>
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

      {!showCatalog ? (
        <div className="mt-7">
          <ComingSoon area={area} onChange={() => navigate({ to: "/c" })} />
        </div>
      ) : (
        <>
          {/* Subscription hero */}
          {subscription && (() => {
            const dsAllowed = a.daily_shine;
            const card = (
              <div className={`relative block overflow-hidden rounded-3xl border ${dsAllowed ? "border-primary/20 bg-gradient-to-br from-primary/10 via-accent/40 to-card" : "border-border bg-muted/30 opacity-70"} p-5 transition-all`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                      <Sparkles className="h-3 w-3" /> Daily plan
                    </span>
                    <h4 className="mt-2 text-xl font-semibold tracking-tight">{subscription.name}</h4>
                    <ul className="mt-2 space-y-1 text-xs text-foreground/80">
                      <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> Daily Exterior Cleaning</li>
                      <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> 1 Interior &amp; Exterior Wash every month</li>
                      <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> Doorstep Service</li>
                      <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> Monday Weekly Rest</li>
                    </ul>
                    {!dsAllowed && <p className="mt-2 text-[11px] font-semibold text-amber-700">Daily Shine subscription is not yet available in your area.</p>}
                  </div>
                  <Sparkles className="h-8 w-8 shrink-0 text-primary/70" />
                </div>
                <div className="mt-4 flex items-baseline justify-between border-t border-border/60 pt-3">
                  <div>
                    <span className="text-2xl font-bold">₹{priceFor(subscription)}</span>
                    <span className="ml-1 text-xs text-muted-foreground">/month</span>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${dsAllowed ? "text-primary" : "text-muted-foreground"}`}>
                    {dsAllowed ? <>View plan <ChevronRight className="h-3.5 w-3.5" /></> : "Coming soon"}
                  </span>
                </div>
              </div>
            );
            return (
              <section className="mt-7">
                <div className="mb-3 flex items-baseline justify-between">
                  <h3 className="text-base font-semibold tracking-tight">Subscribe & save</h3>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Best value</span>
                </div>
                {dsAllowed ? (
                  <Link to="/c/service/$slug" params={{ slug: subscription.slug }} className="block hover:-translate-y-0.5 transition-transform">{card}</Link>
                ) : card}
              </section>
            );
          })()}

          {/* One-time washes */}
          {oneTime.length > 0 && (
            <section className="mt-7">
              <div className="mb-3 flex items-baseline justify-between">
                <h3 className="text-base font-semibold tracking-tight">One-time washes</h3>
                <span className="text-[11px] text-muted-foreground">
                  {bodyLabel ? `Prices for ${bodyLabel}` : ""}
                </span>
              </div>
              <div className="space-y-2.5">
                {servicesQ.isLoading &&
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
                  ))}
                {oneTime.map((s) => {
                  const Icon = SERVICE_ICON[s.slug] ?? Droplets;
                  const allowed = isServiceAllowed(s.slug, a);
                  const inner = (
                    <>
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent text-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-semibold">{s.name}</h4>
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{s.description}</p>
                        <div className="mt-1.5 flex items-center gap-3">
                          <span className="text-sm font-bold text-foreground">₹{priceFor(s)}</span>
                          {s.duration_minutes ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Clock className="h-3 w-3" /> {s.duration_minutes} min
                            </span>
                          ) : null}
                          {!allowed && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Coming soon</span>}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </>
                  );
                  const cls = `group flex items-center gap-3.5 rounded-2xl border border-border bg-card p-3.5 transition-all ${allowed ? "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm" : "opacity-60 pointer-events-none"}`;
                  return allowed ? (
                    <Link key={s.id} to="/c/service/$slug" params={{ slug: s.slug }} className={cls}>{inner}</Link>
                  ) : (
                    <div key={s.id} className={cls}>{inner}</div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Trust strip */}
          <div className="mt-6 grid grid-cols-3 gap-2 text-center text-[10px] text-muted-foreground">
            <TrustChip><Check className="h-3 w-3 text-success" /> Vetted partners</TrustChip>
            <TrustChip><Check className="h-3 w-3 text-success" /> Photo proof</TrustChip>
            <TrustChip><Check className="h-3 w-3 text-success" /> Pay after</TrustChip>
          </div>
        </>
      )}

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

      <EditVehicleDialog
        vehicle={(activeVehicle ?? null) as any}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <ChangePhotoDialog
        vehicle={(activeVehicle ?? null) as any}
        open={photoOpen}
        onOpenChange={setPhotoOpen}
      />
    </div>
  );
}

function TrustChip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-1 rounded-full border border-border bg-card px-2 py-1.5">
      {children}
    </div>
  );
}

function ComingSoon({ area, onChange: _onChange }: { area: string; onChange: () => void }) {
  const notify = async () => {
    try {
      const { data: u } = await supabase.auth.getUser();
      const phone = u.user?.phone ?? null;
      let geo: any = {};
      try { geo = JSON.parse(localStorage.getItem("uw_customer_geo") ?? "{}"); } catch {}
      await (supabase as any).from("expansion_requests").insert({
        customer_id: u.user?.id ?? null,
        phone: phone ?? "",
        area_name: area,
        pincode: geo.pincode ?? null,
        lat: geo.lat ?? null,
        lng: geo.lng ?? null,
        interested_service: "general",
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
        Urban Wash is expanding rapidly. We'll notify you once services become available in your area.
      </p>
      <Button onClick={notify} size="lg" className="mt-6 rounded-full px-8">
        <BellRing className="mr-2 h-4 w-4" /> Notify me!
      </Button>
      <button
        onClick={() => {
          try { localStorage.removeItem("uw_customer_area"); } catch {}
          if (typeof window !== "undefined") window.location.href = "/c?change=1";
        }}
        className="mt-4 text-sm font-medium text-primary underline underline-offset-4"
      >
        Change location
      </button>
    </div>
  );
}
