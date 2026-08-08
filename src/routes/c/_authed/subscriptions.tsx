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
import { cn } from "@/lib/utils";
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
          <div className="UW_NO_VEHICLES_CARD grid h-16 w-16 place-items-center rounded-full bg-muted/30 text-muted-foreground">
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
          {bookingsQ.isLoading && (
            <div className="mt-6 space-y-4">
              <Shimmer className="h-48 w-full rounded-3xl" />
              <Shimmer className="h-20 w-full rounded-3xl" />
            </div>
          )}

          {!bookingsQ.isLoading && !activeSub && pendingSub && (
            <PendingPaymentCard booking={pendingSub} vehicleId={selectedVehicleId} />
          )}

          {!bookingsQ.isLoading && !activeSub && !pendingSub && (
            <NoSubscriptionState vehicleId={selectedVehicleId} vehicleLabel={vehicleLabel} />
          )}

          {activeSub && (
             <div className="mt-2 flex items-center gap-2 rounded-2xl bg-success/10 px-4 py-3 border border-success/10">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="text-[12px] font-black text-success uppercase tracking-wider">Your Daily Shine plan is active</span>
             </div>
          )}
        </>
      )}

      {hasVehicles && activeSub && !!selectedVehicleId && (
        <div className="mt-6 space-y-5">
          {/* Flat Service Status Header */}
          <AwaitingPartnerBanner userId={userId} vehicleId={selectedVehicleId} />

          {/* Service Notice Card (if any) */}
          <ServiceNoticeCard notice={latestNoticeQ.data ?? null} onScheduleIncluded={() => setBookOpen(true)} vehicleId={selectedVehicleId} />

          {/* Compact Active Plan Surface */}
          <div className="rounded-[28px] border border-black/5 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-5 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary">
                    <Sparkles className="h-2.5 w-2.5" />
                    Daily Shine
                  </span>
                  <StatusChip tone="success" className="h-5 px-2 text-[9px] font-black uppercase tracking-wider">
                    Active
                  </StatusChip>
                </div>
                <h2 className="mt-2 text-[18px] font-black tracking-tight text-[#1a1a1a]">
                  {activeSub.service_catalog?.name ?? "Daily Shine Subscription"}
                </h2>
                <div className="mt-1 flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground/60">
                  <span className="text-[#1a1a1a]">₹{Number(subRow?.amount ?? activeSub.total_amount ?? 0).toLocaleString("en-IN")} / month</span>
                  <span className="mx-0.5 opacity-30">·</span>
                  <span>{daysLeft} days left</span>
                </div>
              </div>
              <button 
                onClick={() => setManageOpen(true)}
                className="flex items-center gap-1 text-[13px] font-black text-primary active:opacity-60"
              >
                Manage <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Usage Progress - Compact */}
            <div className="mt-5">
              <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-muted-foreground/40">
                <span>Monthly Usage</span>
                <span className="text-[#1a1a1a]">Day {elapsed} of {totalDays}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/30">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${(elapsed / totalDays) * 100}%` }}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-black/[0.03] pt-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Next Renewal</span>
                <span className="text-[13px] font-bold text-[#1a1a1a]">
                  {planEnd?.toLocaleDateString("en-IN", { day: 'numeric', month: 'short' }) || "4 Sept"}
                </span>
              </div>
              <div className="flex gap-2">
                 {cancelScheduled && (
                   <div className="flex items-center gap-1 text-[11px] font-bold text-warning-foreground">
                     <XCircle className="h-3 w-3" /> Scheduled to end
                   </div>
                 )}
              </div>
            </div>
          </div>

          {/* Premium Quick Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setBookOpen(true)}
              className="uw-pressable flex items-center gap-3 rounded-2xl bg-[#1a1a1a] p-4 shadow-md active:scale-[0.98]"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-white">
                <CalendarPlus className="h-5 w-5" />
              </div>
              <div className="text-left">
                <div className="text-[14px] font-black text-white">Book Wash</div>
                <div className="text-[10px] font-bold text-white/40 uppercase tracking-tighter">Included</div>
              </div>
            </button>
            
            <button
              onClick={() => setBuilderOpen(true)}
              className="uw-pressable flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-4 shadow-sm active:scale-[0.98]"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#FFF9F3] text-primary">
                <Settings2 className="h-5 w-5" />
              </div>
              <div className="text-left">
                <div className="text-[14px] font-black text-[#1a1a1a]">Modify</div>
                <div className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-tighter">Adjust plan</div>
              </div>
            </button>
          </div>

          {/* Secondary Actions */}
          <div className="flex items-center justify-between gap-4 px-1">
            <button
              className="text-[13px] font-bold text-muted-foreground/60 transition-colors active:text-primary"
            >
              Pause Subscription
            </button>
            <button
              onClick={() => setCancelDialogOpen(true)}
              className="text-[13px] font-bold text-muted-foreground/60 transition-colors active:text-destructive"
            >
              Cancel Plan
            </button>
          </div>

          {/* Usage Meters Section */}
          <div className="pt-2">
            <h3 className="text-[14px] font-black uppercase tracking-widest text-muted-foreground/40 px-1">Detailed Usage</h3>
            <div className="mt-3 space-y-4 rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[13px] font-bold">
                  <span className="text-[#1a1a1a]">Exterior washes</span>
                  <span className="text-muted-foreground/60">{exteriorCount} / 25</span>
                </div>
                <Meter value={exteriorCount} max={25} />
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[13px] font-bold">
                  <span className="text-[#1a1a1a]">Interior wash</span>
                  <span className="text-muted-foreground/60">{interiorCount} / 1</span>
                </div>
                <Meter value={interiorCount} max={1} />
              </div>
            </div>
          </div>

          {/* Plan Inclusions (Collapsible) */}
          <PlanInclusionsCard planSlug={activePlanSlug} />

          {/* Recent Service Feed (The Timeline) */}
          <RecentServiceFeed userId={userId} vehicleId={selectedVehicleId} />
        </div>
      )}

      {/* ScheduleWashDialog removed in favor of BookAWashSheet for unified premium flow */}

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

function PendingPaymentCard({ booking, vehicleId }: { booking: Booking; vehicleId: string | null }) {
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
      className="UW_PENDING_PAYMENT_CARD mt-5 overflow-hidden rounded-2xl border border-warning/40 bg-warning/15 p-5"
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
          {slug ? (
            <Link to="/c/service/$slug" params={{ slug }} search={{ vehicleId: vehicleId ?? undefined }}>Retry payment</Link>
          ) : (
            <Link to="/c/home">Go to home</Link>
          )}
        </Button>
        <p className="mt-2 text-center text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          Secure payment required before service
        </p>
      </div>
    </div>
  );
}

function ServiceNoticeCard({ notice, onScheduleIncluded, vehicleId }: { notice: null | { id: string; type: string; title: string; body: string | null; link: string | null; metadata: any; created_at: string; read_at: string | null }; onScheduleIncluded: () => void; vehicleId: string | null }) {
  if (!notice) return null;
  const isDirty = notice?.type === "vehicle_dirty";
  
  return (
    <div className={cn(
      "mt-5 overflow-hidden rounded-[28px] border bg-white shadow-sm transition-all active:scale-[0.99]",
      isDirty ? "border-primary/20" : "border-warning/20"
    )}>
      <div className="flex items-start gap-4 p-5">
        <div className={cn(
          "grid h-12 w-12 shrink-0 place-items-center rounded-2xl shadow-sm",
          isDirty ? "bg-primary/10 text-primary" : "bg-amber-50 text-amber-600"
        )}>
          {isDirty ? <ShieldAlert className="h-6 w-6" /> : <BellRing className="h-6 w-6" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-black tracking-tight text-[#1a1a1a]">
              {isDirty ? "Vehicle needs extra attention" : notice.title}
            </h3>
            <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-wider">
              {new Date(notice.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <p className="mt-1 text-[13px] font-medium leading-relaxed text-muted-foreground/70">
            {isDirty 
              ? "Your partner reported that your vehicle needs a little extra attention."
              : notice.body}
          </p>
          
          <div className="mt-4 flex flex-col gap-2">
            {isDirty ? (
              <>
                <Button 
                  onClick={onScheduleIncluded}
                  className="h-11 w-full rounded-2xl bg-primary text-[14px] font-black shadow-lg shadow-primary/20"
                >
                  Schedule a wash
                </Button>
                <button 
                  onClick={() => {/* View photos logic */}}
                  className="flex items-center justify-center gap-1.5 py-2 text-[13px] font-black text-primary/60"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  📷 View service photos
                </button>
              </>
            ) : (
              <Button variant="outline" className="h-11 w-full rounded-2xl border-black/5 text-[14px] font-black">
                Acknowledged
              </Button>
            )}
          </div>
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

// ScheduleWashDialog removed - unified flow uses BookAWashSheet
// ScheduleWashDialog removed - unified flow uses BookAWashSheet

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

function RecommendedAddon({ name, price, icon: Icon, vehicleId }: { name: string; price: number; icon: any; vehicleId: string | null }) {
  return (
    <Link
      to="/c/service/$slug"
      params={{ slug: "daily-shine" }}
      search={{ vehicleId: vehicleId ?? undefined }}
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
