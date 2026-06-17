import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTrialReadinessReport } from "@/lib/ops.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { CheckCircle2, Clock, Users, UserSquare2, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/admin/trial-readiness")({
  component: TrialReadinessPage,
});

function TrialReadinessPage() {
  const fn = useServerFn(getTrialReadinessReport);
  useRealtimeInvalidation(["customers", "partners", "assignments", "services"], [["trial-readiness"]]);
  const { data } = useQuery({ queryKey: ["trial-readiness"], queryFn: () => fn(), refetchInterval: 15000 });

  const pending = data?.pendingServices ?? 0;
  const active = data?.activeCustomers ?? 0;
  const assigned = data?.assignedCustomers ?? 0;
  const status = active > 0 && assigned > 0 ? "Operational" : "Needs setup";

  const tiles = [
    { label: "Active Customers", value: data?.activeCustomers ?? 0, icon: UserSquare2 },
    { label: "Assigned Customers", value: data?.assignedCustomers ?? 0, icon: Users },
    { label: "Available Customers", value: data?.availableCustomers ?? 0, icon: UserSquare2 },
    { label: "Active Partners", value: data?.activePartners ?? 0, icon: Users },
    { label: "Services Today", value: data?.servicesToday ?? 0, icon: ClipboardList },
    { label: "Pending Services", value: pending, icon: Clock },
    { label: "Completed Services", value: data?.completedServices ?? 0, icon: CheckCircle2 },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Trial Readiness</h1>
          <p className="mt-1 text-sm text-muted-foreground">Live pilot health report for launch operations.</p>
        </div>
        <Badge variant={status === "Operational" ? "default" : "secondary"}>{status}</Badge>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Card key={t.label} className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{t.label}</p>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{Number(t.value).toLocaleString("en-IN")}</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}