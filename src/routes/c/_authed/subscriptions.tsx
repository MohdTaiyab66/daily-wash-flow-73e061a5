import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Calendar, Pause, Sparkles, CheckCircle2, Clock, Plus, RefreshCw, Droplets, Wrench, CalendarPlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { RecentServiceFeed } from "@/components/customer/RecentServiceFeed";

export const Route = createFileRoute("/c/_authed/subscriptions")({
  ssr: false,
  head: () => ({ meta: [{ title: "My Plan — Urban Wash" }] }),
  component: MyPlanPage,
});

type Booking = {
  id: string;
  scheduled_date: string;
  status: string;
  payment_status: string;
  total_amount: number;
  base_amount: number;
  addon_amount: number;
  service_id: string;
  service_catalog: { name: string; service_type: string; slug: string } | null;
};

type AddonRow = {
  id: string;
  booking_id: string;
  addon_name: string;
  price: number;
  created_at: string;
};

function MyPlanPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleKind, setScheduleKind] = useState<"any" | "interior" | "exterior" | "dusting">("any");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const openSchedule = (kind: "any" | "interior" | "exterior" | "dusting" = "any") => {
    setScheduleKind(kind);
    setScheduleOpen(true);
  };


  const bookingsQ = useQuery({
    queryKey: ["customer-bookings-all", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Booking[]> => {
      const { data, error } = await (supabase as any)
        .from("bookings")
        .select("id, scheduled_date, status, payment_status, total_amount, base_amount, addon_amount, service_id, service_catalog:service_id(name, service_type, slug)")
        .order("scheduled_date", { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data ?? []) as Booking[];
    },
  });

  const all = bookingsQ.data ?? [];
  const subs = all.filter((b) => b.service_catalog?.service_type === "subscription");
  const realSub = subs.find(
    (s) => s.status !== "cancelled" && s.status !== "expired" && new Date(s.scheduled_date) <= new Date(),
  ) ?? subs[0];

  // Demo subscription shown when the customer has no active plan yet,
  // so they get a feel for how Daily Shine tracking will look.
  const isDemo = !realSub;
  const demoStart = new Date(Date.now() - 12 * 86400000);
  const activeSub: (Booking & { _demo?: boolean }) | undefined = realSub ?? {
    id: "demo",
    scheduled_date: demoStart.toISOString().slice(0, 10),
    status: "active",
    payment_status: "cash_on_service",
    total_amount: 1499,
    base_amount: 1499,
    addon_amount: 0,
    service_id: "demo",
    service_catalog: { name: "Daily Shine — Exterior + 4× Interior", service_type: "subscription", slug: "daily-shine" },
    _demo: true,
  };

  // Plan period: Daily Shine = 24 working days (no service on Mondays).
  const planStart = activeSub ? new Date(activeSub.scheduled_date) : null;
  // 24 working days ≈ 28 calendar days (one Monday skipped per week).
  const totalDays = 24;
  const planEnd = planStart ? new Date(planStart.getTime() + 28 * 24 * 60 * 60 * 1000) : null;
  const today = new Date();
  const elapsed = planStart ? Math.max(0, Math.min(totalDays, Math.floor((today.getTime() - planStart.getTime()) / 86400000))) : 0;
  const daysLeft = planEnd ? Math.max(0, Math.ceil((planEnd.getTime() - today.getTime()) / 86400000)) : 0;
  const expiringSoon = daysLeft > 0 && daysLeft <= 7;

  // Wash status — track interior + exterior for current sub
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const interiorReal = all.filter(
    (b) =>
      (b.service_catalog?.slug?.includes("interior") || b.service_catalog?.slug?.includes("deep")) &&
      new Date(b.scheduled_date) >= monthStart &&
      b.status === "completed",
  );
  const exteriorReal = all.filter(
    (b) =>
      (b.service_catalog?.slug?.includes("exterior") || b.service_catalog?.slug?.includes("basic") || b.service_catalog?.slug?.includes("daily")) &&
      new Date(b.scheduled_date) >= monthStart &&
      b.status === "completed",
  );
  const interiorCount = isDemo ? 2 : interiorReal.length;
  const exteriorCount = isDemo ? 12 : exteriorReal.length;
  const interiorLast = isDemo ? new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10) : interiorReal[0]?.scheduled_date;
  const exteriorLast = isDemo ? new Date(Date.now() - 86400000).toISOString().slice(0, 10) : exteriorReal[0]?.scheduled_date;

  const addonsQ = useQuery({
    queryKey: ["customer-addons", subs.map((s) => s.id).join(",")],
    enabled: subs.length > 0,
    queryFn: async (): Promise<AddonRow[]> => {
      const ids = subs.map((s) => s.id);
      const { data, error } = await (supabase as any)
        .from("booking_addons")
        .select("id, booking_id, addon_name, price, created_at")
        .in("booking_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AddonRow[];
    },
  });

  const recent = all.slice(0, 8);
  const completedCount = all.filter((b) => b.status === "completed").length;
  const pendingCount = all.filter((b) => b.status === "pending" || b.status === "scheduled").length;

  return (
    <div className="px-5 pt-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Plan</h1>
          <p className="mt-1 text-xs text-muted-foreground">Track your Daily Shine service.</p>
        </div>
        <Sparkles className="h-6 w-6 text-primary" />
      </div>

      {bookingsQ.isLoading && (
        <div className="mt-6 space-y-3">
          <div className="h-32 animate-pulse rounded-3xl bg-muted" />
          <div className="h-24 animate-pulse rounded-2xl bg-muted" />
        </div>
      )}

      {!bookingsQ.isLoading && !activeSub && (
        <div className="mt-8 flex flex-col items-center rounded-3xl border border-dashed border-border p-10 text-center">
          <Sparkles className="h-10 w-10 text-muted-foreground" />
          <h3 className="mt-3 text-base font-semibold">No active plan</h3>
          <p className="mt-1 text-xs text-muted-foreground">Subscribe to Daily Shine to enjoy daily car care.</p>
          <Button asChild className="mt-5 rounded-full">
            <Link to="/c/home">Browse plans</Link>
          </Button>
        </div>
      )}

      {activeSub && (
        <>
          {isDemo && (
            <div className="mt-5 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-[11px] text-primary">
              <span className="font-semibold">Demo preview · </span>
              Subscribe to Daily Shine to start tracking your real services here.
            </div>
          )}
          {/* Active plan hero */}
          <div className="mt-5 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-accent/40 to-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-primary">{isDemo ? "Demo plan" : "Active plan"}</p>
                <h2 className="mt-0.5 truncate text-xl font-semibold">{activeSub.service_catalog?.name ?? "Daily Shine"}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Started {planStart?.toLocaleDateString()} · Renews {planEnd?.toLocaleDateString()}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-medium capitalize text-success">
                {activeSub.status.replaceAll("_", " ")}
              </span>
            </div>

            {/* Progress */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Day {elapsed} of {totalDays}</span>
                <span className={expiringSoon ? "font-semibold text-primary" : ""}>
                  {daysLeft} day{daysLeft === 1 ? "" : "s"} left
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all"
                  style={{ width: `${(elapsed / totalDays) * 100}%` }}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm font-semibold">₹{activeSub.total_amount}/mo</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" disabled={isDemo}>
                  <Pause className="h-3.5 w-3.5" /> Pause
                </Button>
                {(expiringSoon || isDemo) && (
                  <Button asChild={isDemo} size="sm" className="h-8 gap-1 rounded-full text-xs">
                    {isDemo ? (
                      <Link to="/c/home"><RefreshCw className="h-3.5 w-3.5" /> Subscribe</Link>
                    ) : (
                      <><RefreshCw className="h-3.5 w-3.5" /> Renew</>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* This month's washes */}
          <div className="mt-5">
            <h3 className="text-sm font-semibold tracking-tight">This month</h3>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <WashCard
                title="Interior wash"
                icon={Wrench}
                count={interiorCount}
                target={4}
                lastDate={interiorLast}
              />
              <WashCard
                title="Exterior wash"
                icon={Droplets}
                count={exteriorCount}
                target={20}
                lastDate={exteriorLast}
              />
            </div>
          </div>

          {/* Schedule a wash */}
          <div className="mt-5 rounded-3xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold tracking-tight">Schedule your wash</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Pick interior, exterior or both — partner arrives in your slot.
                </p>
              </div>
              <CalendarPlus className="h-5 w-5 shrink-0 text-primary" />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              <button
                onClick={() => openSchedule("exterior")}
                className="rounded-xl border border-border bg-card p-2.5 text-left transition-colors hover:border-primary/40"
              >
                <Droplets className="h-4 w-4 text-primary" />
                <div className="mt-1.5 text-[11px] font-semibold">Exterior</div>
                <div className="text-[10px] text-muted-foreground">Quick rinse</div>
              </button>
              <button
                onClick={() => openSchedule("interior")}
                className="rounded-xl border border-border bg-card p-2.5 text-left transition-colors hover:border-primary/40"
              >
                <Wrench className="h-4 w-4 text-primary" />
                <div className="mt-1.5 text-[11px] font-semibold">Interior</div>
                <div className="text-[10px] text-muted-foreground">Vacuum & wipe</div>
              </button>
              <button
                onClick={() => openSchedule("dusting")}
                className="rounded-xl border border-border bg-card p-2.5 text-left transition-colors hover:border-primary/40"
              >
                <Sparkles className="h-4 w-4 text-primary" />
                <div className="mt-1.5 text-[11px] font-semibold">Dusting</div>
                <div className="text-[10px] text-muted-foreground">Daily touch-up</div>
              </button>
              <button
                onClick={() => openSchedule("any")}
                className="rounded-xl border border-primary bg-primary/10 p-2.5 text-left"
              >
                <Sparkles className="h-4 w-4 text-primary" />
                <div className="mt-1.5 text-[11px] font-semibold">Custom</div>
                <div className="text-[10px] text-muted-foreground">Choose service</div>
              </button>
            </div>
          </div>

          {/* Recent service feed with photos + complaint window */}
          <RecentServiceFeed userId={userId} demo={isDemo} />

          {/* Counters */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatCard icon={CheckCircle2} label="Completed" value={isDemo ? 14 : completedCount} tone="success" />
            <StatCard icon={Clock} label="Upcoming" value={isDemo ? 2 : pendingCount} tone="primary" />
          </div>



          {/* Add-ons */}
          <div className="mt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-tight">Available add-ons</h3>
              <Link to="/c/service/$slug" params={{ slug: "daily-shine" }} className="inline-flex items-center gap-1 text-xs text-primary">
                <Plus className="h-3.5 w-3.5" /> Add all
              </Link>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <RecommendedAddon name="Exterior Polish" price={49} icon={Sparkles} />
              <RecommendedAddon name="Dusting" price={25} icon={Droplets} />
              <RecommendedAddon name="Extra Interior" price={149} icon={Wrench} />
              <RecommendedAddon name="Extra Exterior" price={149} icon={Droplets} />
            </div>
            {(addonsQ.data ?? []).length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Your purchased add-ons
                </div>
                {(addonsQ.data ?? []).map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm">
                    <span className="font-medium">{a.addon_name}</span>
                    <span className="text-xs text-muted-foreground">₹{a.price}</span>
                  </div>
                ))}
              </div>
            )}
          </div>


          {/* Recent services */}
          <div className="mt-5">
            <h3 className="text-sm font-semibold tracking-tight">Recent services</h3>
            <div className="mt-2 space-y-2">
              {recent.length === 0 && (
                <p className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  No services yet.
                </p>
              )}
              {recent.map((b) => (
                <Link
                  key={b.id}
                  to="/c/bookings/$id"
                  params={{ id: b.id }}
                  className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{b.service_catalog?.name ?? "Service"}</div>
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Calendar className="h-3 w-3" /> {b.scheduled_date}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                      b.status === "completed"
                        ? "bg-success/15 text-success"
                        : b.status === "cancelled"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-primary/10 text-primary"
                    }`}
                  >
                    {b.status.replaceAll("_", " ")}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      <ScheduleWashDialog open={scheduleOpen} onOpenChange={setScheduleOpen} userId={userId} kind={scheduleKind} />
    </div>
  );
}

const SLOT_OPTIONS = ["Before 7 AM", "Before 8 AM", "Before 9 AM", "Before 10 AM", "Before 11 AM", "Before 12 PM"];

type SvcOpt = { id: string; slug: string; name: string; price_hatchback: number; price_sedan_suv: number; service_type: string };
type VehOpt = { id: string; make: string; model: string; category: string; registration_number: string; is_default: boolean | null };
type AddrOpt = { id: string; label: string; address_line: string; area: string; is_default: boolean | null };

const PLAN_SERVICE_SLUGS: Record<"interior" | "exterior" | "dusting", string> = {
  interior: "daily-shine-interior",
  exterior: "daily-shine-exterior",
  dusting: "daily-shine-dusting",
};

const PLAN_SERVICE_LABELS: Record<"interior" | "exterior" | "dusting", string> = {
  interior: "Interior wash",
  exterior: "Exterior wash",
  dusting: "Dusting",
};

function ScheduleWashDialog({
  open,
  onOpenChange,
  userId,
  kind = "any",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string | null;
  kind?: "any" | "interior" | "exterior" | "dusting";
}) {

  const qc = useQueryClient();
  const navigate = useNavigate();
  const [serviceId, setServiceId] = useState<string>("");
  const [vehicleId, setVehicleId] = useState<string>("");
  const [addressId, setAddressId] = useState<string>("");
  const [date, setDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [slot, setSlot] = useState<string>(SLOT_OPTIONS[3]);
  const [saving, setSaving] = useState(false);

  const svcQ = useQuery({
    queryKey: ["schedule-services"],
    enabled: open,
    queryFn: async (): Promise<SvcOpt[]> => {
      const { data } = await (supabase as any)
        .from("service_catalog")
        .select("id, slug, name, price_hatchback, price_sedan_suv, service_type")
        .eq("active", true)
        .order("sort_order");
      return (data ?? []) as SvcOpt[];
    },
  });
  const vehQ = useQuery({
    queryKey: ["schedule-vehicles"],
    enabled: open,
    queryFn: async (): Promise<VehOpt[]> => {
      const { data } = await (supabase as any)
        .from("customer_vehicles")
        .select("id, make, model, category, registration_number, is_default")
        .order("created_at");
      return (data ?? []) as VehOpt[];
    },
  });
  const addrQ = useQuery({
    queryKey: ["schedule-addresses"],
    enabled: open,
    queryFn: async (): Promise<AddrOpt[]> => {
      const { data } = await (supabase as any)
        .from("customer_addresses")
        .select("id, label, address_line, area, is_default")
        .order("created_at");
      return (data ?? []) as AddrOpt[];
    },
  });

  useEffect(() => {
    if (!open) return;
    if (svcQ.data?.length) {
      let preferred: SvcOpt | undefined;
      if (kind !== "any") {
        preferred = svcQ.data.find((s) => s.slug === PLAN_SERVICE_SLUGS[kind]);
      }
      if (!preferred) {
        preferred = svcQ.data.find((s) => s.slug.includes("one-time") || s.slug.includes("one_time")) ?? svcQ.data[0];
      }
      setServiceId(preferred.id);
    }
    if (vehQ.data?.length) {
      const stored = localStorage.getItem("uw_customer_vehicle");
      const nextVehicleId =
        stored && vehQ.data.some((v) => v.id === stored)
          ? stored
          : (vehQ.data.find((v) => v.is_default)?.id ?? vehQ.data[0].id);
      if (!vehicleId || !vehQ.data.some((v) => v.id === vehicleId)) {
        setVehicleId(nextVehicleId);
        localStorage.setItem("uw_customer_vehicle", nextVehicleId);
      }
    }
    if (!addressId && addrQ.data?.length) {
      const def = addrQ.data.find((a) => a.is_default) ?? addrQ.data[0];
      setAddressId(def.id);
    }
  }, [open, kind, svcQ.data, vehQ.data, addrQ.data, vehicleId, addressId]);


  const service = svcQ.data?.find((s) => s.id === serviceId);
  const vehicle = vehQ.data?.find((v) => v.id === vehicleId);
  const planServices = useMemo(
    () => (svcQ.data ?? []).filter((s) => Object.values(PLAN_SERVICE_SLUGS).includes(s.slug)),
    [svcQ.data],
  );
  const customServices = useMemo(
    () => (svcQ.data ?? []).filter((s) => !Object.values(PLAN_SERVICE_SLUGS).includes(s.slug) && s.service_type !== "subscription"),
    [svcQ.data],
  );
  const serviceOptions = kind === "any" ? customServices : planServices;
  const isSUV = vehicle?.category === "sedan_suv";
  const price = useMemo(() => {
    if (!service) return 0;
    return Number(isSUV ? service.price_sedan_suv : service.price_hatchback);
  }, [service, isSUV]);

  const confirm = async () => {
    if (!userId) { toast.error("Please sign in again"); return; }
    if (!service) { toast.error(kind === "any" ? "Pick a service" : "This plan service is not available yet"); return; }
    if (!vehicle) { toast.error("Please select one of your vehicles"); return; }
    if (!addressId) { toast.error("Add a service address first"); return; }
    setSaving(true);
    try {
      const { data: bookingId, error } = await (supabase as any).rpc("confirm_customer_booking", {
        p_service_id: service.id,
        p_vehicle_id: vehicle.id,
        p_address_id: addressId,
        p_scheduled_date: date,
        p_scheduled_time: slot,
        p_notes: "Scheduled from My Plan",
        p_coupon_code: null,
        p_addons: [],
      });
      if (error) throw error;
      toast.success(`Scheduled for ${date} · ${slot}`);
      qc.invalidateQueries({ queryKey: ["customer-bookings-all"] });
      qc.invalidateQueries({ queryKey: ["customer-bookings"] });
      onOpenChange(false);
      navigate({ to: "/c/bookings/$id", params: { id: bookingId } });
    } catch (err: any) {
      toast.error(err?.message || "Could not schedule");
    } finally {
      setSaving(false);
    }
  };

  const noVehicles = !vehQ.isLoading && (vehQ.data?.length ?? 0) === 0;
  const noAddresses = !addrQ.isLoading && (addrQ.data?.length ?? 0) === 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule a wash</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {(noVehicles || noAddresses) && (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-xs">
              {noVehicles && (
                <div className="flex items-center justify-between gap-2">
                  <span>Add a vehicle to schedule.</span>
                  <Button asChild size="sm" variant="outline"><Link to="/c/vehicles/add">Add vehicle</Link></Button>
                </div>
              )}
              {noAddresses && !noVehicles && (
                <div className="flex items-center justify-between gap-2">
                  <span>Add a service address to schedule.</span>
                  <Button asChild size="sm" variant="outline"><Link to="/c/profile">Add address</Link></Button>
                </div>
              )}
            </div>
          )}

          <div>
            <Label className="text-xs">Service</Label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              disabled={kind !== "any"}
              className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
            >
              {serviceOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {Number(isSUV ? s.price_sedan_suv : s.price_hatchback) === 0 ? "Included" : `₹${isSUV ? s.price_sedan_suv : s.price_hatchback}`}
                </option>
              ))}
            </select>
            {kind !== "any" && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Scheduling your unused {PLAN_SERVICE_LABELS[kind]} from Daily Shine. Use Custom for extra paid services.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Vehicle</Label>
              <select
                value={vehicleId}
                onChange={(e) => {
                  setVehicleId(e.target.value);
                  localStorage.setItem("uw_customer_vehicle", e.target.value);
                }}
                disabled={noVehicles}
                className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
              >
                {(vehQ.data ?? []).map((v) => (
                  <option key={v.id} value={v.id}>{v.make} {v.model} · {v.registration_number}</option>
                ))}
              </select>
              {(vehQ.data?.length ?? 0) > 1 && (
                <p className="mt-1 text-[11px] text-muted-foreground">Choose which subscribed car this wash is for.</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <select
                value={addressId}
                onChange={(e) => setAddressId(e.target.value)}
                disabled={noAddresses}
                className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
              >
                {(addrQ.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.label || "Address"} · {a.area}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
          </div>

          <div>
            <Label className="text-xs">Time slot</Label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {SLOT_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlot(s)}
                  className={`rounded-xl border py-2 text-[11px] font-medium transition-colors ${
                    slot === s ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-baseline justify-between rounded-xl bg-accent/40 px-3 py-2">
            <span className="text-xs text-muted-foreground">Total · {price === 0 ? "included in plan" : "pay after service"}</span>
            <span className="text-base font-semibold">{price === 0 ? "Included" : `₹${price}`}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={saving || noVehicles || noAddresses}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirm booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WashCard({
  title,
  icon: Icon,
  count,
  target,
  lastDate,
}: {
  title: string;
  icon: any;
  count: number;
  target: number;
  lastDate?: string;
}) {
  const done = count >= target;
  const pct = Math.min(100, (count / target) * 100);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <Icon className={`h-4 w-4 ${done ? "text-success" : "text-primary"}`} />
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            done ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
          }`}
        >
          {done ? "Done" : "Pending"}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold">{title}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {count} / {target} this month
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      {lastDate && <p className="mt-2 text-[10px] text-muted-foreground">Last: {lastDate}</p>}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: number;
  tone: "success" | "primary";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${tone === "success" ? "text-success" : "text-primary"}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function RecommendedAddon({ name, price, icon: Icon }: { name: string; price: number; icon: any }) {
  return (
    <Link
      to="/c/service/$slug"
      params={{ slug: "daily-shine" }}
      className="group flex items-center gap-2.5 rounded-2xl border border-border bg-card p-3 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-semibold">{name}</div>
        <div className="text-[10px] text-muted-foreground">₹{price} each</div>
      </div>
      <Plus className="h-3.5 w-3.5 shrink-0 text-primary transition-transform group-hover:scale-110" />
    </Link>
  );
}
