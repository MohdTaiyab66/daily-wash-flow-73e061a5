import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Calendar, Pause, Sparkles, CheckCircle2, Clock, Plus, RefreshCw, Droplets, Wrench, CalendarPlus, Loader2, BellRing, ShieldAlert, Car, Settings2, XCircle, Undo2, ChevronRight } from "lucide-react";
import { ListGroup, ListRow, Section, StatusChip, Surface } from "@/components/customer/ui/kit";
import { supabase } from "@/integrations/supabase/client";
import { SkeletonCard, SkeletonRow, Shimmer } from "@/components/customer/ui/Skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { RecentServiceFeed } from "@/components/customer/RecentServiceFeed";
import { AwaitingPartnerBanner } from "@/components/customer/AwaitingPartnerBanner";
import { VehicleSelector, useSelectedVehicleId, type SelectorVehicle } from "@/components/customer/VehicleSelector";
import { PlanInclusionsCard } from "@/components/customer/PlanInclusionsCard";
import { PlanBalanceCard } from "@/components/customer/PlanBalanceCard";
import { NoSubscriptionState } from "@/components/customer/NoSubscriptionState";
import { CancelPlanDialog } from "@/components/customer/CancelPlanDialog";
import { BookAWashSheet } from "@/components/customer/BookAWashSheet";
import { MonthlyAddonsSection } from "@/components/customer/MonthlyAddonsSection";
import { PackageBuilderSheet } from "@/components/customer/PackageBuilderSheet";
import { SavedPackagesCard } from "@/components/customer/SavedPackagesCard";
import { traceVehicle } from "@/lib/vehicle-trace";
import { INCLUDED_PLAN_MESSAGE, exhaustedEntitlementMessage, normalizeBookingPreview } from "@/lib/entitlements";
import { Meter } from "@/components/customer/ui/kit";
import { getActiveSubscriptionForVehicle, undoCancellation } from "@/lib/subscription-cancel.functions";

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
  vehicle_id: string | null;
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
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleKind, setScheduleKind] = useState<"any" | "interior" | "exterior" | "dusting">("any");
  const [bookOpen, setBookOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // Realtime: instantly reflect payment captures, subscription creation,
  // assignment events, completions, and customer-status changes.
  useEffect(() => {
    if (!userId) return;
    const refresh = (payload?: any) => {
      window.dispatchEvent(new CustomEvent("uwRealtimeEvidence", {
        detail: {
          at: new Date().toISOString(),
          table: payload?.table ?? payload?.schema ?? "unknown",
          eventType: payload?.eventType ?? "refresh",
          new: payload?.new ?? null,
        },
      }));
      qc.invalidateQueries({ queryKey: ["customer-bookings-all"] });
      qc.invalidateQueries({ queryKey: ["customer-bookings"] });
      qc.invalidateQueries({ queryKey: ["sub-queue", userId] });
      qc.invalidateQueries({ queryKey: ["customer-latest-service-notice", userId] });
    };
    const ch = supabase
      .channel(`cust-live-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `user_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `user_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions", filter: `customer_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "services", filter: `customer_id=eq.${userId}` }, refresh)
      // Photo uploads by the partner must update the customer timeline instantly.
      .on("postgres_changes", { event: "*", schema: "public", table: "service_photos" }, refresh)

      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_extensions", filter: `customer_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "dirty_vehicle_reports", filter: `customer_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "unavailability_reports", filter: `customer_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "customer_notifications", filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);


  const openSchedule = (kind: "any" | "interior" | "exterior" | "dusting" = "any") => {
    setScheduleKind(kind);
    setScheduleOpen(true);
  };


  // Vehicle selector: subscription is per-vehicle. All queries below are scoped
  // to the selected vehicle. Default = first vehicle with an active subscription,
  // else first vehicle. Selection persists in sessionStorage.
  const vehiclesQ = useQuery({
    queryKey: ["customer-vehicles", userId],
    enabled: !!userId,
    queryFn: async (): Promise<SelectorVehicle[]> => {
      const { data } = await (supabase as any)
        .from("customer_vehicles")
        .select("id, make, model, registration_number, is_default")
        .order("created_at");
      return (data ?? []) as SelectorVehicle[];
    },
  });

  // Preferred default: the vehicle with an active subscription.
  const preferredSubQ = useQuery({
    queryKey: ["preferred-sub-vehicle", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("subscriptions")
        .select("vehicle_id, status, created_at")
        .eq("user_id", userId)
        .in("status", ["active", "assigned", "awaiting_partner_assignment"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data?.vehicle_id as string | null) ?? null;
    },
  });
  const [selectedVehicleId, setSelectedVehicleId] = useSelectedVehicleId(
    vehiclesQ.data,
    preferredSubQ.data ?? null,
  );

  const bookingsQ = useQuery({
    queryKey: ["customer-bookings-all", userId, selectedVehicleId],
    enabled: !!userId && !!selectedVehicleId,
    queryFn: async (): Promise<Booking[]> => {
      const { data, error } = await (supabase as any)
        .from("bookings")
        .select("id, scheduled_date, status, payment_status, total_amount, base_amount, addon_amount, service_id, vehicle_id, service_catalog:service_id(name, service_type, slug)")
        .eq("vehicle_id", selectedVehicleId)
        .order("scheduled_date", { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data ?? []) as Booking[];
    },
  });

  const all = bookingsQ.data ?? [];
  // NO PAYMENT = NO SERVICE. Only paid subscription bookings may power the
  // active-plan hero, progress bar, renewal date, credits, and history. Any
  // unpaid subscription booking (pending / cancelled / failed / timeout)
  // surfaces the Payment Pending card only, with a Retry action.
  const subs = all.filter(
    (b) => b.service_catalog?.service_type === "subscription" && b.payment_status === "paid",
  );
  const pendingSub = all.find(
    (b) =>
      b.service_catalog?.service_type === "subscription" &&
      b.payment_status !== "paid" &&
      b.status !== "cancelled" &&
      b.status !== "expired" &&
      b.status !== "refunded",
  ) ?? null;
  const activeSub = subs.find(
    (s) => s.status !== "cancelled" && s.status !== "expired" && new Date(s.scheduled_date) <= new Date(),
  ) ?? subs[0];

  // Plan period: Daily Shine = 24 working days (no service on Mondays).
  const planStart = activeSub ? new Date(activeSub.scheduled_date) : null;
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
  const interiorCount = interiorReal.length;
  const exteriorCount = exteriorReal.length;
  const interiorLast = interiorReal[0]?.scheduled_date;
  const exteriorLast = exteriorReal[0]?.scheduled_date;


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

  const latestNoticeQ = useQuery({
    queryKey: ["customer-latest-service-notice", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customer_notifications")
        .select("id,type,title,body,link,metadata,created_at,read_at")
        .eq("user_id", userId)
        .in("type", ["vehicle_unavailable", "vehicle_dirty"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as null | {
        id: string; type: string; title: string; body: string | null; link: string | null; metadata: any; created_at: string; read_at: string | null;
      };
    },
  });

  // Recent service list must only reflect paid activity. Never surface
  // service/booking cards for unpaid subscription attempts.
  const paidAll = all.filter((b) => b.payment_status === "paid");
  const recent = paidAll.slice(0, 8);
  const completedCount = paidAll.filter((b) => b.status === "completed").length;
  const pendingCount = paidAll.filter((b) => b.status === "pending" || b.status === "scheduled").length;


  const selectedVehicle = vehiclesQ.data?.find((v) => v.id === selectedVehicleId) ?? null;
  const vehicleLabel = selectedVehicle ? `${selectedVehicle.make} ${selectedVehicle.model}` : null;
  const hasVehicles = (vehiclesQ.data?.length ?? 0) > 0;
  const activePlanSlug = activeSub?.service_catalog?.slug ?? null;

  // Fetch the real subscription row for this vehicle so we can show
  // cancel-at-period-end state and drive the Cancel/Undo actions.
  const fetchActiveSub = useServerFn(getActiveSubscriptionForVehicle);
  const activeSubRowQ = useQuery({
    queryKey: ["active-subscription", selectedVehicleId],
    enabled: !!selectedVehicleId && !!activeSub,
    queryFn: () => fetchActiveSub({ data: { vehicleId: selectedVehicleId! } }),
  });
  const subRow = activeSubRowQ.data ?? null;
  const cancelScheduled = !!subRow?.cancel_at_period_end;
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const undoFn = useServerFn(undoCancellation);
  const undoMut = useMutation({
    mutationFn: () => undoFn({ data: { subscriptionId: subRow!.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-subscription", selectedVehicleId] });
      toast.success("Cancellation reverted — your plan will keep renewing.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not undo. Try again."),
  });

  return (
    <div className="min-h-screen bg-[#FFF9F3] px-6 pb-12 pt-8">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-black tracking-tight text-[#1a1a1a]">My Plan</h1>
          <p className="mt-1 text-[13px] font-medium text-muted-foreground">
            {vehicleLabel ? `Your Daily Shine membership` : "Manage your car subscription."}
          </p>
        </div>
        {hasVehicles && (
          <VehicleSelector
            vehicles={vehiclesQ.data ?? []}
            value={selectedVehicleId}
            onChange={setSelectedVehicleId}
          />
        )}
      </div>

      {!hasVehicles && !vehiclesQ.isLoading && (
        <div className="mt-8 flex flex-col items-center rounded-3xl border border-dashed border-border/60 bg-card p-10 text-center shadow-sm">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-muted/30 text-muted-foreground">
            <Car className="h-8 w-8" />
          </div>
          <h3 className="mt-4 text-[17px] font-bold">No vehicles yet</h3>
          <p className="mt-1.5 text-[13px] text-muted-foreground">Add a car to subscribe to Daily Shine.</p>
          <Button asChild className="mt-6 rounded-full px-8 h-12 font-bold shadow-lg shadow-primary/20">
            <Link to="/c/vehicles/add">Add vehicle</Link>
          </Button>
        </div>
      )}

      {hasVehicles && (
        <>
          {activeSub && <AwaitingPartnerBanner userId={userId} vehicleId={selectedVehicleId} />}

          {activeSub && (
            <ServiceNoticeCard notice={latestNoticeQ.data ?? null} onScheduleIncluded={() => openSchedule("any")} />
          )}

          {bookingsQ.isLoading && (
            <div className="mt-6 space-y-4">
              <Shimmer className="h-48 w-full rounded-3xl" />
              <Shimmer className="h-20 w-full rounded-3xl" />
            </div>
          )}

          {!bookingsQ.isLoading && !activeSub && pendingSub && (
            <PendingPaymentCard booking={pendingSub} />
          )}

          {!bookingsQ.isLoading && !activeSub && !pendingSub && (
            <NoSubscriptionState vehicleId={selectedVehicleId} vehicleLabel={vehicleLabel} />
          )}
        </>
      )}

      {hasVehicles && activeSub && (
        <div className="mt-6 space-y-6">
          {/* Plan Hero Card */}
          <div className="relative overflow-hidden rounded-[32px] border border-primary/20 bg-white p-6 shadow-sm">
            {/* Glossy overlay effect */}
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/5 blur-3xl" />
            
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary">
                    <Sparkles className="h-3 w-3" />
                    Daily Shine
                  </span>
                  <StatusChip tone="success" className="bg-success/10 text-success text-[10px] font-black uppercase tracking-wider">
                    {activeSub.status.replaceAll("_", " ")}
                  </StatusChip>
                </div>
                <h2 className="mt-3 text-[24px] font-black tracking-tight text-[#1a1a1a]">
                  {activeSub.service_catalog?.name ?? "Daily Shine"}
                </h2>
                <div className="mt-1 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
                  <span className="text-primary font-bold">₹{Number(subRow?.amount ?? activeSub.total_amount ?? 0).toLocaleString("en-IN")}</span>
                  <span>/ month</span>
                  <span className="mx-1 opacity-30">·</span>
                  <span>{daysLeft} days left</span>


                </div>
              </div>
            </div>

            {/* Progress Section */}
            <div className="mt-6">
              <div className="flex items-center justify-between text-[12px] font-bold uppercase tracking-wider text-muted-foreground/60">
                <span>Usage</span>
                <span className="text-[#1a1a1a]">Day {elapsed} of {totalDays}</span>
              </div>
              <div className="mt-2.5 h-3 overflow-hidden rounded-full bg-muted/30">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-700"
                  style={{ width: `${(elapsed / totalDays) * 100}%` }}
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-border/40 pt-5">
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Next renewal</span>
                <span className="text-[13px] font-bold text-[#1a1a1a]">{planEnd?.toLocaleDateString("en-IN", { day: 'numeric', month: 'short' })}</span>
              </div>
              <button 
                onClick={() => setManageOpen(true)}
                className="flex items-center gap-1 text-[13px] font-black text-primary transition-opacity active:opacity-60"
              >
                Manage <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Attractive Quick Actions Grid */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setBookOpen(true)}
              className="uw-pressable flex flex-col items-center gap-3 rounded-[28px] border border-primary/10 bg-accent/30 p-5 text-center transition-all shadow-sm"
            >
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20">
                <CalendarPlus className="h-6 w-6" />
              </div>
              <div>
                <div className="text-[15px] font-black text-[#1a1a1a]">Book Wash</div>
                <div className="text-[11px] font-bold text-primary/70 uppercase tracking-tighter">Included wash</div>
              </div>
            </button>
            
            <button
              onClick={() => setBuilderOpen(true)}
              className="uw-pressable flex flex-col items-center gap-3 rounded-[28px] border border-border/60 bg-white p-5 text-center shadow-sm"
            >
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <Settings2 className="h-6 w-6" />
              </div>
              <div>
                <div className="text-[15px] font-black text-[#1a1a1a]">Modify</div>
                <div className="text-[11px] font-bold text-muted-foreground/60 uppercase tracking-tighter">Adjust plan</div>
              </div>
            </button>
          </div>

          {/* Pause/Cancel row */}
          <div className="flex gap-3">
             <button
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border/60 bg-white py-3.5 text-[13px] font-bold text-muted-foreground/80 shadow-sm transition-colors active:bg-muted/30"
            >
              <Pause className="h-4 w-4" /> Pause
            </button>
             <button
              onClick={() => setCancelDialogOpen(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-destructive/10 bg-destructive/5 py-3.5 text-[13px] font-bold text-destructive shadow-sm transition-colors active:bg-destructive/10"
            >
              <XCircle className="h-4 w-4" /> Cancel
            </button>
          </div>

          {cancelScheduled && subRow?.renewal_date && (
            <div className="mt-3 flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/15 p-3">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
              <div className="min-w-0 flex-1 text-xs">
                <p className="font-semibold text-warning-foreground">
                  Ending on {new Date(subRow.renewal_date).toLocaleDateString(undefined, { day: "numeric", month: "long" })}
                </p>
                <p className="mt-0.5 text-warning-foreground/80">
                  Your plan stays active until then. No more renewals after that.
                </p>
              </div>
              <button
                onClick={() => undoMut.mutate()}
                disabled={undoMut.isPending}
                className="shrink-0 text-xs font-semibold text-warning-foreground underline underline-offset-2 disabled:opacity-50"
              >
                Undo
              </button>
            </div>
          )}

          {/* Plan inclusions (dynamic, admin-editable) */}
          <PlanInclusionsCard planSlug={activePlanSlug} />

          {/* Per-vehicle remaining benefits */}




          {/* This month's washes */}
          <div className="mt-6">
            <h3 className="text-[15px] font-bold tracking-tight">This month's usage</h3>
            <div className="mt-4 space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[13px] font-medium">
                  <span>Exterior wash</span>
                  <span className="text-muted-foreground">{exteriorCount} / 25</span>
                </div>
                <Meter value={exteriorCount} max={25} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[13px] font-medium">
                  <span>Interior wash</span>
                  <span className="text-muted-foreground">{interiorCount} / 1</span>
                </div>
                <Meter value={interiorCount} max={1} />
              </div>
            </div>
          </div>

          {/* Book a wash — gated flow (Phase 3) */}
          <div className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold tracking-tight">Need to book a wash?</h3>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  You still have included washes available.
                </p>
              </div>
              <CalendarPlus className="h-5 w-5 shrink-0 text-primary" />
            </div>
            <Button
              onClick={() => setBookOpen(true)}
              className="mt-4 h-11 w-full rounded-full text-sm font-bold shadow-sm"
            >
              Book a wash
            </Button>
            <button
              type="button"
              onClick={() => openSchedule("any")}
              className="mt-3 inline-flex w-full items-center justify-center gap-1 text-[12.5px] font-medium text-primary hover:underline"
            >
              Explore one-time services <ChevronRight className="h-4 w-4" />
            </button>
          </div>


          {/* Recent service feed with photos + complaint window */}
          <RecentServiceFeed userId={userId} vehicleId={selectedVehicleId} />


          {/* Counters */}
        </div>
      )}

      <ScheduleWashDialog
        key={scheduleOpen ? (selectedVehicleId ?? "no-vehicle") : "closed"}
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        userId={userId}
        initialVehicleId={selectedVehicleId}
        kind={scheduleKind}
      />

      <CancelPlanDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        subscriptionId={subRow?.id ?? null}
        renewalDate={subRow?.renewal_date ?? planEnd ?? null}
        planName={activeSub?.service_catalog?.name ?? "Daily Shine"}
      />

      <BookAWashSheet
        open={bookOpen}
        onOpenChange={setBookOpen}
        vehicleId={selectedVehicleId}
        userId={userId}
      />

      <PackageBuilderSheet
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        basePlanSlug={activePlanSlug ?? activeSub?.service_catalog?.slug ?? "daily_shine_monthly"}
        basePlanPrice={Number(subRow?.amount ?? activeSub?.total_amount ?? 1199)}
        basePlanName={activeSub?.service_catalog?.name ?? "Daily Shine"}
      />

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Manage your plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <button 
              className="uw-pressable flex w-full items-center justify-between p-4 rounded-2xl border border-border bg-card text-left"
              onClick={() => { setManageOpen(false); /* Logic for modify would go here */ toast.info("Modify plan coming soon"); }}
            >
              <div className="flex items-center gap-3">
                <Settings2 className="h-5 w-5 text-primary" />
                <span className="font-semibold">Modify plan</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
            <button 
              className="uw-pressable flex w-full items-center justify-between p-4 rounded-2xl border border-border bg-card text-left"
              onClick={() => { setManageOpen(false); toast.info("Pause subscription coming soon"); }}
            >
              <div className="flex items-center gap-3">
                <Pause className="h-5 w-5 text-primary" />
                <span className="font-semibold">Pause subscription</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
            <button 
              className="uw-pressable flex w-full items-center justify-between p-4 rounded-2xl border border-border bg-card text-left text-destructive"
              onClick={() => { setManageOpen(false); setCancelDialogOpen(true); }}
            >
              <div className="flex items-center gap-3">
                <XCircle className="h-5 w-5" />
                <span className="font-semibold">Cancel subscription</span>
              </div>
              <ChevronRight className="h-5 w-5" />
            </button>
            
            <Section title="Add-ons & Packages" className="mt-4">
              <div className="space-y-2">
                <button 
                  className="uw-pressable flex w-full items-center justify-between p-4 rounded-2xl border border-border bg-card text-left"
                  onClick={() => { setManageOpen(false); /* Scroll to or open monthly addons */ }}
                >
                  <div className="flex items-center gap-3">
                    <Plus className="h-5 w-5 text-primary" />
                    <span className="font-semibold">Monthly add-ons</span>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </button>
                <button 
                  className="uw-pressable flex w-full items-center justify-between p-4 rounded-2xl border border-border bg-card text-left"
                  onClick={() => { setManageOpen(false); setBuilderOpen(true); }}
                >
                  <div className="flex items-center gap-3">
                    <Car className="h-5 w-5 text-primary" />
                    <span className="font-semibold">My packages</span>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>
            </Section>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PendingPaymentCard({ booking }: { booking: Booking }) {
  const slug = booking.service_catalog?.slug ?? "daily-shine";
  const planName = booking.service_catalog?.name ?? "Daily Shine";
  const statusLabel = booking.status === "cancelled"
    ? "Payment cancelled"
    : booking.status === "failed" || booking.payment_status === "failed"
      ? "Payment failed"
      : "Payment pending";
  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-5 overflow-hidden rounded-2xl border border-warning/40 bg-warning/15 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-warning-foreground">{statusLabel}</p>
          <h2 className="mt-1 truncate text-lg font-semibold">{planName}</h2>
          <p className="mt-2 text-xs text-warning-foreground/80">
            Your subscription has not been activated because payment has not been completed.
            Complete payment to activate {planName}.
          </p>
        </div>
        <ShieldAlert className="h-6 w-6 shrink-0 text-warning-foreground" />
      </div>
      <div className="mt-4">
        <Button asChild className="h-11 w-full rounded-2xl text-sm font-semibold">
          <Link to="/c/service/$slug" params={{ slug }}>Retry payment</Link>
        </Button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          No service, credits or partner assignment will start until payment succeeds.
        </p>
      </div>
    </div>
  );
}

function ServiceNoticeCard({ notice, onScheduleIncluded }: { notice: null | { id: string; type: string; title: string; body: string | null; link: string | null; metadata: any; created_at: string; read_at: string | null }; onScheduleIncluded: () => void }) {
  if (!notice) return null;
  const isDirty = notice.type === "vehicle_dirty";
  return (
    <div className={`mt-5 rounded-2xl border p-4 ${isDirty ? "border-primary/30 bg-primary/10" : "border-warning/40 bg-warning/15"}`}>
      <div className="flex items-start gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${isDirty ? "bg-primary/15 text-primary" : "bg-warning/20 text-warning-foreground"}`}>
          {isDirty ? <ShieldAlert className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{notice.title}</p>
          {notice.body && <p className="mt-1 text-xs text-muted-foreground">{notice.body}</p>}
          <p className="mt-1 text-[10px] text-muted-foreground">Received {new Date(notice.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>
          {isDirty ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="sm" className="h-8 rounded-full text-xs">
                <Link to="/c/service/$slug" params={{ slug: "one-time-wash-premium" }}>Book Premium Wash</Link>
              </Button>
              <Button size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={onScheduleIncluded}>Schedule Included Wash</Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="mt-3 h-8 rounded-full text-xs">Acknowledged</Button>
          )}
        </div>
      </div>
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
  initialVehicleId,
  kind = "any",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string | null;
  initialVehicleId: string | null;
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
  const [recurring, setRecurring] = useState<boolean>(false);
  const [weekday, setWeekday] = useState<number>(0); // 0=Sun
  const [occurrences, setOccurrences] = useState<number>(4);

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
        initialVehicleId && vehQ.data.some((v) => v.id === initialVehicleId)
          ? initialVehicleId
          : stored && vehQ.data.some((v) => v.id === stored)
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
  }, [open, kind, svcQ.data, vehQ.data, addrQ.data, vehicleId, addressId, initialVehicleId]);


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
  const previewQ = useQuery({
    queryKey: ["booking-preview", serviceId, vehicleId, addressId, date, slot],
    enabled: open && !!serviceId && !!vehicleId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("preview_customer_booking", {
        p_service_id: serviceId,
        p_vehicle_id: vehicleId,
        p_address_id: addressId || null,
        p_scheduled_date: date,
        p_scheduled_time: slot,
        p_addons: [],
        p_coupon_code: null,
      });
      if (error) throw error;
      return normalizeBookingPreview(data);
    },
  });
  const preview = previewQ.data ?? null;
  const previewReady = !!preview && !previewQ.isError;
  const payable = previewReady ? Number(preview.payable ?? 0) : 0;
  const isIncludedBooking = !!preview?.used_entitlement;
  const isExhausted = !!preview?.exhausted;

  const confirm = async () => {
    if (!userId) { toast.error("Please sign in again"); return; }
    if (!service) { toast.error(kind === "any" ? "Pick a service" : "This plan service is not available yet"); return; }
    if (!vehicle) { toast.error("Please select one of your vehicles"); return; }
    if (!addressId) { toast.error("Add a service address first"); return; }
    // Block Mondays for Daily Shine
    if (!recurring) {
      const dow = new Date(date).getDay(); // 1 = Monday
      if (dow === 1 && (service.slug?.startsWith("daily-shine") || kind !== "any")) {
        toast.error("Daily Shine does not run on Mondays. Please pick another date.");
        return;
      }
    } else if (weekday === 1) {
      toast.error("Daily Shine does not run on Mondays. Pick another weekday.");
      return;
    }

    // P0-02: Plan-included services (Interior/Exterior/Dusting) must go to the
    // admin Add-on Queue, NOT confirm_customer_booking. They are entitlements,
    // not new premium bookings, and must never trigger payment.
    const isPlanService =
      kind !== "any" ||
      ["daily-shine-interior", "daily-shine-exterior", "daily-shine-dusting"].includes(service.slug);

    setSaving(true);
    try {
      if (isPlanService) {
        // Find the active subscription for the exact selected vehicle.
        const { data: subRow, error: subErr } = await (supabase as any)
          .from("subscriptions")
          .select("id, status, vehicle_id")
          .eq("user_id", userId)
          .eq("vehicle_id", vehicle.id)
          .in("status", ["active", "assigned", "awaiting_partner_assignment"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (subErr) throw subErr;
        if (!subRow) {
          toast.error("This vehicle does not have an active Daily Shine subscription.");
          setSaving(false);
          return;
        }
        if (recurring) {
          // Create one addon request per occurrence (skip Mondays).
          const ids: string[] = [];
          let cursor = new Date(date);
          while (cursor.getDay() !== weekday) cursor.setDate(cursor.getDate() + 1);
          for (let i = 0; i < occurrences; i++) {
            if (cursor.getDay() !== 1) {
              const { data: res, error } = await (supabase as any).rpc("create_addon_request", {
                p_subscription_id: subRow.id,
                p_service_id: service.id,
                p_preferred_date: cursor.toISOString().slice(0, 10),
                p_preferred_time: slot,
                p_notes: "Recurring plan request from My Plan",
                p_vehicle_id: vehicle.id,
                p_address_id: addressId,
              });
              if (error) throw error;
              const reqId: string | null = res?.addon_request_id ?? null;
              if (reqId) {
                ids.push(reqId);
                traceVehicle("create_addon", { addon_request_id: reqId, vehicle_id: vehicle.id, details: { service_slug: service.slug, date: cursor.toISOString().slice(0, 10), slot, paid: res?.paid, entitlement: res?.entitlement } });
              }
            }
            cursor.setDate(cursor.getDate() + 7);
          }
          toast.success(`Sent ${ids.length} requests to admin · you'll be notified when scheduled`);
          qc.invalidateQueries({ queryKey: ["vehicle-entitlements", vehicle.id] });
        } else {
          const { data: res, error } = await (supabase as any).rpc("create_addon_request", {
            p_subscription_id: subRow.id,
            p_service_id: service.id,
            p_preferred_date: date,
            p_preferred_time: slot,
            p_notes: "Scheduled from My Plan",
            p_vehicle_id: vehicle.id,
            p_address_id: addressId,
          });
          if (error) throw error;
          const reqId: string | null = res?.addon_request_id ?? null;
          const paid = !!res?.paid;
          traceVehicle("create_addon", { addon_request_id: reqId, vehicle_id: vehicle.id, details: { service_slug: service.slug, date, slot, paid, entitlement: res?.entitlement } });
          if (!paid) {
            toast.success(`₹0 — included in your Daily Shine plan · ${date} · ${slot}`);
          } else {
            toast.success(`Add-on request sent · ${date} · ${slot} · admin will confirm shortly`);
          }
          qc.invalidateQueries({ queryKey: ["vehicle-entitlements", vehicle.id] });
        }
        qc.invalidateQueries({ queryKey: ["customer-bookings-all"] });
        qc.invalidateQueries({ queryKey: ["customer-bookings"] });
        qc.invalidateQueries({ queryKey: ["customer-addons"] });
        onOpenChange(false);
        return;
      }

      // Non-plan (one-time / premium) path — unchanged.
      if (recurring) {
        const { data: ids, error } = await (supabase as any).rpc("schedule_plan_services_recurring", {
          p_service_id: service.id,
          p_vehicle_id: vehicle.id,
          p_address_id: addressId,
          p_weekday: weekday,
          p_occurrences: occurrences,
          p_start_date: date,
          p_scheduled_time: slot,
        });
        if (error) throw error;
        const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][weekday];
        toast.success(`Scheduled ${(ids ?? []).length} ${dayName} visits · partner notified day before each`);
        qc.invalidateQueries({ queryKey: ["customer-bookings-all"] });
        qc.invalidateQueries({ queryKey: ["customer-bookings"] });
        onOpenChange(false);
        if (ids && ids[0]) navigate({ to: "/c/bookings/$id", params: { id: ids[0] } });
        return;
      }
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
                <option key={s.id} value={s.id}>{s.name}</option>
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

          {kind !== "any" && (
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <label className="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5"
                />
                <span>
                  <span className="font-semibold">Repeat weekly</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Pre-book your unused {PLAN_SERVICE_LABELS[kind].toLowerCase()} on a fixed weekday. Partner is notified a day before each visit.
                  </span>
                </span>
              </label>
              {recurring && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px]">Weekday</Label>
                    <div className="mt-1 grid grid-cols-7 gap-1">
                      {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, i) => (
                        <button
                          key={d}
                          type="button"
                          disabled={i === 1}
                          onClick={() => setWeekday(i)}
                          className={`rounded-lg border py-1 text-[10px] font-medium ${
                            i === 1
                              ? "cursor-not-allowed border-border text-muted-foreground/40 line-through"
                              : weekday === i
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border hover:bg-muted"
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">No service on Mondays.</p>
                  </div>
                  <div>
                    <Label className="text-[11px]">How many times</Label>
                    <select
                      value={occurrences}
                      onChange={(e) => setOccurrences(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                    >
                      {[1,2,3,4,5,6,8,10,12].map((n) => (
                        <option key={n} value={n}>{n} visit{n > 1 ? "s" : ""}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <Label className="text-xs">{recurring ? "Start from" : "Date"}</Label>
            <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
            {!recurring && new Date(date).getDay() === 1 && (
              <p className="mt-1 text-[11px] text-destructive">Mondays are off-days for Daily Shine. Pick another date.</p>
            )}
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

          {isExhausted && (
            <div className="rounded-xl border border-warning/40 bg-warning/15 px-3 py-2 text-xs text-warning-foreground">
              {exhaustedEntitlementMessage(preview)}
            </div>
          )}

          <div className="flex items-baseline justify-between rounded-xl bg-accent/40 px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {!previewReady ? "Checking plan" : isIncludedBooking ? INCLUDED_PLAN_MESSAGE : "Total · pay after service"}
            </span>
            <span className="text-base font-semibold">
              {!previewReady ? "…" : isIncludedBooking ? "₹0 Payable" : `₹${payable}`}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={saving || !previewReady || noVehicles || noAddresses}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {isIncludedBooking ? "Book Included Service" : "Confirm booking"}
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
