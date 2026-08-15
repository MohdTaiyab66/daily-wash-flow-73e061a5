import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { cancelMyAssignment, getAssignmentCancellability, getMyAssignment } from "@/lib/assignment.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Briefcase, CheckCircle2, Clock, Lock, Navigation, Phone, Wallet, XCircle, Loader2, LifeBuoy, MapPin, IndianRupee, TrendingUp } from "lucide-react";
import { ModifyAssignmentDialog } from "@/components/ModifyAssignmentDialog";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { useTodayAssignment } from "@/hooks/use-today-assignment";
import { formatTime12 } from "@/lib/format";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { TodayAssignmentStatus } from "@/components/partner/TodayAssignmentStatus";

const SUPPORT_TEL = "+911800000000";

export const Route = createFileRoute("/_authenticated/app/my-assignment")({
  component: MyAssignmentPage,
});

// Live clock so time-window state updates without a manual refresh.
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function parseHHMM(t?: string | null): { h: number; m: number } | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };
}

function MyAssignmentPage() {
  const fn = useServerFn(getMyAssignment);
  const cancelFn = useServerFn(cancelMyAssignment);
  const canFn = useServerFn(getAssignmentCancellability);
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const now = useNow();

  useRealtimeInvalidation(
    ["assignments", "services", "customers", "vehicles", "wallet_ledger"],
    [["my-assignment"], ["cancellability"], ["today-assignment"]],
  );

  const myQuery = useQuery({
    queryKey: ["my-assignment"],
    queryFn: () => fn(),
    refetchInterval: 30000,
    retry: 4,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
  const todayQuery = useTodayAssignment();
  const data = myQuery.data;
  const assignmentId = (data && (data as any).assignment?.id) as string | undefined;

  const { data: cancelInfo } = useQuery({
    queryKey: ["cancellability", assignmentId],
    queryFn: () => canFn({ data: { assignment_id: assignmentId! } }),
    enabled: !!assignmentId,
    refetchInterval: 60000,
  });

  const cancelMut = useMutation({
    mutationFn: (assignmentId: string) => cancelFn({ data: { assignment_id: assignmentId } }),
    onSuccess: () => {
      toast.success("Assignment cancelled. Customers have been reassigned.");
      setConfirmOpen(false);
      qc.invalidateQueries();
    },
    onError: (e: any) => {
      const code = e?.code as string | undefined;
      if (code === "ROUTE_STARTED") toast.error("Route already started. Please contact Partner Support.");
      else if (code === "CUTOFF_PASSED") toast.error("Cancellation window closed (8 hours before start).");
      else toast.error(e?.message ?? "Cancel failed");
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["cancellability", assignmentId] });
    },
  });

  if (data === undefined && !myQuery.isError) {
    return <div className="mx-auto max-w-md p-5 text-sm text-muted-foreground">Loading today's assignment…</div>;
  }
  if (myQuery.isError && data === undefined) {
    return (
      <div className="mx-auto max-w-md px-5 pt-5">
        <TodayAssignmentStatus isError isFetching={myQuery.isFetching} isRefetching={false} hasData={false} onRetry={() => myQuery.refetch()} />
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="mx-auto max-w-md px-5 pt-5">
        <Card className="mt-3 flex flex-col items-center gap-3 p-8 text-center">
          <Briefcase className="h-6 w-6 text-muted-foreground" />
          <p className="font-medium">No active assignment</p>
          <p className="text-sm text-muted-foreground">Build one from the marketplace.</p>
          <Button asChild><Link to="/app/assignments">Build assignment</Link></Button>
        </Card>
      </div>
    );
  }
  if (data === undefined) return null;

  const a = data.assignment as any;
  const workingDaysLabel = (n: number) => `${n} Working Day${n === 1 ? "" : "s"}`;

  // Today's-status state machine
  const todayServices = todayQuery.data?.today ?? [];
  const hasToday = todayServices.length > 0;
  const anyStarted = todayServices.some((s: any) => !!s.started_at);
  const allDone = hasToday && todayServices.every((s: any) => s.status === "completed" || s.status === "unavailable");
  const completedToday = todayServices.filter((s: any) => s.status === "completed").length;
  const expectedToday = todayServices.reduce((sum: number, s: any) => sum + Number(s.rate_per_car || a.rate_per_car || 0), 0);
  const earnedToday = todayServices
    .filter((s: any) => s.status === "completed")
    .reduce((sum: number, s: any) => sum + Number(s.rate_per_car || a.rate_per_car || 0), 0);

  const startHHMM = parseHHMM(a.expected_start_time);
  let unlockDiffMin = Number.POSITIVE_INFINITY;
  let shiftStartDate: Date | null = null;
  if (startHHMM) {
    shiftStartDate = new Date(now);
    shiftStartDate.setHours(startHHMM.h, startHHMM.m, 0, 0);
    const unlockAt = new Date(shiftStartDate.getTime() - 60 * 60 * 1000);
    unlockDiffMin = Math.max(0, Math.round((unlockAt.getTime() - now.getTime()) / 60000));
  }
  const beforeWindow = hasToday && !anyStarted && unlockDiffMin > 0;

  type TodayState = "rest" | "before" | "ready" | "in_progress" | "done";
  const todayState: TodayState = !hasToday
    ? "rest"
    : allDone
    ? "done"
    : anyStarted
    ? "in_progress"
    : beforeWindow
    ? "before"
    : "ready";

  const workingHoursLabel = a.expected_start_time
    ? `${formatTime12(a.expected_start_time)}${a.expected_end_time ? ` – ${formatTime12(a.expected_end_time)}` : ""}`
    : `${data.hours_per_day} hr/day`;
  const estMonthly = data.expected_total;

  return (
    <div className="mx-auto max-w-md px-5 pt-3 pb-[140px] space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-[#1A1A1A]">Today's Assignment</h1>
        <p className="text-sm text-muted-foreground font-medium">Your work plan for today</p>
      </header>

      {/* AREA SELECTION HEADER */}
      <section>
        <div className="flex items-center justify-between p-4 bg-white border border-neutral-100 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#FF6B00]/10 flex items-center justify-center">
              <MapPin className="h-5 w-5 text-[#FF6B00]" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Work Area</p>
              <p className="text-sm font-bold text-[#1A1A1A]">📍 {a.area}</p>
            </div>
          </div>
          <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 rounded-lg text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider">Active</Badge>
        </div>
      </section>

      {/* HERO SUMMARY CARD */}
      <section>
        <Card className="overflow-hidden border-0 bg-[#1A1A1A] text-white shadow-2xl rounded-3xl relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF6B00]/20 rounded-full blur-3xl -mr-16 -mt-16" />
          <div className="p-6 space-y-6 relative z-10">
            <div className="flex flex-col gap-1">
              <p className="text-[11px] font-bold uppercase text-white/40 tracking-[0.2em]">Assignment Summary</p>
              <div className="flex items-baseline justify-between mt-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🚗</span>
                  <span className="text-2xl font-black uppercase tracking-tight">{a.target_cars} CUSTOMERS</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1 border-t border-white/10 pt-6">
              <p className="text-[11px] font-bold uppercase text-white/40 tracking-[0.2em]">Monthly Earning Potential</p>
              <div className="flex items-baseline gap-2 mt-1">
                < IndianRupee className="h-6 w-6 text-[#FF6B00]" strokeWidth={3} />
                <span className="text-4xl font-black tracking-tighter">₹{estMonthly.toLocaleString("en-IN")}</span>
              </div>
              <p className="text-[10px] text-white/30 font-bold mt-1 uppercase tracking-wider">
                🟢 26 service days/month • Mondays OFF
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-6">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase text-white/40 tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3 w-3" /> Daily Hours
                </p>
                <p className="text-sm font-bold">{data.hours_per_day} Hours / Day</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase text-white/40 tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="h-3 w-3" /> Timeline
                </p>
                <p className="text-sm font-bold truncate">{workingHoursLabel}</p>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* TODAY'S STATUS */}
      <section className="space-y-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground px-1">Today's Status</h3>
        <TodayStatusCard
          state={todayState}
          shiftStart={a.expected_start_time}
          unlockDiffMin={unlockDiffMin}
          totalToday={todayServices.length}
          completedToday={completedToday}
          expectedToday={expectedToday}
          earnedToday={earnedToday}
          nextDate={todayQuery.data?.nextDate ?? null}
        />
      </section>

      {/* SECONDARY INFO */}
      <section className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-neutral-100 shadow-sm">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Duration</p>
          <p className="text-sm font-bold mt-1">{workingDaysLabel(data.working_days_total)}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-neutral-100 shadow-sm">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Completed</p>
          <p className="text-sm font-bold mt-1">{data.working_days_completed} Days</p>
        </div>
      </section>

      {/* MODIFICATIONS */}
      <section className="space-y-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground px-1">Modifications</h3>
        <Card className="p-5 border-neutral-100 shadow-sm bg-white rounded-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-[#1A1A1A]">Change your capacity</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.can_modify
                  ? `${Math.max(0, data.modifications_max - data.modifications_used)} modification${(data.modifications_max - data.modifications_used) === 1 ? "" : "s"} remaining`
                  : data.cooldown_until
                  ? `Available after ${new Date(data.cooldown_until).toLocaleDateString("en-IN", { weekday: "long" })}`
                  : "No modifications remaining"}
              </p>
            </div>
            <ModifyAssignmentDialog
              assignmentId={a.id}
              currentCars={a.target_cars}
              canModify={data.can_modify}
              modsUsed={data.modifications_used}
              modsMax={data.modifications_max}
              cooldownUntil={data.cooldown_until}
            />
          </div>
        </Card>
      </section>

      {/* QUICK LINKS */}
      <section className="grid grid-cols-3 gap-3">
        <Button asChild variant="outline" className="h-[80px] flex-col gap-2 rounded-2xl bg-white border-neutral-100 shadow-sm">
          <Link to="/app/live">
            <Navigation className="h-5 w-5 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-tighter">Route</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-[80px] flex-col gap-2 rounded-2xl bg-white border-neutral-100 shadow-sm">
          <Link to="/app/earnings">
            <Wallet className="h-5 w-5 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-tighter">Wallet</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-[80px] flex-col gap-2 rounded-2xl bg-white border-neutral-100 shadow-sm">
          <a href={`tel:${SUPPORT_TEL}`}>
            <LifeBuoy className="h-5 w-5 text-primary" />
            <span className="text-[11px] font-bold uppercase tracking-tighter">Help</span>
          </a>
        </Button>
      </section>

      {/* CANCELLATION */}
      <section className="pt-4 border-t border-neutral-100">
        <CancelSection
          canCancel={!!cancelInfo?.can_cancel}
          reason={cancelInfo?.reason}
          deadlineAt={cancelInfo?.deadline_at ?? null}
          routeStarted={!!cancelInfo?.route_started}
          pending={cancelMut.isPending}
          onCancel={() => setConfirmOpen(true)}
          isRestDay={todayState === "rest"}
        />
      </section>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-3xl max-w-[90vw]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">Cancel Assignment?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              All customers in your batch will be released to other Urban Wash partners in this area. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3">
            <AlertDialogCancel disabled={cancelMut.isPending} className="flex-1 h-12 rounded-xl mt-0 font-bold border-2">Keep</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelMut.isPending}
              className="flex-1 h-12 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold"
              onClick={(e) => { e.preventDefault(); if (assignmentId) cancelMut.mutate(assignmentId); }}
            >
              {cancelMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TodayStatusCard({
  state, shiftStart, unlockDiffMin, totalToday, completedToday, expectedToday, earnedToday, nextDate,
}: {
  state: "rest" | "before" | "ready" | "in_progress" | "done";
  shiftStart?: string | null;
  unlockDiffMin: number;
  totalToday: number;
  completedToday: number;
  expectedToday: number;
  earnedToday: number;
  nextDate?: string | null;
}) {
  if (state === "rest") {
    return (
      <Card className="mt-4 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today</p>
        <p className="mt-2 text-lg font-semibold">🍃 Monday</p>
        <p className="mt-1 text-sm text-muted-foreground">
          No services are scheduled on Mondays. Your assignment remains active.
        </p>
        <div className="mt-3 rounded-lg bg-muted p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Next Service</p>
          <p className="mt-1 text-base font-semibold tracking-tight">
            {nextDate
              ? `${new Date(nextDate).toLocaleDateString("en-IN", { weekday: "long" })}${shiftStart ? ` • ${formatTime12(shiftStart)}` : ""}`
              : shiftStart ? `Tomorrow • ${formatTime12(shiftStart)}` : "Tomorrow"}
          </p>
        </div>
      </Card>
    );
  }

  if (state === "before") {
    const h = Math.floor(unlockDiffMin / 60);
    const m = unlockDiffMin % 60;
    const countdown = h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
    const unlockAt = shiftStart ? new Date() : null;
    if (unlockAt && shiftStart) {
      const p = /^(\d{1,2}):(\d{2})/.exec(shiftStart);
      if (p) {
        unlockAt.setHours(parseInt(p[1], 10), parseInt(p[2], 10), 0, 0);
        unlockAt.setTime(unlockAt.getTime() - 60 * 60 * 1000);
      }
    }
    return (
      <Card className="mt-4 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today's Status</p>
        <div className="mt-2 flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm">
            Today's route will unlock at{" "}
            <b>{unlockAt ? formatTime12(`${unlockAt.getHours()}:${String(unlockAt.getMinutes()).padStart(2, "0")}`) : "1 hour before"}</b>.
          </p>
        </div>
        <Button size="lg" disabled className="mt-4 h-12 w-full rounded-2xl">
          <Clock className="mr-2 h-4 w-4" />
          Starts in {countdown}
        </Button>
      </Card>
    );
  }

  if (state === "ready") {
    return (
      <Card className="p-5 border-emerald-100 bg-emerald-50 rounded-2xl border shadow-sm">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase text-emerald-600 tracking-wider">Today's Route</p>
            <div className="mt-1 flex items-baseline gap-3">
              <p className="text-2xl font-black text-emerald-900">{totalToday} Customers</p>
              <p className="text-xs font-bold text-emerald-700/60 uppercase">Expected ₹{expectedToday.toLocaleString("en-IN")}</p>
            </div>
          </div>
          <Button asChild size="lg" className="h-12 w-full rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg shadow-emerald-600/20">
            <Link to="/app/live"><Navigation className="mr-2 h-4 w-4" />START TODAY'S ROUTE</Link>
          </Button>
        </div>
      </Card>
    );
  }

  if (state === "in_progress") {
    return (
      <Card className="p-5 border-[#FF6B00]/10 bg-[#FF6B00]/5 rounded-2xl border shadow-sm">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase text-[#FF6B00] tracking-wider">In Progress</p>
            <p className="mt-1 text-2xl font-black text-[#1A1A1A]">
              {completedToday} / {totalToday} Done
            </p>
          </div>
          <Button asChild size="lg" className="h-12 w-full rounded-2xl bg-[#FF6B00] hover:bg-[#E56000] text-white font-bold shadow-lg shadow-[#FF6B00]/20">
            <Link to="/app/live"><Navigation className="mr-2 h-4 w-4" />CONTINUE ROUTE</Link>
          </Button>
        </div>
      </Card>
    );
  }

  // done
  return (
    <Card className="p-5 border-neutral-100 bg-neutral-50 rounded-2xl border shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <p className="text-lg font-black text-[#1A1A1A]">Today's Route Completed</p>
        </div>
        <div className="flex items-baseline gap-2">
           <span className="text-sm font-bold text-neutral-500">{completedToday} customers served</span>
           <span className="text-sm font-black text-emerald-600">₹{earnedToday.toLocaleString("en-IN")} earned</span>
        </div>
        <Button asChild size="lg" variant="outline" className="h-12 w-full rounded-2xl border-neutral-200 bg-white font-bold text-[#1A1A1A]">
          <Link to="/app/live">View Summary</Link>
        </Button>
      </div>
    </Card>
  );
}

function CancelSection({ canCancel, reason, deadlineAt, routeStarted, pending, onCancel, isRestDay }: {
  canCancel: boolean; reason?: string; deadlineAt: string | null; routeStarted: boolean; pending: boolean; onCancel: () => void; isRestDay?: boolean;
}) {
  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <Card className="mt-4 p-4">
      <p className="text-sm font-semibold">Assignment Management</p>
      {children}
    </Card>
  );

  if (routeStarted || reason === "ROUTE_STARTED") {
    return (
      <Wrap>
        <p className="mt-1 text-xs text-muted-foreground">
          Today's route is already in progress. Assignment cancellation is only available through Partner Support.
        </p>
        <Button asChild className="mt-3 w-full" variant="outline">
          <a href={`tel:${SUPPORT_TEL}`}><Phone className="mr-2 h-4 w-4" />Call Partner Support</a>
        </Button>
      </Wrap>
    );
  }

  if (isRestDay && canCancel) {
    return (
      <Wrap>
        <p className="mt-1 text-xs text-muted-foreground">
          No services are scheduled today. You can cancel your assignment if you no longer wish to continue.
        </p>
        <Button className="mt-3 w-full" variant="outline" disabled={pending} onClick={onCancel}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
          Cancel Assignment
        </Button>
      </Wrap>
    );
  }

  if (!canCancel) {
    const label = reason === "CUTOFF_PASSED"
      ? "Cancellation closed 8 hours before your shift."
      : "This assignment can no longer be cancelled from the app.";
    return (
      <Wrap>
        <p className="mt-1 flex items-start gap-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{label}{deadlineAt ? ` (Cutoff: ${new Date(deadlineAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })})` : ""}</span>
        </p>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <p className="mt-1 text-xs text-muted-foreground">
        Need to cancel? You can release this assignment before service starts. All customers will be transferred to another partner.
      </p>
      <Button className="mt-3 w-full" variant="outline" disabled={pending} onClick={onCancel}>
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
        Cancel Assignment
      </Button>
    </Wrap>
  );
}


function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold tracking-tight">{value}</p>
    </div>
  );
}
