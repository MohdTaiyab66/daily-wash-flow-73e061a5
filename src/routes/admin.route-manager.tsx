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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  GripVertical, Lock, LockOpen, Zap, RefreshCw, ArrowRightLeft,
  Loader2, Phone, Navigation, History as HistoryIcon, ListChecks,
  Map as MapIcon, LayoutGrid, Sparkles, Trash2, ChevronUp, ChevronDown,
  Circle, Activity,
} from "lucide-react";
import { optimizeRoute } from "@/lib/route-optimize";
import { RouteMapPanel, type MapStop } from "@/components/admin/route/RouteMapPanel";

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
    phone: string | null;
    area: string | null;
    address_line?: string | null;
    latitude: number | null;
    longitude: number | null;
    service_required_before: string | null;
    preferred_time: string | null;
    time_window_type: string | null;
    exact_time: string | null;
  } | null;
  vehicles: {
    make: string | null; model: string | null; registration_number: string | null;
  } | null;
};

type Partner = {
  id: string;
  full_name: string | null;
  phone: string | null;
  profile_photo_url: string | null;
  status: string | null;
  last_seen: string | null;
  current_lat: number | null;
  current_lng: number | null;
  home_lat: number | null;
  home_lng: number | null;
  rating: number | null;
  reliability_score: number | null;
  home_area: string | null;
};

function todayIso() { return new Date().toISOString().slice(0, 10); }
function fmt(n: number | null | undefined, d = 1) {
  return n == null ? "—" : Number(n).toFixed(d);
}

function RouteManagerPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayIso());
  const [partnerId, setPartnerId] = useState<string>("");
  const [order, setOrder] = useState<ServiceRow[] | null>(null);
  const [selectedStop, setSelectedStop] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "ops_manager" | "viewer">("viewer");

  // role check
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" } as any);
      if (data) return setRole("admin");
      const { data: om } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "ops_manager" as any } as any);
      setRole(om ? "ops_manager" : "viewer");
    })();
  }, []);
  const canEdit = role === "admin" || role === "ops_manager";

  // partner list (anyone with services that day)
  const { data: partners } = useQuery({
    queryKey: ["rm-partners-full", date],
    queryFn: async () => {
      const { data: svc } = await supabase
        .from("services").select("partner_id").eq("scheduled_date", date).not("partner_id", "is", null);
      const ids = Array.from(new Set((svc ?? []).map((r: any) => r.partner_id)));
      if (!ids.length) return [] as Partner[];
      const { data } = await supabase
        .from("partners")
        .select("id, full_name, phone, profile_photo_url, status, last_seen, current_lat, current_lng, home_lat, home_lng, rating, reliability_score, home_area")
        .in("id", ids);
      return (data ?? []) as Partner[];
    },
  });

  useEffect(() => {
    if (!partnerId && partners && partners.length) setPartnerId(partners[0].id);
  }, [partners, partnerId]);

  const partner = partners?.find((p) => p.id === partnerId) ?? null;

  const { data: services, isFetching } = useQuery({
    queryKey: ["rm-services", date, partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select(
          "id,partner_id,scheduled_date,status,sequence_no,manual_sequence_no,locked_position,is_emergency,cluster_id,customers(full_name,phone,area,address_line,latitude,longitude,service_required_before,preferred_time,time_window_type,exact_time),vehicles(make,model,registration_number)",
        )
        .eq("scheduled_date", date)
        .eq("partner_id", partnerId)
        .order("status", { ascending: true })
        .order("sequence_no", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ServiceRow[];
    },
  });

  useEffect(() => setOrder(services ? [...services.filter((s) => s.status !== "completed")] : null), [services]);

  // realtime
  useEffect(() => {
    if (!partnerId) return;
    const ch = supabase
      .channel(`rm:${partnerId}:${date}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "services", filter: `partner_id=eq.${partnerId}` },
        () => qc.invalidateQueries({ queryKey: ["rm-services", date, partnerId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "partners", filter: `id=eq.${partnerId}` },
        () => qc.invalidateQueries({ queryKey: ["rm-partners-full"] }))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [partnerId, date, qc]);

  // dashboard metrics
  const { data: dash } = useQuery({
    queryKey: ["rm-dash", partnerId, date],
    enabled: !!partnerId,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data } = await supabase.rpc("admin_route_dashboard" as any, {
        _partner_id: partnerId, _date: date,
      });
      return (data ?? {}) as any;
    },
  });

  const { data: timeline } = useQuery({
    queryKey: ["rm-timeline", partnerId, date],
    enabled: !!partnerId,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data } = await supabase.rpc("admin_route_timeline" as any, {
        _partner_id: partnerId, _date: date,
      });
      return (Array.isArray(data) ? data : []) as any[];
    },
  });

  const { data: snapshots, refetch: refetchSnaps } = useQuery({
    queryKey: ["rm-snapshots", partnerId, date],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data } = await supabase
        .from("route_snapshots" as any)
        .select("*").eq("partner_id", partnerId).eq("date", date)
        .order("created_at", { ascending: false }).limit(20);
      return (data ?? []) as any[];
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["rm-logs", partnerId, date],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data } = await supabase
        .from("route_change_log" as any)
        .select("*").eq("partner_id", partnerId).eq("date", date)
        .order("created_at", { ascending: false }).limit(100);
      return (data ?? []) as any[];
    },
  });

  // optimizer preview
  const optimizerPreview = useMemo(() => {
    if (!services) return [] as string[];
    const stops = services.filter((s) => s.status !== "completed").map((s) => ({
      id: s.id,
      lat: s.customers?.latitude != null ? Number(s.customers.latitude) : null,
      lng: s.customers?.longitude != null ? Number(s.customers.longitude) : null,
      deadline: s.customers?.service_required_before ?? s.customers?.preferred_time ?? null,
      timeWindowType: ((s.customers?.time_window_type ?? "soft") as "soft" | "exact"),
      exactTime: s.customers?.exact_time ?? null,
      locked: !!s.locked_position,
      manualSequence: s.manual_sequence_no ?? null,
      isEmergency: !!s.is_emergency,
      clusterId: s.cluster_id ?? null,
    }));
    return optimizeRoute(stops).map((s) => s.id);
  }, [services]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function ensureCanEdit() {
    if (!canEdit) { toast.error("Read-only — needs admin or ops_manager"); return false; }
    return true;
  }

  function onDragEnd(e: DragEndEvent) {
    if (!order || !ensureCanEdit()) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = order.findIndex((s) => s.id === active.id);
    const newIdx = order.findIndex((s) => s.id === over.id);
    setOrder(arrayMove(order, oldIdx, newIdx));
  }

  async function move(s: ServiceRow, dir: -1 | 1) {
    if (!order || !ensureCanEdit()) return;
    const i = order.findIndex((x) => x.id === s.id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    setOrder(arrayMove(order, i, j));
  }

  async function saveManualOrder(reason?: string) {
    if (!order || !ensureCanEdit()) return;
    const ids = order.map((s) => s.id);
    const { error } = await supabase.rpc("admin_reorder_services" as any, {
      _partner_id: partnerId, _date: date, _service_ids: ids,
    });
    if (error) return toast.error(error.message);
    await supabase.rpc("admin_log_route_action" as any, {
      _partner_id: partnerId, _service_id: null, _date: date,
      _action: "manual_save", _reason: reason ?? null,
      _old: null, _new: { sequence: ids },
    });
    toast.success("Manual order saved — partner app will update");
    qc.invalidateQueries({ queryKey: ["rm-services"] });
    qc.invalidateQueries({ queryKey: ["rm-logs"] });
  }

  async function toggleLock(s: ServiceRow) {
    if (!ensureCanEdit()) return;
    const { error } = await supabase.rpc("admin_lock_service" as any, {
      _service_id: s.id, _locked: !s.locked_position,
    });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["rm-services"] });
  }

  async function toggleEmergency(s: ServiceRow) {
    if (!ensureCanEdit()) return;
    const { error } = await supabase
      .from("services").update({ is_emergency: !s.is_emergency } as any).eq("id", s.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["rm-services"] });
  }

  async function reassign(s: ServiceRow, toPartnerId: string) {
    if (!ensureCanEdit()) return;
    const { error } = await supabase.rpc("admin_reassign_service" as any, {
      _service_id: s.id, _new_partner_id: toPartnerId,
    });
    if (error) return toast.error(error.message);
    toast.success("Reassigned");
    qc.invalidateQueries({ queryKey: ["rm-services"] });
  }

  async function removeStop(s: ServiceRow) {
    if (!ensureCanEdit()) return;
    const reason = window.prompt("Reason for marking unavailable?", "Customer unavailable");
    if (!reason) return;
    const { error } = await supabase.rpc("admin_remove_service" as any, {
      _service_id: s.id, _reason: reason,
    });
    if (error) return toast.error(error.message);
    toast.success("Stop removed");
    qc.invalidateQueries({ queryKey: ["rm-services"] });
  }

  async function forceRecalculate() {
    if (!ensureCanEdit()) return;
    const { error } = await supabase.rpc("admin_force_recalculate" as any, {
      _partner_id: partnerId, _date: date,
    });
    if (error) return toast.error(error.message);
    toast.success("Route recalculated");
    qc.invalidateQueries({ queryKey: ["rm-services"] });
    refetchSnaps();
  }

  async function optimizeAll() {
    if (!ensureCanEdit()) return;
    const { error, data } = await supabase.rpc("admin_optimize_all" as any, { _date: date });
    if (error) return toast.error(error.message);
    toast.success(`Proposed routes for ${(data as any[])?.length ?? 0} partners — review & accept`);
    refetchSnaps();
  }

  async function acceptSnap(id: string) {
    if (!ensureCanEdit()) return;
    const { error } = await supabase.rpc("admin_accept_recalc" as any, { _snapshot_id: id });
    if (error) return toast.error(error.message);
    toast.success("Applied");
    qc.invalidateQueries({ queryKey: ["rm-services"] });
    refetchSnaps();
  }
  async function rejectSnap(id: string) {
    if (!ensureCanEdit()) return;
    const { error } = await supabase.rpc("admin_reject_recalc" as any, { _snapshot_id: id });
    if (error) return toast.error(error.message);
    refetchSnaps();
  }

  // grouping
  const byCluster = useMemo(() => {
    if (!order) return [] as Array<{ cluster: string; rows: ServiceRow[] }>;
    const m = new Map<string, ServiceRow[]>();
    order.forEach((s) => {
      const k = s.cluster_id ?? "ungrouped";
      const list = m.get(k) ?? [];
      list.push(s);
      m.set(k, list);
    });
    return Array.from(m.entries()).map(([cluster, rows]) => ({ cluster, rows }));
  }, [order]);

  const mapStops: MapStop[] = useMemo(() => {
    if (!services) return [];
    let nextSet = false;
    return services
      .filter((s) => s.customers?.latitude != null && s.customers?.longitude != null)
      .map((s, i) => {
        const status: MapStop["status"] = s.is_emergency
          ? "emergency"
          : s.status === "completed"
          ? "completed"
          : s.status === "unavailable"
          ? "unavailable"
          : !nextSet && s.status !== "completed"
          ? (nextSet = true, "next")
          : "pending";
        return {
          id: s.id,
          lat: Number(s.customers!.latitude),
          lng: Number(s.customers!.longitude),
          label: s.customers?.full_name ?? "—",
          sequence: i + 1,
          status,
          clusterId: s.cluster_id,
        };
      });
  }, [services]);

  const selected = services?.find((s) => s.id === selectedStop) ?? null;

  return (
    <div className="space-y-4 p-3 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Route Manager</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Operations control centre — dashboard, map, timeline & cluster view with live partner sync.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs">Date</Label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="block h-9 rounded-md border border-input bg-background px-2 text-sm" />
          </div>
          <div className="min-w-[200px]">
            <Label className="text-xs">Partner</Label>
            <Select value={partnerId} onValueChange={setPartnerId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select partner" /></SelectTrigger>
              <SelectContent>
                {(partners ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.id.slice(0, 8)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={forceRecalculate} disabled={!partnerId || !canEdit}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Recalculate
          </Button>
          <Button variant="outline" size="sm" onClick={optimizeAll} disabled={!canEdit}>
            <Sparkles className="mr-1.5 h-4 w-4" /> Optimize all
          </Button>
          <Button size="sm" onClick={() => saveManualOrder()} disabled={!order || !canEdit}>
            Save manual order
          </Button>
        </div>
      </div>

      {/* Partner card + dashboard */}
      <PartnerSummary partner={partner} dash={dash} />

      <Tabs defaultValue="stops" className="w-full">
        <TabsList className="grid w-full grid-cols-3 md:w-auto md:grid-cols-6">
          <TabsTrigger value="stops"><ListChecks className="mr-1 h-4 w-4" />Stops</TabsTrigger>
          <TabsTrigger value="map"><MapIcon className="mr-1 h-4 w-4" />Map</TabsTrigger>
          <TabsTrigger value="timeline"><Activity className="mr-1 h-4 w-4" />Timeline</TabsTrigger>
          <TabsTrigger value="clusters"><LayoutGrid className="mr-1 h-4 w-4" />Clusters</TabsTrigger>
          <TabsTrigger value="history"><HistoryIcon className="mr-1 h-4 w-4" />History</TabsTrigger>
          <TabsTrigger value="activity"><Circle className="mr-1 h-4 w-4" />Activity</TabsTrigger>
        </TabsList>

        {/* STOPS */}
        <TabsContent value="stops" className="mt-3">
          {isFetching && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {order && order.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">No pending stops.</Card>
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
                      total={order.length}
                      suggestedIndex={optimizerPreview.indexOf(s.id)}
                      partners={(partners ?? []).filter((p) => p.id !== s.partner_id)
                        .map((p) => ({ id: p.id, name: p.full_name ?? p.id.slice(0, 8) }))}
                      canEdit={canEdit}
                      onLock={() => toggleLock(s)}
                      onEmergency={() => toggleEmergency(s)}
                      onReassign={(p) => reassign(s, p)}
                      onRemove={() => removeStop(s)}
                      onOpen={() => setSelectedStop(s.id)}
                      onUp={() => move(s, -1)}
                      onDown={() => move(s, 1)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </TabsContent>

        {/* MAP */}
        <TabsContent value="map" className="mt-3">
          <RouteMapPanel
            stops={mapStops}
            partner={{ lat: partner?.current_lat ?? partner?.home_lat ?? null,
                       lng: partner?.current_lng ?? partner?.home_lng ?? null,
                       name: partner?.full_name }}
            onSelect={(id) => setSelectedStop(id)}
            height={520}
          />
        </TabsContent>

        {/* TIMELINE */}
        <TabsContent value="timeline" className="mt-3">
          <Card className="divide-y p-0">
            <div className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="font-medium">06:30 — Leave base</span>
              <Badge variant="outline">Start</Badge>
            </div>
            {(timeline ?? []).map((t: any) => (
              <div key={t.service_id}
                   className={`flex items-center gap-3 px-4 py-2 text-sm ${t.status === "completed" ? "opacity-60" : ""}`}>
                <div className="w-14 font-mono text-xs">{t.eta}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.leg_km} km • {t.leg_minutes}m drive • {t.service_minutes}m service
                    {t.window_type === "exact" && t.exact_time ? ` • exact ${t.exact_time}` : ""}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] capitalize">{t.status}</Badge>
              </div>
            ))}
            {!timeline?.length && <p className="px-4 py-6 text-center text-sm text-muted-foreground">No stops.</p>}
          </Card>
        </TabsContent>

        {/* CLUSTERS */}
        <TabsContent value="clusters" className="mt-3">
          <div className="grid gap-3 md:grid-cols-2">
            {byCluster.map(({ cluster, rows }) => {
              const done = rows.filter((r) => r.status === "completed").length;
              return (
                <Card key={cluster} className="p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="font-medium">Cluster {cluster.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">
                        {rows[0].customers?.area ?? "—"} • {rows.length} cars
                      </p>
                    </div>
                    <Badge variant="outline">{done}/{rows.length} done</Badge>
                  </div>
                  <ul className="space-y-1 text-sm">
                    {rows.map((r) => (
                      <li key={r.id} className="flex justify-between gap-2 truncate">
                        <span className="truncate">{r.customers?.full_name}</span>
                        <span className="text-xs text-muted-foreground capitalize">{r.status}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
            {!byCluster.length && <Card className="p-6 text-center text-sm text-muted-foreground">No clusters.</Card>}
          </div>
        </TabsContent>

        {/* HISTORY (snapshots) */}
        <TabsContent value="history" className="mt-3">
          <div className="space-y-2">
            {(snapshots ?? []).map((s: any) => (
              <Card key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div>
                  <p className="font-medium capitalize">{s.kind} • {s.status}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(s.created_at).toLocaleString()} • {(s.sequence ?? []).length} stops
                  </p>
                </div>
                {s.status === "pending" && canEdit && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => rejectSnap(s.id)}>Reject</Button>
                    <Button size="sm" onClick={() => acceptSnap(s.id)}>Accept</Button>
                  </div>
                )}
              </Card>
            ))}
            {!snapshots?.length && (
              <Card className="p-6 text-center text-sm text-muted-foreground">No snapshots yet.</Card>
            )}
          </div>
        </TabsContent>

        {/* ACTIVITY (logs) */}
        <TabsContent value="activity" className="mt-3">
          <Card className="divide-y p-0">
            {(logs ?? []).map((l: any) => (
              <div key={l.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium capitalize">{l.action.replace(/_/g, " ")}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {l.actor_name ?? "—"} • {new Date(l.created_at).toLocaleString()}
                    {l.reason ? ` • ${l.reason}` : ""}
                  </p>
                </div>
              </div>
            ))}
            {!logs?.length && <p className="px-4 py-6 text-center text-sm text-muted-foreground">No activity.</p>}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Customer detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelectedStop(null)}>
        <DialogContent className="max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.customers?.full_name ?? "Customer"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <div>
                  <p className="text-muted-foreground">{selected.customers?.area} • {selected.customers?.address_line}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">Vehicle</span><p>{selected.vehicles?.make} {selected.vehicles?.model}</p></div>
                  <div><span className="text-muted-foreground">Reg</span><p>{selected.vehicles?.registration_number ?? "—"}</p></div>
                  <div><span className="text-muted-foreground">Preferred</span><p>{selected.customers?.preferred_time ?? "—"}</p></div>
                  <div><span className="text-muted-foreground">Window</span>
                    <p>{selected.customers?.time_window_type === "exact"
                      ? `Exact ${selected.customers?.exact_time}` : "Soft"}</p></div>
                  <div><span className="text-muted-foreground">Status</span><p className="capitalize">{selected.status}</p></div>
                  <div><span className="text-muted-foreground">Cluster</span><p>{selected.cluster_id?.slice(0, 8) ?? "—"}</p></div>
                </div>
                <div className="flex flex-wrap gap-1 pt-2">
                  {selected.customers?.phone && (
                    <a href={`tel:${selected.customers.phone}`}>
                      <Button size="sm" variant="outline"><Phone className="mr-1 h-4 w-4" />Call</Button>
                    </a>
                  )}
                  {selected.customers?.latitude && (
                    <a target="_blank" rel="noreferrer"
                       href={`https://www.google.com/maps/dir/?api=1&destination=${selected.customers.latitude},${selected.customers.longitude}`}>
                      <Button size="sm" variant="outline"><Navigation className="mr-1 h-4 w-4" />Navigate</Button>
                    </a>
                  )}
                  <Button size="sm" variant="outline" onClick={() => toggleLock(selected)} disabled={!canEdit}>
                    {selected.locked_position ? <LockOpen className="mr-1 h-4 w-4" /> : <Lock className="mr-1 h-4 w-4" />}
                    {selected.locked_position ? "Unlock" : "Lock"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toggleEmergency(selected)} disabled={!canEdit}>
                    <Zap className="mr-1 h-4 w-4" />{selected.is_emergency ? "Clear emergency" : "Emergency"}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => removeStop(selected)} disabled={!canEdit}>
                    <Trash2 className="mr-1 h-4 w-4" />Remove
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PartnerSummary({ partner, dash }: { partner: Partner | null; dash: any }) {
  if (!partner) return null;
  const online = partner.last_seen && (Date.now() - new Date(partner.last_seen).getTime()) < 5 * 60 * 1000;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-muted">
            {partner.profile_photo_url
              ? <img src={partner.profile_photo_url} alt="" className="h-full w-full object-cover" />
              : <span className="text-lg font-semibold">{(partner.full_name ?? "?").slice(0, 1)}</span>}
          </div>
          <div>
            <p className="font-semibold">{partner.full_name ?? "Partner"}</p>
            <p className="text-xs text-muted-foreground">{partner.home_area ?? "—"} • ★ {fmt(partner.rating, 1)}</p>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className={`h-2 w-2 rounded-full ${online ? "bg-green-500" : "bg-muted-foreground"}`} />
              {online ? "Online" : "Offline"}
              {partner.current_lat && (
                <a className="text-primary hover:underline"
                   target="_blank" rel="noreferrer"
                   href={`https://www.google.com/maps?q=${partner.current_lat},${partner.current_lng}`}>
                  view location
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-3 gap-2 text-center md:grid-cols-6 lg:grid-cols-9">
          <Stat label="Assigned" value={dash?.assigned ?? 0} />
          <Stat label="Done" value={dash?.completed ?? 0} />
          <Stat label="Pending" value={dash?.pending ?? 0} />
          <Stat label="Unavail." value={dash?.unavailable ?? 0} />
          <Stat label="Dirty" value={dash?.dirty_reports ?? 0} />
          <Stat label="Distance" value={`${dash?.distance_km ?? 0} km`} />
          <Stat label="Drive" value={`${Math.round(dash?.drive_minutes ?? 0)}m`} />
          <Stat label="Clean" value={`${Math.round(dash?.cleaning_minutes ?? 0)}m`} />
          <Stat label="Finish ETA" value={`+${Math.round(dash?.finish_minutes ?? 0)}m`} />
          <Stat label="Clusters" value={dash?.cluster_count ?? 0} />
          <Stat label="Backtrack" value={dash?.backtracking ?? 0} />
          <Stat label="Fuel" value={`₹${dash?.fuel_estimate_rupees ?? 0}`} />
          <Stat label="Efficiency" value={`${dash?.efficiency_score ?? 0}`} highlight />
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div className={`rounded-md border px-2 py-1.5 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}>
      <p className="text-sm font-semibold leading-tight">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function SortableRow({
  service: s, index, total, suggestedIndex, partners, canEdit,
  onLock, onEmergency, onReassign, onRemove, onOpen, onUp, onDown,
}: {
  service: ServiceRow; index: number; total: number; suggestedIndex: number;
  partners: Array<{ id: string; name: string }>; canEdit: boolean;
  onLock: () => void; onEmergency: () => void; onReassign: (id: string) => void;
  onRemove: () => void; onOpen: () => void; onUp: () => void; onDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const c = s.customers; const v = s.vehicles;
  const isExact = (c?.time_window_type ?? "soft") === "exact";
  const cutoff = c?.service_required_before ?? c?.preferred_time;
  const drift = suggestedIndex >= 0 ? suggestedIndex - index : 0;

  return (
    <Card ref={setNodeRef} style={style} className="flex flex-wrap items-center gap-3 p-3">
      <button {...attributes} {...listeners}
              className="cursor-grab text-muted-foreground" aria-label="Drag">
        <GripVertical className="h-5 w-5" />
      </button>
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
        {index + 1}
      </div>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
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
      </button>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="ghost" size="icon" onClick={onUp} disabled={!canEdit || index === 0} title="Move up">
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDown} disabled={!canEdit || index === total - 1} title="Move down">
          <ChevronDown className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onLock} disabled={!canEdit} title={s.locked_position ? "Unlock" : "Lock"}>
          {s.locked_position ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        </Button>
        <div className="flex items-center gap-1.5 rounded-md border border-input px-2 py-1 text-xs">
          <Zap className="h-3 w-3" /><Switch checked={!!s.is_emergency} onCheckedChange={onEmergency} disabled={!canEdit} />
        </div>
        <Select onValueChange={(v) => v && onReassign(v)} disabled={!canEdit}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <ArrowRightLeft className="mr-1 h-3 w-3" /> Reassign
          </SelectTrigger>
          <SelectContent>
            {partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {c?.phone && (
          <a href={`tel:${c.phone}`}>
            <Button variant="ghost" size="icon" title="Call"><Phone className="h-4 w-4" /></Button>
          </a>
        )}
        {c?.latitude && (
          <a target="_blank" rel="noreferrer"
             href={`https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}`}>
            <Button variant="ghost" size="icon" title="Navigate"><Navigation className="h-4 w-4" /></Button>
          </a>
        )}
        <Button variant="ghost" size="icon" onClick={onRemove} disabled={!canEdit} title="Remove">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
