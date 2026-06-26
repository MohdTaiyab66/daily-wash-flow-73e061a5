import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { GripVertical, Lock, LockOpen, Zap, RefreshCw, ArrowRightLeft, Loader2 } from "lucide-react";
import { optimizeRoute } from "@/lib/route-optimize";

export const Route = createFileRoute("/admin/route-manager")({
  component: RouteManagerPage,
});

type ServiceRow = {
  id: string;
  partner_id: string | null;
  scheduled_date: string;
  status: string;
  sequence_no: number | null;
  manual_sequence_no: number | null;
  locked_position: boolean | null;
  is_emergency: boolean | null;
  cluster_id: string | null;
  customers: {
    id?: string;
    full_name: string | null;
    area: string | null;
    latitude: number | null;
    longitude: number | null;
    service_required_before: string | null;
    preferred_time: string | null;
    time_window_type: string | null;
    exact_time: string | null;
  } | null;
  vehicles: { make: string | null; model: string | null; registration_number: string | null } | null;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function RouteManagerPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayIso());
  const [partnerId, setPartnerId] = useState<string>("");
  const [order, setOrder] = useState<ServiceRow[] | null>(null);

  const { data: partners } = useQuery({
    queryKey: ["rm-partners", date],
    queryFn: async () => {
      const { data } = await supabase
        .from("services")
        .select("partner_id, profiles!services_partner_id_fkey(full_name)")
        .eq("scheduled_date", date)
        .not("partner_id", "is", null);
      const map = new Map<string, string>();
      (data ?? []).forEach((r: any) => {
        if (r.partner_id) map.set(r.partner_id, r.profiles?.full_name ?? r.partner_id.slice(0, 8));
      });
      return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    },
  });

  useEffect(() => {
    if (!partnerId && partners && partners.length) setPartnerId(partners[0].id);
  }, [partners, partnerId]);

  const { data: services, isFetching } = useQuery({
    queryKey: ["rm-services", date, partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select(
          "id,partner_id,scheduled_date,status,sequence_no,manual_sequence_no,locked_position,is_emergency,cluster_id,customers(full_name,area,latitude,longitude,service_required_before,preferred_time,time_window_type,exact_time),vehicles(make,model,registration_number)",
        )
        .eq("scheduled_date", date)
        .eq("partner_id", partnerId)
        .neq("status", "completed")
        .order("sequence_no", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ServiceRow[];
    },
  });

  useEffect(() => setOrder(services ? [...services] : null), [services]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragEnd(e: DragEndEvent) {
    if (!order) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = order.findIndex((s) => s.id === active.id);
    const newIdx = order.findIndex((s) => s.id === over.id);
    setOrder(arrayMove(order, oldIdx, newIdx));
  }

  async function saveManualOrder() {
    if (!order) return;
    const ids = order.map((s) => s.id);
    const { error } = await supabase.rpc("admin_reorder_services" as any, {
      _partner_id: partnerId,
      _date: date,
      _service_ids: ids,
    });
    if (error) return toast.error(error.message);
    toast.success("Order saved");
    qc.invalidateQueries({ queryKey: ["rm-services"] });
  }

  async function toggleLock(s: ServiceRow) {
    const { error } = await supabase.rpc("admin_lock_service" as any, {
      _service_id: s.id,
      _locked: !s.locked_position,
    });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["rm-services"] });
  }

  async function toggleEmergency(s: ServiceRow) {
    const { error } = await supabase
      .from("services")
      .update({ is_emergency: !s.is_emergency } as any)
      .eq("id", s.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["rm-services"] });
  }

  async function reassign(s: ServiceRow, toPartnerId: string) {
    const { error } = await supabase.rpc("admin_reassign_service" as any, {
      _service_id: s.id,
      _new_partner_id: toPartnerId,
    });
    if (error) return toast.error(error.message);
    toast.success("Reassigned");
    qc.invalidateQueries({ queryKey: ["rm-services"] });
  }

  async function forceRecalculate() {
    const { error } = await supabase.rpc("admin_force_recalculate" as any, {
      _partner_id: partnerId,
      _date: date,
    });
    if (error) return toast.error(error.message);
    toast.success("Route recalculated");
    qc.invalidateQueries({ queryKey: ["rm-services"] });
  }

  // Preview the optimizer (read-only) to show the engine's suggested order.
  const optimizerPreview = useMemo(() => {
    if (!services) return [];
    const stops = services.map((s) => {
      const c = s.customers;
      return {
        id: s.id,
        lat: c?.latitude != null ? Number(c.latitude) : null,
        lng: c?.longitude != null ? Number(c.longitude) : null,
        deadline: c?.service_required_before ?? c?.preferred_time ?? null,
        timeWindowType: ((c?.time_window_type ?? "soft") as "soft" | "exact"),
        exactTime: c?.exact_time ?? null,
        locked: !!s.locked_position,
        manualSequence: s.manual_sequence_no ?? null,
        isEmergency: !!s.is_emergency,
        clusterId: s.cluster_id ?? null,
      };
    });
    const ordered = optimizeRoute(stops);
    return ordered.map((o) => o.id);
  }, [services]);

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Route Manager</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag to reorder, lock priority stops, insert emergencies, or move customers between partners.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Date</Label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="block h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
          </div>
          <div className="min-w-[200px]">
            <Label className="text-xs">Partner</Label>
            <Select value={partnerId} onValueChange={setPartnerId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select partner" /></SelectTrigger>
              <SelectContent>
                {(partners ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={forceRecalculate} disabled={!partnerId}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Force recalculate
          </Button>
          <Button onClick={saveManualOrder} disabled={!order}>Save manual order</Button>
        </div>
      </div>

      {isFetching && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {order && order.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">No pending stops for this partner.</Card>
      )}

      {order && order.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {order.map((s, idx) => (
                <SortableRow
                  key={s.id}
                  service={s}
                  index={idx}
                  suggestedIndex={optimizerPreview.indexOf(s.id)}
                  partners={partners ?? []}
                  onLock={() => toggleLock(s)}
                  onEmergency={() => toggleEmergency(s)}
                  onReassign={(p) => reassign(s, p)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortableRow({
  service: s,
  index,
  suggestedIndex,
  partners,
  onLock,
  onEmergency,
  onReassign,
}: {
  service: ServiceRow;
  index: number;
  suggestedIndex: number;
  partners: Array<{ id: string; name: string }>;
  onLock: () => void;
  onEmergency: () => void;
  onReassign: (partnerId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const c = s.customers;
  const v = s.vehicles;
  const isExact = (c?.time_window_type ?? "soft") === "exact";
  const cutoff = c?.service_required_before ?? c?.preferred_time;
  const drift = suggestedIndex >= 0 ? suggestedIndex - index : 0;

  return (
    <Card ref={setNodeRef} style={style} className="flex items-center gap-3 p-3">
      <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground" aria-label="Drag">
        <GripVertical className="h-5 w-5" />
      </button>
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{c?.full_name ?? "—"}</p>
          {s.locked_position && <Badge variant="outline" className="text-[10px]"><Lock className="mr-1 h-3 w-3" />Locked</Badge>}
          {s.is_emergency && <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive"><Zap className="mr-1 h-3 w-3" />Emergency</Badge>}
          {isExact ? (
            <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive">Exact {c?.exact_time ?? cutoff}</Badge>
          ) : cutoff ? (
            <Badge variant="outline" className="text-[10px]">Soft · before {cutoff}</Badge>
          ) : null}
          {drift !== 0 && (
            <Badge variant="outline" className="text-[10px] text-amber-600">
              Engine suggests {drift > 0 ? `↓${drift}` : `↑${Math.abs(drift)}`}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {v?.make} {v?.model} · {v?.registration_number} · {c?.area ?? "—"}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={onLock} title={s.locked_position ? "Unlock" : "Lock position"}>
          {s.locked_position ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        </Button>
        <div className="flex items-center gap-1.5 rounded-md border border-input px-2 py-1 text-xs">
          <Zap className="h-3 w-3" /> Emergency
          <Switch checked={!!s.is_emergency} onCheckedChange={onEmergency} />
        </div>
        <Select onValueChange={(v) => v && onReassign(v)}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <ArrowRightLeft className="mr-1 h-3 w-3" /> Reassign
          </SelectTrigger>
          <SelectContent>
            {partners.filter((p) => p.id !== s.partner_id).map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Card>
  );
}
