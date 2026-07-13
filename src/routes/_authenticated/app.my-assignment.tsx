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
import { Briefcase, CheckCircle2, Clock, Lock, Navigation, Phone, Wallet, XCircle, Loader2, LifeBuoy, MapPin } from "lucide-react";
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
    <div className="mx-auto max-w-md px-5 pt-5 pb-10">
      <h1 className="text-2xl font-semibold tracking-tight">Assignment Details</h1>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" /> {a.area}
        <span className="mx-1">·</span>
        <Badge variant="secondary" className="rounded-full">Active</Badge>
      </p>

      {/* Assignment Summary */}
      <Card className="mt-5 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assignment Summary</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Mini label="Duration" value={workingDaysLabel(data.working_days_total)} />
          <Mini label="Completed" value={`${data.working_days_completed} Days`} />
          <Mini label="Remaining" value={`${data.working_days_remaining} Days`} />
          <Mini label="Daily route" value={`${a.target_cars} cars/day`} />
          <Mini label="Working hours" value={workingHoursLabel} />
          <Mini label="Estimated total" value={`₹${estMonthly.toLocaleString("en-IN")}`} />
        </div>
      </Card>

      {/* Today's Status — one state only */}
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

      {/* Modifications — simplified */}
      <Card className="mt-4 p-4">
        <p className="text-sm font-semibold">Modify Assignment</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {data.can_modify
            ? `${Math.max(0, data.modifications_max - data.modifications_used)} modification${(data.modifications_max - data.modifications_used) === 1 ? "" : "s"} remaining`
            : data.cooldown_until
            ? `Available after ${new Date(data.cooldown_until).toLocaleDateString("en-IN", { weekday: "long" })}`
            : "No modifications remaining"}
        </p>
        <div className="mt-3">
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

      {/* Bottom actions — Today's Route / Wallet / Support */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3">
          <Link to="/app/live">
            <Navigation className="h-4 w-4" />
            <span className="text-xs">Today's Route</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3">
          <Link to="/app/earnings">
            <Wallet className="h-4 w-4" />
            <span className="text-xs">Wallet</span>
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3">
          <a href={`tel:${SUPPORT_TEL}`}>
            <LifeBuoy className="h-4 w-4" />
            <span className="text-xs">Support</span>
          </a>
        </Button>
      </div>

      <CancelSection
        canCancel={!!cancelInfo?.can_cancel}
        reason={cancelInfo?.reason}
        deadlineAt={cancelInfo?.deadline_at ?? null}
        routeStarted={!!cancelInfo?.route_started}
        pending={cancelMut.isPending}
        onCancel={() => setConfirmOpen(true)}
        isRestDay={todayState === "rest"}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel today's assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              Your reserved customers will be released and assigned to another partner.
              You can create a new assignment later if routes are still available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMut.isPending}>Keep assignment</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelMut.isPending}
              onClick={(e) => { e.preventDefault(); if (assignmentId) cancelMut.mutate(assignmentId); }}
            >
              {cancelMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Cancel assignment
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
      <Card className="mt-4 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today's Route</p>
        <div className="mt-2 flex items-baseline gap-3">
          <p className="text-2xl font-semibold">{totalToday} Customers</p>
          <p className="text-sm text-muted-foreground">Expected ₹{expectedToday.toLocaleString("en-IN")}</p>
        </div>
        <Button asChild size="lg" className="mt-4 h-12 w-full rounded-2xl">
          <Link to="/app/live"><Navigation className="mr-2 h-4 w-4" />Start Today's Route</Link>
        </Button>
      </Card>
    );
  }

  if (state === "in_progress") {
    return (
      <Card className="mt-4 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today's Route</p>
        <p className="mt-2 text-sm text-muted-foreground">
          <b className="text-foreground">{completedToday}/{totalToday}</b> completed
        </p>
        <Button asChild size="lg" className="mt-4 h-12 w-full rounded-2xl">
          <Link to="/app/live"><Navigation className="mr-2 h-4 w-4" />Continue Today's Route</Link>
        </Button>
      </Card>
    );
  }

  // done
  return (
    <Card className="mt-4 p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today's Status</p>
      <div className="mt-2 flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-[color:var(--success)]" />
        <p className="text-lg font-semibold">Today's route completed</p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {completedToday}/{totalToday} customers served · Earned ₹{earnedToday.toLocaleString("en-IN")} today
      </p>
      <Button asChild size="lg" variant="outline" className="mt-4 h-12 w-full rounded-2xl">
        <Link to="/app/live">View Completed Route</Link>
      </Button>
    </Card>
  );
}

function CancelSection({ canCancel, reason, deadlineAt, routeStarted, pending, onCancel }: {
  canCancel: boolean; reason?: string; deadlineAt: string | null; routeStarted: boolean; pending: boolean; onCancel: () => void;
}) {
  if (routeStarted || reason === "ROUTE_STARTED") {
    return (
      <Card className="mt-4 p-4">
        <p className="text-sm font-medium">Need to stop working today?</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Assignment already started. Once your route has started, it cannot be cancelled from the app.
          Please contact Partner Support if you need assistance.
        </p>
        <Button asChild className="mt-3 w-full" variant="outline">
          <a href={`tel:${SUPPORT_TEL}`}><Phone className="mr-2 h-4 w-4" />Call Partner Support</a>
        </Button>
      </Card>
    );
  }
  if (!canCancel) {
    const label = reason === "CUTOFF_PASSED"
      ? "Cancellation closed 8 hours before your shift."
      : "This assignment can no longer be cancelled from the app.";
    return (
      <Card className="mt-4 flex items-start gap-2 p-3 text-xs text-muted-foreground">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{label}{deadlineAt ? ` (Cutoff: ${new Date(deadlineAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })})` : ""}</span>
      </Card>
    );
  }
  return (
    <Button className="mt-4 w-full" variant="outline" disabled={pending} onClick={onCancel}>
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
      Cancel assignment
    </Button>
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
