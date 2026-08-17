import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getEndOfDaySummary } from "@/lib/assignment.functions";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Clock, MapPin, XCircle, IndianRupee, Car } from "lucide-react";

export function EndOfDayCard({ completed: cProp, total: tProp, earnings: eProp }: { completed?: number; total?: number; earnings?: number }) {
  const fn = useServerFn(getEndOfDaySummary);
  const { data } = useQuery({ queryKey: ["eod-summary"], queryFn: () => fn() });
  
  const completed = cProp ?? data?.completed ?? 0;
  const total = tProp ?? data?.total ?? 0;
  const earnings = eProp ?? data?.earnings ?? 0;
  
  if (!data && cProp === undefined) return null;

  return (
    <Card className="border-0 bg-foreground p-5 text-background">
      <p className="text-[10px] uppercase tracking-wider text-background/60">End of day · {new Date().toLocaleDateString("en-IN")}</p>
      <h2 className="mt-1 text-2xl font-semibold">All done for today 🎉</h2>
      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-background/10 pt-4 text-xs">
        <Stat icon={<CheckCircle2 className="h-3 w-3" />} label="Completed" value={`${completed}/${total}`} />
        <Stat icon={<XCircle className="h-3 w-3" />} label="Unavailable" value={String(data?.unavailable ?? 0)} />
        <Stat icon={<MapPin className="h-3 w-3" />} label="Distance" value={`${data?.distance_km ?? 0} km`} />
        <Stat icon={<Clock className="h-3 w-3" />} label="Hours" value={`${data?.hours_worked ?? 0}h`} />
        <Stat icon={<Car className="h-3 w-3" />} label="Cars" value={String(completed)} />
        <Stat icon={<IndianRupee className="h-3 w-3" />} label="Earnings" value={`₹${earnings}`} />
      </div>
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-background/60">{icon}<span>{label}</span></div>
      <p className="mt-1 text-base font-semibold">{value}</p>
    </div>
  );
}
