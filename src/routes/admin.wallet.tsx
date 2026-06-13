import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAdminLedger, listAdminAssignmentChanges } from "@/lib/ops.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/wallet")({
  component: WalletPage,
});

function WalletPage() {
  const ledgerFn = useServerFn(listAdminLedger);
  const changeFn = useServerFn(listAdminAssignmentChanges);
  const { data: ledger } = useQuery({ queryKey: ["admin-ledger"], queryFn: () => ledgerFn({ data: {} }) });
  const { data: changes } = useQuery({ queryKey: ["admin-changes"], queryFn: () => changeFn() });

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Wallet & Assignment Changes</h1>
      <p className="mt-1 text-sm text-muted-foreground">Every credit and debit logged · partner-initiated modification history.</p>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Wallet ledger</h2>
      <Card className="mt-2 overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Partner</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3">Note</th>
            </tr>
          </thead>
          <tbody>
            {(ledger ?? []).map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-3">{r.partners?.full_name} <span className="text-xs text-muted-foreground">· {r.partners?.partner_code}</span></td>
                <td className="px-4 py-3"><Badge variant="outline" className="capitalize">{r.entry_type}</Badge></td>
                <td className={`px-4 py-3 text-right tabular-nums ${Number(r.amount) < 0 ? "text-destructive" : "text-emerald-600"}`}>
                  {Number(r.amount) >= 0 ? "+" : ""}₹{Number(r.amount).toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">₹{Number(r.balance_after ?? 0).toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.description}</td>
              </tr>
            ))}
            {(ledger ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No ledger entries yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Assignment modification history</h2>
      <Card className="mt-2 overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Partner</th>
              <th className="px-4 py-3">Area</th>
              <th className="px-4 py-3">Change</th>
              <th className="px-4 py-3">Released customers</th>
            </tr>
          </thead>
          <tbody>
            {(changes ?? []).map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-3">{r.partners?.full_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.assignments?.area ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="capitalize">{r.change_type}</Badge>
                  <span className="ml-2 text-xs text-muted-foreground">{r.previous_target} → {r.new_target} ({r.delta_cars > 0 ? "+" : ""}{r.delta_cars})</span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.released_customer_ids?.length ?? 0}</td>
              </tr>
            ))}
            {(changes ?? []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">No modifications yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
