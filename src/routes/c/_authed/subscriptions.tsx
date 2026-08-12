import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Calendar, Pause, Sparkles, CheckCircle2, Clock, Plus, RefreshCw, Droplets, Wrench, CalendarPlus, Loader2, BellRing, ShieldAlert, Car, Settings2, XCircle, Undo2, ChevronRight, ChevronDown } from "lucide-react";
import { ListGroup, ListRow, Section, StatusChip, Surface } from "@/components/customer/ui/kit";
import { UWPlanCard } from "@/components/customer/ui/UWPlanCard";

import { supabase } from "@/integrations/supabase/client";
import { SkeletonCard, SkeletonRow, Shimmer } from "@/components/customer/ui/Skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { UWHeader } from "@/components/customer/ui/UWHeader";
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
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!userId) return;
    const refresh = (payload?: any) => {
      qc.invalidateQueries({ queryKey: ["customer-bookings-all"] });
      qc.invalidateQueries({ queryKey: ["customer-bookings"] });
      qc.invalidateQueries({ queryKey: ["sub-queue", userId] });
      qc.invalidateQueries({ queryKey: ["customer-latest-service-notice", userId, selectedVehicleId] });
    };
    const ch = supabase
      .channel(`cust-live-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `user_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `user_id=eq.${userId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions", filter: `customer_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);

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

  const planStart = activeSub ? new Date(activeSub.scheduled_date) : null;
  const totalDays = 25;
  const planEnd = planStart ? new Date(planStart.getTime() + 28 * 24 * 60 * 60 * 1000) : null;
  const today = new Date();
  const elapsed = planStart ? Math.max(0, Math.min(totalDays, Math.floor((today.getTime() - planStart.getTime()) / 86400000))) : 0;
  const daysLeft = planEnd ? Math.max(0, Math.ceil((planEnd.getTime() - today.getTime()) / 86400000)) : 0;
  const expiringSoon = daysLeft > 0 && daysLeft <= 7;

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

  const latestNoticeQ = useQuery({
    queryKey: ["customer-latest-service-notice", selectedVehicleId],
    enabled: !!selectedVehicleId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("dirty_vehicle_reports")
        .select(`id, created_at, service:services!inner(vehicle_id)`)
        .eq("services.vehicle_id", selectedVehicleId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] || null;
    },
  });

  const selectedVehicle = vehiclesQ.data?.find((v) => v.id === selectedVehicleId) ?? null;
  const vehicleLabel = selectedVehicle ? `${selectedVehicle.make} ${selectedVehicle.model}` : null;
  const hasVehicles = (vehiclesQ.data?.length ?? 0) > 0;
  const activePlanSlug = activeSub?.service_catalog?.slug ?? null;

  const fetchActiveSub = useServerFn(getActiveSubscriptionForVehicle);
  const activeSubRowQ = useQuery({
    queryKey: ["active-subscription", selectedVehicleId],
    enabled: !!selectedVehicleId && !!activeSub,
    queryFn: () => fetchActiveSub({ data: { vehicleId: selectedVehicleId! } }),
  });
  const subRow = activeSubRowQ.data ?? null;
  const cancelScheduled = !!subRow?.cancel_at_period_end;
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#FDFDFD] pb-24">
      <UWHeader
        area="My Plan"
        hideLocationIcon
        onAreaClick={() => {}}
        activeVehicle={selectedVehicle ? {
          make: selectedVehicle.make,
          model: selectedVehicle.model,
          registration_number: selectedVehicle.registration_number || "",
          category: 'sedan',
          color: null
        } : undefined}
        onVehicleClick={() => {
          // Trigger the vehicle selector from header
        }}
      />

      <div className="px-5 pt-[82px]">
        {selectedVehicle && (
          <div className="mb-6">
             <div className="flex items-baseline gap-2">
               <h2 className="text-[20px] font-black text-[#1A1A1A] tracking-tight">{selectedVehicle.make} {selectedVehicle.model}</h2>
               <span className="text-[12px] font-bold text-black/20 uppercase tracking-widest">{selectedVehicle.registration_number}</span>
             </div>
          </div>
        )}

        {hasVehicles && (
          <>
            {bookingsQ.isLoading ? (
              <div className="mt-6 space-y-4">
                <Shimmer className="h-48 w-full rounded-2xl" />
                <Shimmer className="h-20 w-full rounded-2xl" />
              </div>
            ) : (
              <>
                {!activeSub && pendingSub && (
                  <PendingPaymentCard booking={pendingSub} vehicleId={selectedVehicleId} />
                )}

                {!activeSub && !pendingSub && (
                  <NoSubscriptionState vehicleId={selectedVehicleId} vehicleLabel={vehicleLabel} />
                )}

                {activeSub && (
                  <div className="mt-4 space-y-4">
                    <AwaitingPartnerBanner userId={userId} vehicleId={selectedVehicleId} />
                    
                    {latestNoticeQ.data && (
                      <Surface className="border-primary/20 bg-white p-5">
                        <div className="flex items-start gap-4">
                          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                            <ShieldAlert className="h-6 w-6" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-[15px] font-bold text-[#1A1A1A]">Vehicle needs attention</h3>
                            <p className="mt-1 text-[13px] text-[#555555]">
                              {vehicleLabel} was reported as extra dirty. A premium wash is recommended.
                            </p>
                            <Button onClick={() => setBookOpen(true)} className="mt-4 h-11 w-full rounded-2xl bg-[#1A1A1A] text-[14px] font-bold text-white active:scale-95">
                              Schedule a wash
                            </Button>
                          </div>
                        </div>
                      </Surface>
                    )}

                    {/* ACTIVE PLAN CARD */}
                    <div className="rounded-[18px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="flex h-5 items-center gap-1 rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black">
                              Daily Shine
                            </span>
                            <div className="flex items-center gap-1 rounded-full bg-[#E8F5E9] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#2E7D32]">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              Active
                            </div>
                          </div>
                          <h2 className="text-[18px] font-black text-[#1A1A1A] leading-tight">
                            {activeSub.service_catalog?.name ?? "Daily Shine Subscription"}
                          </h2>
                          <div className="mt-1.5 text-[15px] font-bold text-[#1A1A1A]">
                            ₹{Number(subRow?.amount ?? activeSub.total_amount ?? 0).toLocaleString("en-IN")} / month 
                            <span className="text-[13px] text-[#8A8A8A] font-medium ml-2">· {daysLeft} days left</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.1em] text-[#8A8A8A]">
                            <span>SERVICE DAYS</span>
                            <span className="text-[#1A1A1A] text-[13px]">{elapsed} / 25</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EEEEEE]">
                            <div className="h-full rounded-full bg-[#FF6B00] transition-[width] duration-500" style={{ width: `${(elapsed / 25) * 100}%` }} />
                          </div>
                        </div>
                        
                        <div className="space-y-2 opacity-60">
                          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.1em] text-[#8A8A8A]">
                            <span>INTERIOR WASH</span>
                            <span className="text-[#1A1A1A] text-[13px]">{interiorCount} / 1</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EEEEEE]">
                            <div className="h-full rounded-full bg-[#8A8A8A] transition-[width] duration-500" style={{ width: `${(interiorCount / 1) * 100}%` }} />
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 pt-4 border-t border-[#F5F5F5]">
                        <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[#8A8A8A]">Next Renewal</p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-[15px] font-black text-[#1A1A1A]">
                            {planEnd?.toLocaleDateString("en-IN", { day: 'numeric', month: 'short' })}
                          </p>
                          <span className={cn(
                            "text-[12px] font-bold",
                            cancelScheduled ? "text-[#E53935]" : "text-[#2E7D32]"
                          )}>
                            {cancelScheduled ? "Scheduled to end" : "Auto-renews"}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-6">
                        <button onClick={() => setBookOpen(true)} className="h-[52px] flex items-center justify-center rounded-xl bg-[#1A1A1A] text-white active:scale-[0.98] transition-all text-[14px] font-black shadow-lg shadow-black/5">
                          Book Wash
                        </button>
                        <button onClick={() => setBuilderOpen(true)} className="h-[52px] flex items-center justify-center rounded-xl border border-black/5 bg-white text-[#1A1A1A] active:scale-[0.98] transition-all text-[14px] font-black">
                          Modify
                        </button>
                      </div>
                    </div>

                    <PlanInclusionsCard planSlug={activePlanSlug} />
                    <RecentServiceFeed userId={userId} vehicleId={selectedVehicleId} />

                    <div className="flex justify-center gap-4 mt-6 mb-4">
                      <button className="text-[12px] font-bold text-[#8A8A8A] active:opacity-60">Pause subscription</button>
                      <span className="h-4 w-[1px] bg-black/5" />
                      <button onClick={() => setCancelDialogOpen(true)} className="text-[12px] font-bold text-[#8A8A8A] active:opacity-60">Cancel plan</button>
                    </div>
                  </div>

                )}
              </>
            )}
          </>
        )}
      </div>

      <CancelPlanDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        subscriptionId={subRow?.id ?? null}
        renewalDate={subRow?.renewal_date ?? planEnd ?? null}
        planName={activeSub?.service_catalog?.name ?? "Daily Shine"}
      />
      <BookAWashSheet open={bookOpen} onOpenChange={setBookOpen} vehicleId={selectedVehicleId} userId={userId} />
      <PackageBuilderSheet
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        basePlanSlug={activePlanSlug ?? "daily_shine_monthly"}
        basePlanPrice={Number(subRow?.amount ?? activeSub?.total_amount ?? 1199)}
        basePlanName={activeSub?.service_catalog?.name ?? "Daily Shine"}
      />

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader><DialogTitle>Manage your plan</DialogTitle></DialogHeader>
          <div className="space-y-2 mt-2">
            <button className="flex w-full items-center justify-between p-4 rounded-2xl border border-border bg-card text-left" onClick={() => { setManageOpen(false); toast.info("Modify plan coming soon"); }}>
              <div className="flex items-center gap-3"><Settings2 className="h-5 w-5 text-primary" /><span className="font-semibold">Modify plan</span></div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
            <button className="flex w-full items-center justify-between p-4 rounded-2xl border border-border bg-card text-left" onClick={() => { setManageOpen(false); toast.info("Pause subscription coming soon"); }}>
              <div className="flex items-center gap-3"><Pause className="h-5 w-5 text-primary" /><span className="font-semibold">Pause subscription</span></div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
            <button className="flex w-full items-center justify-between p-4 rounded-2xl border border-border bg-card text-left text-destructive" onClick={() => { setManageOpen(false); setCancelDialogOpen(true); }}>
              <div className="flex items-center gap-3"><XCircle className="h-5 w-5" /><span className="font-semibold">Cancel subscription</span></div>
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PendingPaymentCard({ booking, vehicleId }: { booking: Booking; vehicleId: string | null }) {
  const slug = booking.service_catalog?.slug ?? "daily-shine";
  const planName = booking.service_catalog?.name ?? "Daily Shine";
  const statusLabel = booking.status === "cancelled" ? "Payment cancelled" : booking.payment_status === "failed" ? "Payment failed" : "Payment pending";
  return (
    <div className="mt-5 overflow-hidden rounded-[22px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#FF6B00]">{statusLabel}</p>
          <h2 className="mt-1 truncate text-[18px] font-bold text-[#1A1A1A]">{planName}</h2>
          <p className="mt-2 text-[13px] text-[#8A8A8A]">Your subscription requires completion of payment to activate {planName}.</p>
        </div>
        <ShieldAlert className="h-6 w-6 shrink-0 text-[#FF6B00]" />
      </div>
      <div className="mt-5">
        <Button asChild className="h-11 w-full rounded-2xl bg-[#1A1A1A] text-white text-[14px] font-bold">
          <Link to="/c/service/$slug" params={{ slug }} search={{ vehicleId: vehicleId ?? undefined }}>Retry payment</Link>
        </Button>
      </div>
    </div>
  );
}
