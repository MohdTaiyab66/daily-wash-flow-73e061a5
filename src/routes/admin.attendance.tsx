import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAttendanceToday } from "@/lib/ops.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/attendance")({
  component: AttendancePage,
});

function AttendancePage() {
  const fn = useServerFn(getAttendanceToday);
  const { data } = useQuery({ queryKey: ["admin-attendance"], queryFn: () => fn() });
  const c = data?.counts;

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Attendance — today</h1>
      <p className="mt-1 text-sm text-muted-foreground">Partner check-ins for {new Date().toLocaleDateString("en-IN")}.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Tile label="Present" value={c?.present ?? 0} tone="bg-emerald-600" />
        <Tile label="Late" value={c?.late ?? 0} tone="bg-amber-500" />
        <Tile label="Absent" value={c?.absent ?? 0} tone="bg-destructive" />
      </div>

      <Card className="mt-6 overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Partner</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Marked at</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3">{r.partners?.full_name} <span className="text-xs text-muted-foreground">· {r.partners?.partner_code}</span></td>
                <td className="px-4 py-3"><Badge variant="outline" className="capitalize">{r.status}</Badge></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.marked_at).toLocaleTimeString()}</td>
              </tr>
            ))}
            {(data?.rows ?? []).length === 0 && (
              <tr><td colSpan={3} className="px-4 py-10 text-center text-sm text-muted-foreground">No attendance recorded today.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${tone}`} />
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
    </Card>
  );
}
