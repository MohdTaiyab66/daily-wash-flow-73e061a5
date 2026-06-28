import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Printer, Search, Filter, ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/service-leads")({
  ssr: false,
  head: () => ({ meta: [{ title: "Service Leads · Admin" }] }),
  component: ServiceLeadsPage,
});

type Lead = {
  id: string; booking_id: string | null; user_id: string;
  customer_name: string | null; customer_phone: string | null;
  vehicle_label: string | null; address_text: string | null;
  service_name: string | null; service_slug: string | null;
  service_category: string; price: number; payment_status: string | null;
  scheduled_date: string | null; scheduled_time: string | null;
  status: string; assigned_detailer_id: string | null; assigned_detailer_name: string | null;
  notes: string | null; photos: string[]; created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-amber-100 text-amber-900",
  assigned: "bg-blue-100 text-blue-900",
  in_progress: "bg-indigo-100 text-indigo-900",
  completed: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-rose-100 text-rose-900",
};

function ServiceLeadsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editLead, setEditLead] = useState<Lead | null>(null);

  const leadsQ = useQuery({
    queryKey: ["service-leads"],
    queryFn: async (): Promise<Lead[]> => {
      const { data, error } = await supabase
        .from("service_leads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  // Realtime invalidation
  useEffect(() => {
    const ch = supabase
      .channel(`admin-service-leads-${crypto.randomUUID()}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "service_leads" },
        () => qc.invalidateQueries({ queryKey: ["service-leads"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const detailersQ = useQuery({
    queryKey: ["admin-detailers"],
    queryFn: async () => {
      // We treat all partners as a pool that admin can manually assign for premium work
      const { data, error } = await supabase
        .from("partners")
        .select("id,full_name,phone,city")
        .eq("status", "active")
        .order("full_name")
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (leadsQ.data ?? []).filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (categoryFilter !== "all" && l.service_category !== categoryFilter) return false;
      if (!t) return true;
      return (
        (l.customer_name || "").toLowerCase().includes(t) ||
        (l.customer_phone || "").includes(t) ||
        (l.service_name || "").toLowerCase().includes(t) ||
        (l.vehicle_label || "").toLowerCase().includes(t)
      );
    });
  }, [leadsQ.data, q, statusFilter, categoryFilter]);

  const counts = useMemo(() => {
    const c = { new: 0, assigned: 0, in_progress: 0, completed: 0, cancelled: 0 };
    (leadsQ.data ?? []).forEach((l) => { (c as any)[l.status] = ((c as any)[l.status] ?? 0) + 1; });
    return c;
  }, [leadsQ.data]);

  const assignMut = useMutation({
    mutationFn: async (v: { leadId: string; detailerId: string; detailerName: string }) => {
      const { error } = await supabase.rpc("admin_assign_lead", {
        p_lead_id: v.leadId, p_detailer_id: v.detailerId, p_detailer_name: v.detailerName,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Detailer assigned"); qc.invalidateQueries({ queryKey: ["service-leads"] }); setEditLead(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const completeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("admin_complete_lead", { p_lead_id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Lead completed"); qc.invalidateQueries({ queryKey: ["service-leads"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: async (id: string) => {
      const reason = prompt("Cancel reason?") || "Cancelled by admin";
      const { error } = await supabase.rpc("admin_cancel_lead", { p_lead_id: id, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Lead cancelled"); qc.invalidateQueries({ queryKey: ["service-leads"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const exportCSV = () => {
    const headers = ["id", "created_at", "customer", "phone", "vehicle", "service", "category", "price", "status", "assigned_to", "scheduled_date", "scheduled_time"];
    const rows = filtered.map((l) => [
      l.id, l.created_at, l.customer_name ?? "", l.customer_phone ?? "",
      l.vehicle_label ?? "", l.service_name ?? "", l.service_category,
      l.price, l.status, l.assigned_detailer_name ?? "",
      l.scheduled_date ?? "", l.scheduled_time ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `service-leads-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" /> Service Leads
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Premium and one-time bookings handled by the admin operations team.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(["new", "assigned", "in_progress", "completed", "cancelled"] as const).map((k) => (
          <Card key={k} className="p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k.replace("_", " ")}</div>
            <div className="text-2xl font-semibold mt-1">{counts[k]}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search customer, phone, service, vehicle…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><Filter className="h-4 w-4 mr-1.5" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="one_time">One-time</SelectItem>
              <SelectItem value="deep_clean">Deep clean</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
              <SelectItem value="addon">Add-on</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Detailer</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {leadsQ.isLoading && (
                <tr><td colSpan={9} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
              )}
              {!leadsQ.isLoading && filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">No leads match these filters.</td></tr>
              )}
              {filtered.map((l) => (
                <tr key={l.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{l.customer_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{l.customer_phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{l.service_name}</div>
                    <div className="text-xs text-muted-foreground">{l.service_category}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{l.vehicle_label ?? "—"}</td>
                  <td className="px-4 py-3 font-semibold">₹{l.price}</td>
                  <td className="px-4 py-3 text-xs">{l.scheduled_date ?? "—"}<br />{l.scheduled_time ?? ""}</td>
                  <td className="px-4 py-3"><Badge className={STATUS_COLORS[l.status] ?? ""}>{l.status}</Badge></td>
                  <td className="px-4 py-3 text-xs">{l.assigned_detailer_name ?? <span className="text-muted-foreground italic">unassigned</span>}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditLead(l)}>Assign</Button>
                      {l.status !== "completed" && l.status !== "cancelled" && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => completeMut.mutate(l.id)}>Complete</Button>
                          <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => cancelMut.mutate(l.id)}>Cancel</Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!editLead} onOpenChange={(o) => !o && setEditLead(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign detailer</DialogTitle></DialogHeader>
          {editLead && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-3 text-sm">
                <div className="font-medium">{editLead.service_name}</div>
                <div className="text-xs text-muted-foreground">{editLead.customer_name} · {editLead.vehicle_label}</div>
              </div>
              <div>
                <Label>Detailer</Label>
                <Select onValueChange={(v) => {
                  const d = (detailersQ.data ?? []).find((x: any) => x.id === v);
                  if (d) assignMut.mutate({ leadId: editLead.id, detailerId: d.id, detailerName: d.full_name ?? "Detailer" });
                }}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Pick a detailer" /></SelectTrigger>
                  <SelectContent>
                    {(detailersQ.data ?? []).map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>{d.full_name} · {d.city}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditLead(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
