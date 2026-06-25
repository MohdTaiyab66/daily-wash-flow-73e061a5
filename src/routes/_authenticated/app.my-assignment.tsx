import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { cancelMyAssignment, getMyAssignment } from "@/lib/assignment.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Briefcase, Calendar, CheckCircle2, Clock, IndianRupee, MapPin, Navigation, Wallet, TrendingUp, XCircle, Loader2 } from "lucide-react";
import { ModifyAssignmentDialog } from "@/components/ModifyAssignmentDialog";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app/my-assignment")({
  component: MyAssignmentPage,
});

function MyAssignmentPage() {
  const fn = useServerFn(getMyAssignment);
  const cancelFn = useServerFn(cancelMyAssignment);
  const qc = useQueryClient();
  const [partnerId, setPartnerId] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setPartnerId(data.user?.id ?? null)); }, []);
  useRealtimeInvalidation(["assignments", "services", "customers", "vehicles", "wallet_ledger"], [["my-assignment"]]);
  const { data } = useQuery({ queryKey: ["my-assignment"], queryFn: () => fn(), refetchInterval: 30000 });
  const cancelMut = useMutation({
    mutationFn: (assignmentId: string) => cancelFn({ data: { assignment_id: assignmentId } }),
    onSuccess: () => { toast.success("Assignment cancelled"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e?.message ?? "Cancel failed"),
  });

  if (data === undefined) return <div className="mx-auto max-w-md p-5 text-sm text-muted-foreground">Loading…</div>;
  if (data === null) {
    return (
      <div className="mx-auto max-w-md px-5 pt-5">
        <DailyShineOfferCard partnerId={partnerId} />
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

  return (
    <div className="mx-auto max-w-md px-5 pt-5 pb-10">
      <h1 className="text-2xl font-semibold tracking-tight">My assignment</h1>
      <p className="mt-1 text-sm text-muted-foreground">{a.area} · Day {data.day_progress} of {a.duration_days}</p>

      <DailyShineOfferCard partnerId={partnerId} />

      <Card className="mt-5 border-0 bg-foreground p-5 text-background">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-background/60">Active</p>
            <p className="mt-1 text-3xl font-semibold">{a.target_cars} cars/day</p>
            <p className="mt-0.5 text-xs text-background/60">
              {a.start_date} → {a.end_date} · {a.working_days} working days
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

      {/* Today */}
      <Card className="mt-4 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
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
        <Tile icon={<Clock className="h-3.5 w-3.5" />} label="Total services" value={String(data.total_cars)} />
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
      <Button className="mt-3 w-full" variant="outline" disabled={cancelMut.isPending} onClick={() => confirm("Cancel this assignment and release pending customers?") && cancelMut.mutate(a.id)}>
        {cancelMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
        Cancel assignment
      </Button>
    </div>
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
