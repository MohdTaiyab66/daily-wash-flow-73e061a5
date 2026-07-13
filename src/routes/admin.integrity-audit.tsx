import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/admin/integrity-audit")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin · Integrity Audit" }] }),
  component: IntegrityAuditPage,
});

type Row = {
  id: string;
  partner_id: string | null;
  assignment_id: string | null;
  mismatches: string[];
  todays_services: number;
  todays_customers: number;
  total_services: number;
  services_missing_customer: number;
  services_wrong_partner: number;
  source: string | null;
  created_at: string;
};

function IntegrityAuditPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin", "integrity-audit"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("assignment_integrity_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 30_000,
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assignment integrity audit</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mismatches detected by <code>validateTodayAssignment</code> for partner today-assignment queries.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {isLoading ? (
        <Card className="mt-5 p-6 text-sm text-muted-foreground">Loading audit entries…</Card>
      ) : error ? (
        <Card className="mt-5 p-6 text-sm text-destructive">Failed to load: {(error as any).message}</Card>
      ) : !data || data.length === 0 ? (
        <Card className="mt-5 p-6 text-sm text-muted-foreground">
          No integrity mismatches recorded. ✅
        </Card>
      ) : (
        <Card className="mt-5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">When</th>
                  <th className="px-4 py-2 text-left">Partner</th>
                  <th className="px-4 py-2 text-left">Assignment</th>
                  <th className="px-4 py-2 text-left">Reasons</th>
                  <th className="px-4 py-2 text-right">Today svc</th>
                  <th className="px-4 py-2 text-right">Today cust</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">Miss cust</th>
                  <th className="px-4 py-2 text-right">Wrong ptnr</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{r.partner_id?.slice(0, 8) ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.assignment_id?.slice(0, 8) ?? "—"}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {r.mismatches.map((m) => (
                          <Badge key={m} variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {m}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.todays_services}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.todays_customers}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.total_services}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.services_missing_customer}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.services_wrong_partner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
