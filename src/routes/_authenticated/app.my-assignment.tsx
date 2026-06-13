import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAssignment } from "@/lib/assignment.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Briefcase, Calendar, CheckCircle2, Clock, IndianRupee, MapPin, Navigation, Wallet } from "lucide-react";
import { ModifyAssignmentDialog } from "@/components/ModifyAssignmentDialog";

export const Route = createFileRoute("/_authenticated/app/my-assignment")({
  component: MyAssignmentPage,
});

function MyAssignmentPage() {
  const fn = useServerFn(getMyAssignment);
  const { data } = useQuery({ queryKey: ["my-assignment"], queryFn: () => fn() });

  if (data === undefined) return <div className="mx-auto max-w-md p-5 text-sm text-muted-foreground">Loading…</div>;
  if (data === null) {
    return (
      <div className="mx-auto max-w-md px-5 pt-5">
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <Briefcase className="h-6 w-6 text-muted-foreground" />
          <p className="font-medium">No active assignment</p>
          <p className="text-sm text-muted-foreground">Build one from the marketplace.</p>
          <Button asChild><Link to="/app/assignments">Build assignment</Link></Button>
        </Card>
      </div>
    );
  }

  const a = data.assignment as any;
  const progressPct = data.total_cars > 0 ? (data.completed_cars / data.total_cars) * 100 : 0;

  return (
    <div className="mx-auto max-w-md px-5 pt-5 pb-10">
      <h1 className="text-2xl font-semibold tracking-tight">My assignment</h1>
      <p className="mt-1 text-sm text-muted-foreground">{a.area} · Day {data.day_progress} of {a.duration_days}</p>

      <Card className="mt-5 border-0 bg-foreground p-5 text-background">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-background/60">Active</p>
            <p className="mt-1 text-3xl font-semibold">{a.target_cars} cars/day</p>
            <p className="mt-0.5 text-xs text-background/60">
              {a.duration_days} days · {a.working_days} working · ends {a.end_date}
            </p>
          </div>
          <Badge className="border-0 bg-primary text-primary-foreground">Active</Badge>
        </div>
        <div className="mt-4 h-1.5 rounded-full bg-background/15">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-background/10 pt-4 text-xs">
          <Mini label="Done" value={String(data.completed_cars)} />
          <Mini label="Left" value={String(data.remaining_cars)} />
          <Mini label="Total" value={String(data.total_cars)} />
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Tile icon={<IndianRupee className="h-3.5 w-3.5" />} label="Earned" value={`₹${data.earned.toLocaleString("en-IN")}`} />
        <Tile icon={<Wallet className="h-3.5 w-3.5" />} label="Held" value={`₹${data.held.toLocaleString("en-IN")}`} />
        <Tile icon={<Calendar className="h-3.5 w-3.5" />} label="Next payout" value={data.next_payout_date} />
        <Tile icon={<Clock className="h-3.5 w-3.5" />} label="Day progress" value={`${data.day_progress}/${a.duration_days}`} />
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
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-background/60">{label}</p>
      <p className="mt-0.5 text-base font-semibold">{value}</p>
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
