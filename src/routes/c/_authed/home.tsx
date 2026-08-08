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
  }, []);

  const vehiclesQ = useQuery({
    queryKey: ["customer-vehicles"],
    queryFn: async (): Promise<Vehicle[]> => {
      const { data, error } = await supabase.from("customer_vehicles").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as Vehicle[];
    },
  });

  const servicesQ = useQuery({
    queryKey: ["service-catalog"],
    queryFn: async (): Promise<Service[]> => {
      const { data, error } = await supabase.from("service_catalog").select("*").eq("active", true).order("sort_order");
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
      const { data } = await (supabase as any).from("customer_profiles").select("full_name").eq("user_id", u.user.id).maybeSingle();
      return (data?.full_name as string | undefined) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const unreadQ = useQuery({
    queryKey: ["customer-notifications-unread"],
    queryFn: async (): Promise<number> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return 0;
      const { count } = await supabase.from("customer_notifications").select("id", { count: "exact", head: true }).is("read_at", null);
      return count ?? 0;
    },
    refetchInterval: 60000,
  });

  const subStatusQ = useQuery({
    queryKey: ["customer-subscription-status", selectedVehicleId],
    queryFn: async (): Promise<string | null> => {
      const { data } = await (supabase as any).from("subscriptions").select("status,vehicle_id,created_at").order("created_at", { ascending: false }).limit(20);
      const rows = (data ?? []) as Array<{ status: string; vehicle_id: string | null }>;
      if (rows.length === 0) return null;
      const mine = selectedVehicleId ? rows.filter((r) => r.vehicle_id === selectedVehicleId) : rows;
      const pick = mine.find((r) => r.status === "active") ?? mine.find((r) => r.status === "payment_pending") ?? mine[0];
      return pick?.status ?? null;
    },
  });

  const vehicles = vehiclesQ.data ?? [];
  const activeVehicle = vehicles.find((v) => v.id === selectedVehicleId) ?? vehicles[0];
  const category = activeVehicle?.category ?? "hatchback_compact_sedan";
  const bodyLabel = activeVehicle ? vehicleBodyLabel(activeVehicle.make, activeVehicle.model, activeVehicle.category) : "";

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

  const priceFor = (s: Service) => category === "sedan_suv" ? s.price_sedan_suv : s.price_hatchback;
  const services = servicesQ.data ?? [];
  const subscription = services.find((s) => s.service_type === "subscription");
  const oneTime = services.filter((s) => s.service_type !== "subscription" && !PLAN_INCLUDED_SERVICE_SLUGS.includes(s.slug));

  const availability = useAreaAvailability();
  const a = availability.data;
  const showCatalog = !area || (a && (a.daily_shine || a.premium));

  const firstName = (profileQ.data ?? "").trim().split(/\s+/)[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const unread = unreadQ.data ?? 0;
  const subStatus = subStatusQ.data;
  const planActive = subStatus === "active";
  const planPending = subStatus === "payment_pending";

  const refreshAll = () => Promise.all([vehiclesQ.refetch(), servicesQ.refetch(), subStatusQ.refetch(), unreadQ.refetch()]);

  return (
    <PullToRefresh onRefresh={refreshAll}>
      <div className="min-h-screen bg-[#FFF9F3] pb-24">
        <div className="sticky top-0 z-20 bg-[#FFF9F3]/95 px-5 pt-6 pb-4 backdrop-blur">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-muted-foreground">{greeting},</p>
              {profileQ.isLoading ? <Shimmer className="mt-1 h-7 w-32 rounded-lg" /> : <h1 className="truncate text-[24px] font-black tracking-tight text-[#1a1a1a]">{firstName}</h1>}
              <button
                onClick={() => { try { localStorage.removeItem("uw_customer_area"); } catch {} if (typeof window !== "undefined") window.location.href = "/c?change=1"; }}
                className="mt-1.5 flex items-center gap-1 text-[13px] font-bold text-primary transition-opacity active:opacity-60"
              >
                <MapPin className="h-3.5 w-3.5" />
                <span className="truncate max-w-[150px]">{area || "Set location"}</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <Link to="/c/notifications" className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white shadow-sm border border-black/5 transition-transform active:scale-95">
              <Bell className="h-5 w-5 text-[#1a1a1a]" />
              {unread > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-black text-white ring-2 ring-[#FFF9F3]">{unread > 9 ? "9+" : unread}</span>}
            </Link>
          </div>
        </div>

        <div className="px-5 space-y-6">
          <Section title={<span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60">Your active car</span>} className="mt-2">
            {vehiclesQ.isLoading ? <SkeletonCard className="h-28" /> : activeVehicle ? (
              <Surface className="overflow-hidden p-0 bg-white border-primary/10">
                <button type="button" onClick={() => (vehicles.length > 1 ? setVehicleSheetOpen(true) : setEditOpen(true))} className="uw-pressable flex w-full items-center gap-4 p-4 text-left">
                  <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-[#F8F9FB]">
                    <VehicleAvatar imageUrl={catalogImageQ.data} make={activeVehicle.make} model={activeVehicle.model} color={activeVehicle.color} className="h-full w-full object-contain p-1" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[17px] font-black tracking-tight text-[#1a1a1a]">{activeVehicle.make} {activeVehicle.model}</h2>
                    <p className="mt-0.5 truncate text-[12px] font-bold text-muted-foreground/70 uppercase tracking-tight">{activeVehicle.registration_number} · {bodyLabel}</p>
                  </div>
                  {vehicles.length > 1 && <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary"><ChevronDown className="h-4 w-4" /></div>}
                </button>
                <div className="flex items-center justify-between border-t border-border/40 bg-[#F9FAFB]/50 px-4 py-3">
                  <button onClick={() => setEditOpen(true)} className="text-[13px] font-black text-[#1a1a1a] flex items-center gap-1.5"><Pencil className="h-3.5 w-3.5 text-primary" /> Details</button>
                  <Link to="/c/vehicles/add" className="text-[13px] font-black text-primary flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> New car</Link>
                </div>
              </Surface>
            ) : (
              <Link to="/c/vehicles/add" className="uw-pressable flex items-center gap-4 rounded-[24px] border border-dashed border-primary/30 bg-primary/5 p-5 transition-all active:scale-[0.98]">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20"><Plus className="h-6 w-6" /></div>
                <div><span className="block text-[16px] font-black text-[#1a1a1a]">Add your car</span><span className="mt-0.5 block text-[12px] font-medium text-muted-foreground">Prices vary by vehicle size</span></div>
              </Link>
            )}
          </Section>

          {!showCatalog ? (
            <div className="mt-8"><ComingSoon area={area} onChange={() => navigate({ to: "/c" })} /></div>
          ) : (
            <>
              {planActive || planPending ? (
                <Link to="/c/subscriptions" className="block">
                  <Surface className={`relative overflow-hidden border-2 bg-white transition-all active:scale-[0.98] ${planPending ? "border-warning/30" : "border-success/20"}`}>
                    <div className={`absolute -right-6 -top-6 h-20 w-20 rounded-full blur-3xl ${planPending ? "bg-warning/10" : "bg-success/10"}`} />
                    <div className="flex items-center gap-4">
                      <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${planPending ? "bg-warning/10 text-warning-foreground" : "bg-success/10 text-success"}`}><Sparkles className="h-6 w-6" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-[16px] font-black text-[#1a1a1a]">Daily Shine</h3>
                          {planPending ? <StatusChip tone="warning" className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5">Pending</StatusChip> : <StatusChip tone="success" className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5">Active</StatusChip>}
                        </div>
                        <p className="mt-0.5 truncate text-[12px] font-medium text-muted-foreground">{planPending ? "Payment required to activate" : "Everything looks great for today"}</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground/40" />
                    </div>
                  </Surface>
                </Link>
              ) : subscription && (a?.daily_shine) ? (
                <Link to="/c/service/$slug" params={{ slug: subscription.slug }} className="block">
                  <Surface className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-[#FFF5ED] to-white p-5 shadow-sm transition-all active:scale-[0.98]">
                    <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/5 blur-2xl" />
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <span className="inline-flex h-6 items-center rounded-full bg-primary/10 px-2.5 text-[10px] font-black uppercase tracking-widest text-primary">✨ Recommended</span>
                        <h3 className="mt-3 text-[20px] font-black tracking-tight text-[#1a1a1a]">Keep it clean, daily.</h3>
                        <p className="mt-1 text-[13px] font-medium leading-relaxed text-muted-foreground/80">Exterior cleaning every morning + monthly deep interior.</p>
                      </div>
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-sm"><Sparkles className="h-5 w-5 text-primary" /></div>
                    </div>
                    <div className="mt-5 flex items-center justify-between border-t border-primary/5 pt-4">
                      <div><span className="text-[22px] font-black text-[#1a1a1a]">₹{priceFor(subscription)}</span><span className="ml-1 text-[12px] font-bold text-muted-foreground/60">/month</span></div>
                      <span className="inline-flex h-10 items-center rounded-full bg-primary px-6 text-[13px] font-black text-white shadow-lg shadow-primary/20">Get Daily Shine</span>
                    </div>
                  </Surface>
                </Link>
              ) : null}

              {oneTime.length > 0 && (
                <Section title={<span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60">One-time services</span>} action={bodyLabel && <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/40">Prices for {bodyLabel}</span>}>
                  {servicesQ.isLoading ? <div className="space-y-3">{[1, 2, 3].map(i => <SkeletonCard key={i} className="h-20" />)}</div> : (
                    <ListGroup className="border-black/5 bg-white shadow-none">
                      {oneTime.map((s) => {
                        const Icon = SERVICE_ICON[s.slug] ?? Droplets;
                        const allowed = isServiceAllowed(s.slug, a);
                        return <ListRow key={s.id} icon={Icon} title={s.name} subtitle={s.description} disabled={!allowed} to={allowed ? "/c/service/$slug" : undefined} params={{ slug: s.slug }} className="active:bg-[#F9FAFB] py-4" trailing={allowed ? <span className="shrink-0 text-[15px] font-black text-[#1a1a1a]">₹{priceFor(s)}</span> : <StatusChip tone="warning" className="text-[9px] font-black uppercase px-2">Soon</StatusChip>} />;
                      })}
                    </ListGroup>
                  )}
                </Section>
              )}

              <div className="py-4 flex items-center justify-center gap-6">
                <TrustItem label="Expert Care" />
                <div className="h-1 w-1 rounded-full bg-muted-foreground/20" />
                <TrustItem label="Photo Proof" />
                <div className="h-1 w-1 rounded-full bg-muted-foreground/20" />
                <TrustItem label="Safe & Secure" />
              </div>
            </>
          )}
        </div>

        <Dialog open={vehicleSheetOpen} onOpenChange={setVehicleSheetOpen}>
          <DialogContent className="max-w-md rounded-3xl">
            <DialogHeader><DialogTitle>Your vehicles</DialogTitle></DialogHeader>
            <div className="space-y-2">
              {vehicles.map((v) => {
                const isActive = v.id === activeVehicle?.id;
                return (
                  <button key={v.id} onClick={() => pickVehicle(v.id)} className={`uw-pressable flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left ${isActive ? "border-primary bg-primary/[0.06]" : "border-border/70"}`}>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold">{v.make} {v.model}</span><span className="mt-0.5 block text-[12.5px] text-muted-foreground">{v.registration_number} · {vehicleBodyLabel(v.make, v.model, v.category)}</span></span>
                    {isActive && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
              <Button asChild variant="outline" className="w-full rounded-full"><Link to="/c/vehicles/add"><Plus className="mr-1 h-4 w-4" /> Add vehicle</Link></Button>
            </div>
          </DialogContent>
        </Dialog>

        <EditVehicleDialog vehicle={(activeVehicle ?? null) as any} open={editOpen} onOpenChange={setEditOpen} />
        <ChangePhotoDialog vehicle={(activeVehicle ?? null) as any} open={photoOpen} onOpenChange={setPhotoOpen} />
      </div>
    </PullToRefresh>
  );
}

function TrustItem({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="grid h-4 w-4 place-items-center rounded-full bg-success/10"><Check className="h-2.5 w-2.5 text-success" /></div>
      <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">{label}</span>
    </div>
  );
}

function ComingSoon({ area, onChange: _onChange }: { area: string; onChange: () => void }) {
  const notify = async () => {
    try {
      const { data: u } = await supabase.auth.getUser();
      let geo: any = {}; try { geo = JSON.parse(localStorage.getItem("uw_customer_geo") ?? "{}"); } catch {}
      await (supabase as any).from("expansion_requests").insert({ customer_id: u.user?.id ?? null, phone: u.user?.phone ?? "", area_name: area, pincode: geo.pincode ?? null, lat: geo.lat ?? null, lng: geo.lng ?? null, interested_service: "general" });
      toast.success("We'll notify you when we launch in your area!");
    } catch { toast.error("Could not save. Try again."); }
  };
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-primary"><MapPin className="h-6 w-6" /></span>
      <h2 className="mt-4 text-[20px] font-bold tracking-tight">We're not here yet</h2>
      <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">Urban Wash is expanding fast. We'll let you know the moment we start serving your area.</p>
      <Button onClick={notify} size="lg" className="mt-6 h-11 rounded-full px-8 font-semibold"><BellRing className="mr-2 h-4 w-4" /> Notify me</Button>
      <button onClick={() => { try { localStorage.removeItem("uw_customer_area"); } catch {} if (typeof window !== "undefined") window.location.href = "/c?change=1"; }} className="mt-4 text-[13px] font-semibold text-primary">Change location</button>
    </div>
  );
}
