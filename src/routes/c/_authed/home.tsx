import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Pencil,
  Bell,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAreaAvailability, isServiceAllowed } from "@/lib/area-availability";
import { vehicleBodyLabel } from "@/lib/vehicle-category";
import { VehicleAvatar } from "@/components/VehicleAvatar";
import { toast } from "sonner";
import { EditVehicleDialog, ChangePhotoDialog } from "@/components/customer/EditVehicleInline";
import { useVehicleImageUrl } from "@/lib/vehicle-image";
import { PullToRefresh } from "@/components/customer/ui/PullToRefresh";
import { SkeletonCard, Shimmer } from "@/components/customer/ui/Skeletons";
import { ListGroup, ListRow, Section, StatusChip, Surface } from "@/components/customer/ui/kit";

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
    try {
      if (savedArea && !localStorage.getItem("uw_customer_geo")) {
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

  const qc = useQueryClient();

  const profileQ = useQuery({
    queryKey: ["customer-profile-name"],
    queryFn: async (): Promise<string | null> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await (supabase as any)
        .from("customer_profiles")
        .select("full_name")
        .eq("user_id", u.user.id)
        .maybeSingle();
      return (data?.full_name as string | undefined) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const unreadQ = useQuery({
    queryKey: ["customer-notifications-unread"],
    queryFn: async (): Promise<number> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return 0;
      const { count } = await supabase
        .from("customer_notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      return count ?? 0;
    },
    refetchInterval: 60000,
  });

  // Status chip only — subscription lifecycle stays owned by the backend.
  const subStatusQ = useQuery({
    queryKey: ["customer-subscription-status", selectedVehicleId],
    queryFn: async (): Promise<string | null> => {
      const { data } = await (supabase as any)
        .from("subscriptions")
        .select("status,vehicle_id,created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      const rows = (data ?? []) as Array<{ status: string; vehicle_id: string | null }>;
      if (rows.length === 0) return null;
      const mine = selectedVehicleId ? rows.filter((r) => r.vehicle_id === selectedVehicleId) : rows;
      const pick = mine.find((r) => r.status === "active")
        ?? mine.find((r) => r.status === "payment_pending")
        ?? mine[0];
      return pick?.status ?? null;
    },
  });

  const vehicles = vehiclesQ.data ?? [];
  const activeVehicle = vehicles.find((v) => v.id === selectedVehicleId) ?? vehicles[0];
  const category = activeVehicle?.category ?? "hatchback_compact_sedan";
  const bodyLabel = activeVehicle
    ? vehicleBodyLabel(activeVehicle.make, activeVehicle.model, activeVehicle.category)
    : "";

  const catalogImageQ = useVehicleImageUrl({
    make: activeVehicle?.make,
    model: activeVehicle?.model,
    imagePath: activeVehicle?.image_path,
    transform: { width: 480, height: 360, quality: 72, resize: "cover" },
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

  const firstName = (profileQ.data ?? "").trim().split(/\s+/)[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const unread = unreadQ.data ?? 0;
  const subStatus = subStatusQ.data;
  const planActive = subStatus === "active";
  const planPending = subStatus === "payment_pending";

  const refreshAll = () =>
    Promise.all([
      vehiclesQ.refetch(),
      servicesQ.refetch(),
      subStatusQ.refetch(),
      unreadQ.refetch(),
      qc.invalidateQueries({ queryKey: ["customer-notifications-unread"] }),
    ]);

  return (
    <PullToRefresh onRefresh={refreshAll}>
    <div className="px-5 pt-6">
      {/* Greeting */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted-foreground">{greeting},</p>
          {profileQ.isLoading ? (
            <Shimmer className="mt-1.5 h-6 w-32 rounded-lg" />
          ) : (
            <h1 className="truncate text-[26px] font-bold leading-tight tracking-tight">
              {firstName}
            </h1>
          )}
          <button
            onClick={() => {
              try { localStorage.removeItem("uw_customer_area"); } catch {}
              if (typeof window !== "undefined") window.location.href = "/c?change=1";
            }}
            className="mt-1.5 inline-flex items-center gap-1 text-[13px] text-muted-foreground"
          >
            <MapPin className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">{area || "Pick area"}</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <Link
          to="/c/notifications"
          aria-label="Notifications"
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-card shadow-sm"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Link>
      </div>

      {/* Vehicle */}
      {vehiclesQ.isLoading ? (
        <SkeletonCard className="mt-5" />
      ) : activeVehicle ? (
        <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:shadow-md">
          <button
            type="button"
            onClick={() => (vehicles.length > 1 ? setVehicleSheetOpen(true) : setEditOpen(true))}
            className="uw-pressable flex w-full items-center gap-3.5 p-4 text-left"
          >
            <VehicleAvatar
              imageUrl={catalogImageQ.data}
              make={activeVehicle.make}
              model={activeVehicle.model}
              color={activeVehicle.color}
              className="h-16 w-24 shrink-0 rounded-xl bg-muted object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your car</p>
              <h2 className="mt-0.5 truncate text-[17px] font-bold tracking-tight">
                {activeVehicle.make} {activeVehicle.model}
              </h2>
              <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                {activeVehicle.registration_number} · {bodyLabel}
              </p>
            </div>
            {vehicles.length > 1 && <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
          </button>
          <div className="flex items-center justify-between border-t border-border/50 bg-accent/20 px-4 py-2.5">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit vehicle
            </button>
            <Link to="/c/vehicles/add" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground">
              <Plus className="h-3.5 w-3.5" /> Add another
            </Link>
          </div>
        </div>
      ) : (
        <Link
          to="/c/vehicles/add"
          className="uw-pressable mt-5 flex items-center gap-4 rounded-2xl border border-border/70 bg-card p-4"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Plus className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[16px] font-bold tracking-tight">Add your car</span>
            <span className="mt-0.5 block text-[13px] text-muted-foreground">Takes 30 seconds — then you'll see your prices.</span>
          </span>
        </Link>
      )}

      {!showCatalog ? (
        <div className="mt-8">
          <ComingSoon area={area} onChange={() => navigate({ to: "/c" })} />
        </div>
      ) : (
        <>
          {/* Plan status — active / payment pending / promo */}
          {planActive || planPending ? (
            <Link to="/c/subscriptions" className="mt-5 block">
              <Surface
                className={`uw-pressable flex items-center gap-3.5 shadow-sm ${planPending ? "border-warning/40 bg-warning/[0.05]" : "border-success/30 bg-success/[0.04]"}`}
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${planPending ? "bg-warning/20 text-warning-foreground" : "bg-success/12 text-success"}`}>
                  <Sparkles className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold">Daily Shine</span>
                    {planPending ? (
                      <StatusChip tone="warning">Payment pending</StatusChip>
                    ) : (
                      <StatusChip tone="success">Active</StatusChip>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">
                    {planPending
                      ? "Complete payment to start your service."
                      : "We'll take care of your car today."}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />
              </Surface>
            </Link>
          ) : subscription && a.daily_shine ? (
            <Link to="/c/service/$slug" params={{ slug: subscription.slug }} className="mt-5 block">
              <Surface raised className="uw-pressable border-primary/20 bg-gradient-to-br from-accent via-card to-card">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Daily plan</p>
                    <h3 className="mt-1 text-[19px] font-bold tracking-tight">Keep your car clean every day</h3>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      Daily exterior cleaning, a monthly interior wash, at your doorstep.
                    </p>
                  </div>
                  <Sparkles className="h-6 w-6 shrink-0 text-primary/70" />
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-[15px]">
                    <span className="text-[20px] font-bold">₹{priceFor(subscription)}</span>
                    <span className="ml-1 text-[13px] text-muted-foreground">/month</span>
                  </p>
                  <span className="inline-flex h-9 items-center rounded-full bg-primary px-5 text-[13px] font-bold text-primary-foreground shadow-sm active:scale-95 transition-transform">
                    View plan
                  </span>
                </div>
              </Surface>
            </Link>
          ) : subscription ? (
            <Surface className="mt-5">
              <p className="text-[15px] font-semibold">Daily Shine is coming to your area</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                One-time services below are available right now.
              </p>
            </Surface>
          ) : null}

          {/* One-time services */}
          {oneTime.length > 0 && (
            <Section
              title="Services"
              action={
                bodyLabel ? (
                  <span className="text-[12px] text-muted-foreground">Prices for {bodyLabel}</span>
                ) : null
              }
            >
              {servicesQ.isLoading ? (
                <ListGroup>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-4">
                      <Shimmer className="h-9 w-9 rounded-xl" />
                      <div className="flex-1 space-y-2">
                        <Shimmer className="h-3 w-1/2 rounded-full" />
                        <Shimmer className="h-3 w-1/3 rounded-full" />
                      </div>
                    </div>
                  ))}
                </ListGroup>
              ) : (
                <ListGroup>
                  {oneTime.map((s) => {
                    const Icon = SERVICE_ICON[s.slug] ?? Droplets;
                    const allowed = isServiceAllowed(s.slug, a);
                    return (
                      <ListRow
                        key={s.id}
                        icon={Icon}
                        title={s.name}
                        subtitle={s.description}
                        disabled={!allowed}
                        to={allowed ? "/c/service/$slug" : undefined}
                        params={{ slug: s.slug }}
                        trailing={
                          allowed ? (
                            <span className="shrink-0 text-[15px] font-bold">₹{priceFor(s)}</span>
                          ) : (
                            <StatusChip tone="warning">Soon</StatusChip>
                          )
                        }
                      />
                    );
                  })}
                </ListGroup>
              )}
            </Section>
          )}

          {/* Trust strip */}
          <div className="mt-6 flex items-center justify-center gap-4 text-[11.5px] text-muted-foreground">
            <TrustChip>Vetted partners</TrustChip>
            <TrustChip>Photo proof</TrustChip>
            <TrustChip>Doorstep</TrustChip>
          </div>
        </>
      )}

      {/* Vehicle switcher sheet */}
      <Dialog open={vehicleSheetOpen} onOpenChange={setVehicleSheetOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Your vehicles</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {vehicles.map((v) => {
              const isActive = v.id === activeVehicle?.id;
              return (
                <button
                  key={v.id}
                  onClick={() => pickVehicle(v.id)}
                  className={`uw-pressable flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left ${
                    isActive ? "border-primary bg-primary/[0.06]" : "border-border/70"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">
                      {v.make} {v.model}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                      {v.registration_number} · {vehicleBodyLabel(v.make, v.model, v.category)}
                    </span>
                  </span>
                  {isActive && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              );
            })}
            <Button asChild variant="outline" className="w-full rounded-full">
              <Link to="/c/vehicles/add">
                <Plus className="mr-1 h-4 w-4" /> Add vehicle
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
    </PullToRefresh>
  );
}

function TrustChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Check className="h-3.5 w-3.5 text-success" />
      {children}
    </span>
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
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-primary">
        <MapPin className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-[20px] font-bold tracking-tight">We're not here yet</h2>
      <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
        Urban Wash is expanding fast. We'll let you know the moment we start serving your area.
      </p>
      <Button onClick={notify} size="lg" className="mt-6 h-11 rounded-full px-8 font-semibold">
        <BellRing className="mr-2 h-4 w-4" /> Notify me
      </Button>
      <button
        onClick={() => {
          try { localStorage.removeItem("uw_customer_area"); } catch {}
          if (typeof window !== "undefined") window.location.href = "/c?change=1";
        }}
        className="mt-4 text-[13px] font-semibold text-primary"
      >
        Change location
      </button>
    </div>
  );
}
