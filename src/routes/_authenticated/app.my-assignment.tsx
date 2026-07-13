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
import { Briefcase, Calendar, CheckCircle2, IndianRupee, Lock, Navigation, Phone, Wallet, TrendingUp, XCircle, Loader2 } from "lucide-react";
import { ModifyAssignmentDialog } from "@/components/ModifyAssignmentDialog";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { toast } from "sonner";
import { useState } from "react";

const SUPPORT_TEL = "+911800000000";

export const Route = createFileRoute("/_authenticated/app/my-assignment")({
  component: MyAssignmentPage,
});

function MyAssignmentPage() {
  const fn = useServerFn(getMyAssignment);
  const cancelFn = useServerFn(cancelMyAssignment);
  const canFn = useServerFn(getAssignmentCancellability);
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  useRealtimeInvalidation(["assignments", "services", "customers", "vehicles", "wallet_ledger"], [["my-assignment"], ["cancellability"], ["today-assignment"]]);
  const myQuery = useQuery({
    queryKey: ["my-assignment"],
    queryFn: () => fn(),
    refetchInterval: 30000,
    retry: 4,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
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
      if (code === "ROUTE_STARTED") {
        toast.error("Route already started. Please contact Partner Support.");
      } else if (code === "CUTOFF_PASSED") {
        toast.error("Cancellation window closed (8 hours before start).");
      } else {
        toast.error(e?.message ?? "Cancel failed");
      }
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["cancellability", assignmentId] });
    },
  });


  if (data === undefined) return <div className="mx-auto max-w-md p-5 text-sm text-muted-foreground">Loading…</div>;
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

  const a = data.assignment as any;
  const workingDaysLabel = (n: number) => `${n} Working Day${n === 1 ? "" : "s"}`;

  return (
    <div className="mx-auto max-w-md px-5 pt-5 pb-10">
      <h1 className="text-2xl font-semibold tracking-tight">My assignment</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {a.area} · {workingDaysLabel(data.working_days_completed)} of {workingDaysLabel(data.working_days_total)} completed
        {a.auto_renew ? " · Auto-renew ON" : ""}
      </p>

      <Card className="mt-5 border-0 bg-foreground p-5 text-background">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-background/60">Active</p>
            <p className="mt-1 text-3xl font-semibold">{a.target_cars} cars/day</p>
            <p className="mt-0.5 text-xs text-background/60">
              {a.start_date} → {a.end_date} · {workingDaysLabel(data.working_days_total)}
            </p>
          </div>
          <Badge className="border-0 bg-primary text-primary-foreground">Active</Badge>
        </div>
        <div className="mt-4 h-1.5 rounded-full bg-background/15">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${data.progress_pct}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-background/60">
          <span>{data.progress_pct}% complete</span>
          <span>{data.completed_cars}/{data.total_cars} services</span>
        </div>
      </Card>

      {/* Assignment breakdown — dynamic to any duration */}
      <Card className="mt-4 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assignment</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <MiniLight label="Duration" value={workingDaysLabel(data.working_days_total)} />
          <MiniLight label="Completed" value={workingDaysLabel(data.working_days_completed)} />
          <MiniLight label="Remaining" value={workingDaysLabel(data.working_days_remaining)} />
          <MiniLight label="Hours / day" value={`${data.hours_per_day} Hour${data.hours_per_day === 1 ? "" : "s"}`} />
        </div>
      </Card>

      {/* Today */}
      <Card className="mt-4 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <MiniLight label="Today's customers" value={String(data.todays_customers)} />
          <MiniLight label="Expected earnings today" value={`₹${data.expected_earnings_today.toLocaleString("en-IN")}`} />
          <MiniLight label="Completed today" value={String(data.completed_today)} />
          <MiniLight label="Remaining today" value={String(data.remaining_today)} />
        </div>
      </Card>

      {/* Earnings */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Tile icon={<TrendingUp className="h-3.5 w-3.5" />} label="Expected total" value={`₹${data.expected_total.toLocaleString("en-IN")}`} />
        <Tile icon={<IndianRupee className="h-3.5 w-3.5" />} label="Earned so far" value={`₹${data.earned.toLocaleString("en-IN")}`} />
        <Tile icon={<Wallet className="h-3.5 w-3.5" />} label="Available payout" value={`₹${data.available_payout.toLocaleString("en-IN")}`} />
        <Tile icon={<Wallet className="h-3.5 w-3.5" />} label="Held" value={`₹${data.held.toLocaleString("en-IN")}`} />
        <Tile icon={<Calendar className="h-3.5 w-3.5" />} label="Next payout" value={data.next_payout_date} />
        <Tile icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Customers assigned" value={String(data.total_cars)} />
      </div>

      <Card className="mt-4 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modifications</p>
        <p className="mt-2 text-sm">
          Used <b>{data.modifications_used}</b> of <b>{data.modifications_max}</b>. One change every 2 days.
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

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button asChild variant="outline"><Link to="/app/live"><Navigation className="mr-2 h-4 w-4" />Today's route</Link></Button>
        <Button asChild variant="outline"><Link to="/app/earnings"><Wallet className="mr-2 h-4 w-4" />Wallet</Link></Button>
      </div>
      <CancelSection
        canCancel={!!cancelInfo?.can_cancel}
        reason={cancelInfo?.reason}
        deadlineAt={cancelInfo?.deadline_at ?? null}
        routeStarted={!!cancelInfo?.route_started}
        pending={cancelMut.isPending}
        onCancel={() => setConfirmOpen(true)}
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

function CancelSection({ canCancel, reason, deadlineAt, routeStarted, pending, onCancel }: {
  canCancel: boolean; reason?: string; deadlineAt: string | null; routeStarted: boolean; pending: boolean; onCancel: () => void;
}) {
  if (routeStarted || reason === "ROUTE_STARTED") {
    return (
      <Card className="mt-3 p-4">
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
      ? "Assignment is locked because route planning has started. Cancellation closed 8 hours before your shift."
      : "This assignment can no longer be cancelled from the app.";
    return (
      <Card className="mt-3 flex items-start gap-2 p-3 text-xs text-muted-foreground">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{label}{deadlineAt ? ` (Cutoff: ${new Date(deadlineAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })})` : ""}</span>
      </Card>
    );
  }
  return (
    <Button className="mt-3 w-full" variant="outline" disabled={pending} onClick={onCancel}>
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
      Cancel assignment
    </Button>
  );
}


function MiniLight({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">{icon}<span className="text-[10px] uppercase tracking-wider">{label}</span></div>
      <p className="mt-1.5 text-lg font-semibold tracking-tight">{value}</p>
    </Card>
  );
}
