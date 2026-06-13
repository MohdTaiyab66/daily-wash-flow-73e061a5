import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPartnerReliability } from "@/lib/ops.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/reliability")({
  component: ReliabilityPage,
});

function ReliabilityPage() {
  const fn = useServerFn(listPartnerReliability);
  const { data } = useQuery({ queryKey: ["admin-reliability"], queryFn: () => fn() });

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Partner Reliability</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Composite score = 30% attendance + 40% completion + 30% on-time − 2 per complaint.
      </p>
      <Card className="mt-6 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Partner</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Attendance</th>
                <th className="px-4 py-3">Completion</th>
                <th className="px-4 py-3">On-time</th>
                <th className="px-4 py-3">Complaints</th>
                <th className="px-4 py-3">Cars done</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((p: any) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <p className="font-medium">{p.full_name}</p>
                    <p className="text-[11px] text-muted-foreground">{p.partner_code}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={scoreClass(p.score)}>{p.score ?? 0}</Badge>
                  </td>
                  <td className="px-4 py-3">{p.attendance_pct ?? 0}%</td>
                  <td className="px-4 py-3">{p.completion_pct ?? 0}%</td>
                  <td className="px-4 py-3">{p.ontime_pct ?? 0}%</td>
                  <td className="px-4 py-3">{p.complaints ?? 0}</td>
                  <td className="px-4 py-3">{p.completed_services ?? 0}/{p.total_services ?? 0}</td>
                </tr>
              ))}
              {(data ?? []).length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">No partners yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function scoreClass(score: number) {
  if (score >= 90) return "bg-emerald-600 hover:bg-emerald-600";
  if (score >= 75) return "bg-amber-500 hover:bg-amber-500";
  return "bg-destructive hover:bg-destructive";
}
