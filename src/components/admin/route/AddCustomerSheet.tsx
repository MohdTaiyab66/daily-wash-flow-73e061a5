import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, UserPlus, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Hit = {
  customer_id: string;
  service_id: string | null;
  full_name: string | null;
  phone: string | null;
  area: string | null;
  address_line: string | null;
  vehicle_reg: string | null;
  preferred_time: string | null;
  current_partner_id: string | null;
  current_partner_name: string | null;
  status: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  partnerId: string;
  date: string;
  /** Service IDs already in the draft for this partner (to flag duplicates). */
  draftIds: Set<string>;
  onAdd: (serviceId: string) => void;
  /** When the customer is on another partner's route — call this to reassign. */
  onReassign: (serviceId: string, fromPartnerId: string) => Promise<void> | void;
};

export function AddCustomerSheet({ open, onOpenChange, partnerId, date, draftIds, onAdd, onReassign }: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "unassigned" | "other">("all");
  const [rows, setRows] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("admin_route_search_customers" as any, {
        p_query: q, p_date: date,
      });
      if (cancelled) return;
      if (error) toast.error(error.message);
      setRows((data ?? []) as Hit[]);
      setLoading(false);
    };
    const t = setTimeout(run, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, open, date]);

  const visible = rows.filter((r) => {
    if (filter === "unassigned") return !r.current_partner_id;
    if (filter === "other") return r.current_partner_id && r.current_partner_id !== partnerId;
    return true;
  });

  const handleInsert = async (r: Hit) => {
    if (!r.service_id) {
      toast.error("Customer has no Daily Shine service for this date");
      return;
    }
    if (draftIds.has(r.service_id)) {
      toast.message("Already in this route");
      onOpenChange(false);
      return;
    }
    if (r.current_partner_id && r.current_partner_id !== partnerId) {
      const ok = window.confirm(
        `${r.full_name} is currently on ${r.current_partner_name ?? "another partner"}'s route. Move them to this partner?`,
      );
      if (!ok) return;
      await onReassign(r.service_id, r.current_partner_id);
    }
    onAdd(r.service_id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> Add customer to route
          </DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Name, phone, vehicle, society, area…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "unassigned", "other"] as const).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={filter === k ? "default" : "outline"}
              onClick={() => setFilter(k)}
              className="capitalize"
            >
              {k === "other" ? "Other partner" : k}
            </Button>
          ))}
        </div>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          )}
          {!loading && !visible.length && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">No customers match.</p>
          )}
          {visible.map((r) => {
            const dup = r.service_id && draftIds.has(r.service_id);
            const onOther = r.current_partner_id && r.current_partner_id !== partnerId;
            return (
              <button
                key={r.customer_id + (r.service_id ?? "")}
                onClick={() => handleInsert(r)}
                disabled={!!dup || !r.service_id}
                className="flex w-full items-start justify-between gap-2 rounded-md border p-2 text-left text-sm hover:bg-accent disabled:opacity-50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.full_name ?? "—"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.phone ?? "—"} • {r.area ?? "—"} • {r.vehicle_reg ?? "—"}
                  </p>
                  {r.preferred_time && (
                    <p className="text-[10px] text-muted-foreground">Pref {r.preferred_time}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {!r.service_id && (
                    <Badge variant="outline" className="text-[10px]">No service today</Badge>
                  )}
                  {dup && <Badge variant="outline" className="text-[10px]">Already on route</Badge>}
                  {onOther && (
                    <Badge variant="outline" className="border-amber-300 text-[10px] text-amber-700">
                      <AlertTriangle className="mr-1 h-3 w-3" /> {r.current_partner_name ?? "Other"}
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
