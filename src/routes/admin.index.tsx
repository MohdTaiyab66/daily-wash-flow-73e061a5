import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminOverview } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Users, UserSquare2, ClipboardList, IndianRupee, CalendarDays, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: Overview,
});

function Overview() {
  const fn = useServerFn(getAdminOverview);
  const { data } = useQuery({ queryKey: ["admin-overview"], queryFn: () => fn() });

  const stats = [
    { label: "Active Partners", value: data?.partners ?? 0, icon: Users },
    { label: "Customers", value: data?.customers ?? 0, icon: UserSquare2 },
    { label: "Total Services", value: data?.services ?? 0, icon: ClipboardList },
    { label: "Completed", value: data?.completed ?? 0, icon: CheckCircle2 },
    { label: "Today's Services", value: data?.todayServices ?? 0, icon: CalendarDays },
    { label: "Revenue (₹)", value: data?.revenue ?? 0, icon: IndianRupee },
  ];

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
      <p className="mt-1 text-sm text-muted-foreground">Urban Wash · Lucknow</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</p>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{typeof s.value === "number" ? s.value.toLocaleString() : s.value}</p>
            </Card>
          );
        })}
      </div>

      <Card className="mt-8 p-6">
        <h2 className="text-lg font-semibold tracking-tight">Roadmap</h2>
        <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <li>· Customer App with subscriptions</li>
          <li>· Auto-reassignment on no-show</li>
          <li>· AI route optimization</li>
          <li>· Heat maps & demand zones</li>
          <li>· Dynamic pricing & weather scheduling</li>
          <li>· Partner leaderboards & badges</li>
          <li>· Advanced analytics</li>
          <li>· Multi-city expansion (Kanpur, Delhi-NCR)</li>
        </ul>
      </Card>
    </div>
  );
}
