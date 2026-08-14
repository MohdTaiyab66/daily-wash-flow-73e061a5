import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/addon-queue")({
  ssr: true,
  head: () => ({ meta: [{ title: "Subscription Add-on Queue · Admin" }] }),
  component: AddonQueuePage,
});

type Row = {
  id: string; subscription_id: string | null; user_id: string;
  customer_name: string | null; customer_phone: string | null;
  vehicle_label: string | null; service_name: string | null;
  preferred_date: string | null; preferred_time: string | null;
  status: string; assigned_detailer_name: string | null;
  notes: string | null; created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-amber-100 text-amber-900",
  scheduled: "bg-blue-100 text-blue-900",
  in_progress: "bg-indigo-100 text-indigo-900",
  completed: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-rose-100 text-rose-900",
};

function AddonQueuePage() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const rowsQ = useQuery({
    queryKey: ["addon-queue"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("subscription_addon_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`admin-addon-queue-${crypto.randomUUID()}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "subscription_addon_requests" },
        () => qc.invalidateQueries({ queryKey: ["addon-queue"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const updateStatus = useMutation({
    mutationFn: async (v: { id: string; status: string; detailerName?: string }) => {
      const patch: any = { status: v.status };
      if (v.status === "completed") patch.completed_at = new Date().toISOString();
      if (v.status === "cancelled") patch.cancelled_at = new Date().toISOString();
      if (v.detailerName) patch.assigned_detailer_name = v.detailerName;
      const { error } = await supabase.from("subscription_addon_requests").update(patch).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["addon-queue"] }); setBusy(null); },
    onError: (e: any) => { toast.error(e.message); setBusy(null); },
  });

  const schedule = (id: string) => {
    const name = prompt("Detailer name?") || "";
    if (!name) return;
    setBusy(id);
    updateStatus.mutate({ id, status: "scheduled", detailerName: name });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" /> Subscription Add-on Queue
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add-on requests from Daily Shine subscribers (Interior / Exterior / Pressure Wash).
          These never go to the partner marketplace — admin schedules the detailing team.
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Preferred</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Detailer</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rowsQ.isLoading && (
                <tr><td colSpan={8} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
              )}
              {!rowsQ.isLoading && (rowsQ.data ?? []).length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No add-on requests yet.</td></tr>
              )}
              {(rowsQ.data ?? []).map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.customer_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.customer_phone}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{r.vehicle_label ?? "—"}</td>
                  <td className="px-4 py-3 font-medium">{r.service_name}</td>
                  <td className="px-4 py-3 text-xs">{r.preferred_date ?? "—"}<br />{r.preferred_time ?? ""}</td>
                  <td className="px-4 py-3"><Badge className={STATUS_COLORS[r.status] ?? ""}>{r.status}</Badge></td>
                  <td className="px-4 py-3 text-xs">{r.assigned_detailer_name ?? <span className="italic text-muted-foreground">unassigned</span>}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {r.status === "new" && <Button size="sm" disabled={busy === r.id} onClick={() => schedule(r.id)}>Schedule</Button>}
                      {r.status === "scheduled" && <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: r.id, status: "in_progress" })}>Start</Button>}
                      {(r.status === "scheduled" || r.status === "in_progress") && (
                        <Button size="sm" variant="ghost" onClick={() => updateStatus.mutate({ id: r.id, status: "completed" })}>Complete</Button>
                      )}
                      {r.status !== "completed" && r.status !== "cancelled" && (
                        <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => updateStatus.mutate({ id: r.id, status: "cancelled" })}>Cancel</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
