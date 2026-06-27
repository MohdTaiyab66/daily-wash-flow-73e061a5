import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  GripVertical, Lock, LockOpen, Zap, RefreshCw, ArrowRightLeft,
  Loader2, Phone, Navigation, History as HistoryIcon, ListChecks,
  Map as MapIcon, LayoutGrid, Sparkles, Trash2, ChevronUp, ChevronDown,
  Circle, Activity, Plus, MoreVertical, ArrowUpToLine, ArrowDownToLine,
} from "lucide-react";
import { optimizeRoute } from "@/lib/route-optimize";
import { RouteMapPanel, type MapStop } from "@/components/admin/route/RouteMapPanel";
import { AddCustomerSheet } from "@/components/admin/route/AddCustomerSheet";
import { SaveBar } from "@/components/admin/route/SaveBar";
import { ManualModeBanner } from "@/components/admin/route/ManualModeBanner";
import { PrioritySelect, PriorityBadge } from "@/components/admin/route/PrioritySelect";
import {
  newHistory, pushHistory, undoHistory, redoHistory, payloadFromOrder,
  diffPayloads, normalisePriority, PRIORITY_LABEL, type HistoryStack, type Priority,
} from "@/lib/route-draft";

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
  priority: string | null;
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
  manual_mode_enabled: boolean | null;
  manual_mode_since: string | null;
};

const SERVICE_SELECT =
  "id,partner_id,scheduled_date,status,sequence_no,manual_sequence_no,locked_position,is_emergency,priority,cluster_id,customers(full_name,phone,area,address_line,latitude,longitude,service_required_before,preferred_time,time_window_type,exact_time),vehicles(make,model,registration_number)";

function todayIso() { return new Date().toISOString().slice(0, 10); }
function fmt(n: number | null | undefined, d = 1) {
  return n == null ? "—" : Number(n).toFixed(d);
}

function RouteManagerPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayIso());
  const [partnerId, setPartnerId] = useState<string>("");
  const [selectedStop, setSelectedStop] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "ops_manager" | "viewer">("viewer");
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

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

  // partners with services today
  const { data: partners } = useQuery({
    queryKey: ["rm-partners-full", date],
    queryFn: async () => {
      const { data: svc } = await supabase
        .from("services").select("partner_id").eq("scheduled_date", date).not("partner_id", "is", null);
      const ids = Array.from(new Set((svc ?? []).map((r: any) => r.partner_id)));
      if (!ids.length) return [] as Partner[];
      const { data } = await supabase
        .from("partners")
        .select("id, full_name, phone, profile_photo_url, status, last_seen, current_lat, current_lng, home_lat, home_lng, rating, reliability_score, home_area, manual_mode_enabled, manual_mode_since")
        .in("id", ids);
      return (data ?? []) as Partner[];
    },
  });

  useEffect(() => {
    if (!partnerId && partners && partners.length) setPartnerId(partners[0].id);
  }, [partners, partnerId]);

  const partner = partners?.find((p) => p.id === partnerId) ?? null;

  // server services
  const { data: services, isFetching } = useQuery({
    queryKey: ["rm-services", date, partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services").select(SERVICE_SELECT)
        .eq("scheduled_date", date).eq("partner_id", partnerId)
        .order("status", { ascending: true }).order("sequence_no", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ServiceRow[];
    },
  });

  // server draft (may be null)
  const { data: serverDraft } = useQuery({
    queryKey: ["rm-draft", date, partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data } = await supabase.rpc("admin_route_draft_get" as any, {
        p_partner_id: partnerId, p_date: date,
      });
      return (data ?? null) as any;
    },
  });

  // ----- Draft state (manual editing buffer with undo/redo) ------------------
  const [draft, setDraft] = useState<HistoryStack<ServiceRow[]> | null>(null);
  const baselineRef = useRef<ServiceRow[] | null>(null);
  const lookupRef = useRef<Map<string, ServiceRow>>(new Map());

  // Initialise / hydrate draft when services or serverDraft change.
  useEffect(() => {
    if (!services) return;
    const map = new Map<string, ServiceRow>();
    services.forEach((s) => map.set(s.id, s));
    lookupRef.current = map;

    const pending = services.filter((s) => s.status !== "completed");
    let initial = pending;

    if (serverDraft && Array.isArray(serverDraft.payload) && serverDraft.payload.length) {
      // Re-hydrate stored draft using known service rows; drop any unknown IDs.
      const seen = new Set<string>();
      const rebuilt: ServiceRow[] = [];
      for (const item of serverDraft.payload as any[]) {
        const sid = item.service_id;
        const row = map.get(sid);
        if (!row || seen.has(sid)) continue;
        seen.add(sid);
        rebuilt.push({
          ...row,
          locked_position: !!item.locked,
          is_emergency: !!item.is_emergency,
          priority: normalisePriority(item.priority ?? row.priority ?? null),
        });
      }
      // Append any pending rows missing from the draft (e.g. newly assigned after).
      for (const s of pending) if (!seen.has(s.id)) rebuilt.push(s);
      initial = rebuilt;
    }

    baselineRef.current = pending;
    setDraft(newHistory(initial));
    setSelected(new Set());
  }, [services, serverDraft]);

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
    enabled: !!partnerId, refetchInterval: 15000,
    queryFn: async () => {
      const { data } = await supabase.rpc("admin_route_dashboard" as any, {
        _partner_id: partnerId, _date: date,
      });
      return (data ?? {}) as any;
    },
  });

  const { data: timeline } = useQuery({
    queryKey: ["rm-timeline", partnerId, date],
    enabled: !!partnerId, refetchInterval: 15000,
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

  const order = draft?.present ?? null;

  // dirty when draft differs from baseline
  const dirty = useMemo(() => {
    if (!order || !baselineRef.current) return false;
    return diffPayloads(payloadFromOrder(order), payloadFromOrder(baselineRef.current));
  }, [order]);

  // optimizer suggestion (read-only hint)
  const optimizerPreview = useMemo(() => {
    if (!order) return [] as string[];
    const stops = order.map((s) => ({
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
  }, [order]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function ensureCanEdit() {
    if (!canEdit) { toast.error("Read-only — needs admin or ops_manager"); return false; }
    return true;
  }

  // mutate draft via a producer function
  const mutateDraft = useCallback((producer: (rows: ServiceRow[]) => ServiceRow[]) => {
    if (!ensureCanEdit()) return;
    setDraft((d) => (d ? pushHistory(d, producer(d.present)) : d));
  }, [canEdit]);

  // ---- per-row operations on draft ----
  const onDragEnd = (e: DragEndEvent) => {
    if (!order) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = order.findIndex((s) => s.id === active.id);
    const newIdx = order.findIndex((s) => s.id === over.id);
    mutateDraft((rows) => arrayMove(rows, oldIdx, newIdx));
  };

  const move = (s: ServiceRow, dir: -1 | 1) => {
    if (!order) return;
    const i = order.findIndex((x) => x.id === s.id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    mutateDraft((rows) => arrayMove(rows, i, j));
  };

  const moveTo = (s: ServiceRow, pos: "top" | "bottom") => {
    if (!order) return;
    const i = order.findIndex((x) => x.id === s.id);
    if (i < 0) return;
    mutateDraft((rows) => {
      const copy = [...rows]; const [item] = copy.splice(i, 1);
      if (pos === "top") copy.unshift(item); else copy.push(item);
      return copy;
    });
  };

  const insertNear = (s: ServiceRow, where: "above" | "below") => {
    // Stash a flag to know where the next added customer goes
    const i = order!.findIndex((x) => x.id === s.id);
    pendingInsertRef.current = where === "above" ? i : i + 1;
    setAddOpen(true);
  };

  const pendingInsertRef = useRef<number | null>(null);

  const toggleLockDraft = (s: ServiceRow) =>
    mutateDraft((rows) => rows.map((r) => r.id === s.id ? { ...r, locked_position: !r.locked_position } : r));

  const toggleEmergencyDraft = (s: ServiceRow) =>
    mutateDraft((rows) => rows.map((r) => r.id === s.id ? { ...r, is_emergency: !r.is_emergency } : r));

  const setPriorityDraft = (s: ServiceRow, p: Priority) =>
    mutateDraft((rows) => rows.map((r) => r.id === s.id ? { ...r, priority: p } : r));

  const removeFromDraft = (s: ServiceRow) =>
    mutateDraft((rows) => rows.filter((r) => r.id !== s.id));

  // ---- bulk ----
  const allChecked = !!order && order.length > 0 && selected.size === order.length;
  const toggleAll = () =>
    setSelected(allChecked ? new Set() : new Set((order ?? []).map((s) => s.id)));
  const toggleOne = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const bulkApply = (op:
    | { kind: "lock"; locked: boolean }
    | { kind: "priority"; value: Priority }
    | { kind: "delete" }
    | { kind: "moveTop" | "moveBottom" }
  ) => {
    if (!order || !selected.size) return;
    mutateDraft((rows) => {
      switch (op.kind) {
        case "lock":
          return rows.map((r) => selected.has(r.id) ? { ...r, locked_position: op.locked } : r);
        case "priority":
          return rows.map((r) => selected.has(r.id) ? { ...r, priority: op.value } : r);
        case "delete":
          return rows.filter((r) => !selected.has(r.id));
        case "moveTop": {
          const sel = rows.filter((r) => selected.has(r.id));
          const rest = rows.filter((r) => !selected.has(r.id));
          return [...sel, ...rest];
        }
        case "moveBottom": {
          const sel = rows.filter((r) => selected.has(r.id));
          const rest = rows.filter((r) => !selected.has(r.id));
          return [...rest, ...sel];
        }
      }
    });
    setSelected(new Set());
  };

  // ---- add customer (resolves service row, performs cross-partner reassign first) ----
  async function fetchServiceRow(serviceId: string): Promise<ServiceRow | null> {
    const cached = lookupRef.current.get(serviceId);
    if (cached) return cached;
    const { data } = await supabase.from("services").select(SERVICE_SELECT).eq("id", serviceId).maybeSingle();
    if (!data) return null;
    const row = data as unknown as ServiceRow;
    lookupRef.current.set(serviceId, row);
    return row;
  }

  async function handleAddCustomer(serviceId: string) {
    const row = await fetchServiceRow(serviceId);
    if (!row) { toast.error("Service not found"); return; }
    const insertAt = pendingInsertRef.current;
    pendingInsertRef.current = null;
    // ensure on this partner in draft (even if server still says different)
    const withPartner: ServiceRow = { ...row, partner_id: partnerId };
    mutateDraft((rows) => {
      if (rows.some((r) => r.id === serviceId)) return rows;
      const copy = [...rows];
      if (insertAt == null || insertAt > copy.length) copy.push(withPartner);
      else copy.splice(insertAt, 0, withPartner);
      return copy;
    });
    toast.success(`${row.customers?.full_name ?? "Customer"} added to draft`);
  }

  async function handleReassignFromOther(serviceId: string, fromPartner: string) {
    const { error } = await supabase.rpc("admin_route_reassign" as any, {
      p_service_id: serviceId, p_to_partner: partnerId, p_position: null,
      p_reason: "Manual move via Route Manager",
    });
    if (error) { toast.error(error.message); throw error; }
    // refresh both partners' lists in background
    qc.invalidateQueries({ queryKey: ["rm-services"] });
  }

  // ---- save / discard ----
  // Compute per-stop ETA / distance / travel-min from the manual order so the
  // partner & customer apps see real numbers immediately after Save.
  function buildSavePayload(rows: ServiceRow[]) {
    const SERVICE_MIN = 12;     // average wash duration
    const AVG_KMH = 22;         // city avg
    const startMin = 6 * 60 + 30; // 06:30
    const baseDay = new Date(date + "T00:00:00");
    let prevLat = partner?.home_lat != null ? Number(partner.home_lat) : null;
    let prevLng = partner?.home_lng != null ? Number(partner.home_lng) : null;
    let cursor = startMin;
    return rows.map((s, i) => {
      const lat = s.customers?.latitude != null ? Number(s.customers.latitude) : null;
      const lng = s.customers?.longitude != null ? Number(s.customers.longitude) : null;
      let distKm = 0;
      if (prevLat != null && prevLng != null && lat != null && lng != null) {
        const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
        const dLat = toRad(lat - prevLat), dLng = toRad(lng - prevLng);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(prevLat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
        distKm = 2 * R * Math.asin(Math.sqrt(a));
      }
      const travelMin = Math.max(1, Math.round((distKm / AVG_KMH) * 60));
      cursor += travelMin;
      const eta = new Date(baseDay.getTime() + cursor * 60_000);
      cursor += SERVICE_MIN;
      if (lat != null && lng != null) { prevLat = lat; prevLng = lng; }
      return {
        service_id: s.id,
        sequence: i + 1,
        locked: !!s.locked_position,
        priority: normalisePriority(s.priority ?? null),
        is_emergency: !!s.is_emergency,
        cluster_id: s.cluster_id,
        partner_id: s.partner_id ?? partnerId,
        eta_at: eta.toISOString(),
        travel_min: travelMin,
        distance_km: Math.round(distKm * 100) / 100,
      };
    });
  }

  async function persistDraft(reason?: string) {
    if (!order || !ensureCanEdit()) return;
    setSaving(true);
    try {
      const items = buildSavePayload(order);
      const { data, error } = await supabase.rpc("admin_route_draft_save" as any, {
        p_partner_id: partnerId,
        p_date: date,
        p_items: items as any,
        p_reason: reason ?? null,
      });
      if (error) throw error;
      const summary = (data ?? {}) as any;
      toast.success(
        `Route saved · ${summary.changed ?? 0} change(s)` +
        (summary.eta_notifications ? ` · ${summary.eta_notifications} customer(s) notified` : "")
      );
      qc.invalidateQueries({ queryKey: ["rm-services"] });
      qc.invalidateQueries({ queryKey: ["rm-draft"] });
      qc.invalidateQueries({ queryKey: ["rm-logs"] });
      qc.invalidateQueries({ queryKey: ["rm-snapshots"] });
      qc.invalidateQueries({ queryKey: ["rm-partners-full"] });
      qc.invalidateQueries({ queryKey: ["rm-timeline"] });
      qc.invalidateQueries({ queryKey: ["rm-dash"] });
      refetchSnaps();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function discardDraft() {
    if (!partnerId) return;
    const ok = window.confirm("Discard all unsaved changes?");
    if (!ok) return;
    await supabase.rpc("admin_route_draft_discard" as any, {
      p_partner_id: partnerId, p_date: date,
    });
    qc.invalidateQueries({ queryKey: ["rm-draft"] });
    if (baselineRef.current) setDraft(newHistory(baselineRef.current));
    setSelected(new Set());
    toast.message("Changes discarded");
  }

  async function resumeAi() {
    if (!ensureCanEdit() || !partnerId) return;
    const { error } = await supabase.rpc("admin_route_resume_ai" as any, { p_partner_id: partnerId });
    if (error) return toast.error(error.message);
    toast.success("AI optimizer resumed");
    qc.invalidateQueries({ queryKey: ["rm-partners-full"] });
  }

  async function optimizeAll() {
    if (!ensureCanEdit()) return;
    const { error, data } = await supabase.rpc("admin_optimize_all" as any, { _date: date });
    if (error) return toast.error(error.message);
    toast.success(`Proposed routes for ${(data as any[])?.length ?? 0} partners — review & accept`);
    refetchSnaps();
  }

  async function reassignToOtherPartner(s: ServiceRow, toPartnerId: string) {
    if (!ensureCanEdit()) return;
    const { error } = await supabase.rpc("admin_route_reassign" as any, {
      p_service_id: s.id, p_to_partner: toPartnerId, p_position: null,
      p_reason: "Manual reassign via Route Manager",
    });
    if (error) return toast.error(error.message);
    toast.success("Reassigned — receiving partner will update");
    mutateDraft((rows) => rows.filter((r) => r.id !== s.id));
    qc.invalidateQueries({ queryKey: ["rm-services"] });
  }

  // groupings
  const byCluster = useMemo(() => {
    if (!order) return [] as Array<{ cluster: string; rows: ServiceRow[] }>;
    const m = new Map<string, ServiceRow[]>();
    order.forEach((s) => {
      const k = s.cluster_id ?? "ungrouped";
      const list = m.get(k) ?? []; list.push(s); m.set(k, list);
    });
    return Array.from(m.entries()).map(([cluster, rows]) => ({ cluster, rows }));
  }, [order]);

  const mapStops: MapStop[] = useMemo(() => {
    if (!order) return [];
    let nextSet = false;
    return order
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
  }, [order]);

  const selectedRow = order?.find((s) => s.id === selectedStop) ?? null;
  const draftIds = useMemo(() => new Set((order ?? []).map((s) => s.id)), [order]);

  return (
    <div className="space-y-4 p-3 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Route Manager</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manual operations cockpit — drag, prioritise & reassign stops. Changes stay in draft until you click <b>Save route</b>.
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
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name ?? p.id.slice(0, 8)}
                    {p.manual_mode_enabled ? " · manual" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={optimizeAll} disabled={!canEdit}>
            <Sparkles className="mr-1.5 h-4 w-4" /> Optimize all
          </Button>
        </div>
      </div>

      <PartnerSummary partner={partner} dash={dash} />

      <ManualModeBanner
        active={!!partner?.manual_mode_enabled}
        since={partner?.manual_mode_since}
        canEdit={canEdit}
        onResumeAi={resumeAi}
        onOptimizeRemaining={() => persistDraft("Optimize remaining")}
        onOptimizeAll={optimizeAll}
      />

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
        <TabsContent value="stops" className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Checkbox checked={allChecked} onCheckedChange={toggleAll} disabled={!order?.length || !canEdit} />
              <span className="text-muted-foreground">
                {selected.size ? `${selected.size} selected` : `${order?.length ?? 0} stops`}
              </span>
            </div>
            <Button
              size="sm"
              onClick={() => { pendingInsertRef.current = null; setAddOpen(true); }}
              disabled={!partnerId || !canEdit}
            >
              <Plus className="mr-1 h-4 w-4" /> Add customer
            </Button>
          </div>

          {selected.size > 0 && (
            <Card className="flex flex-wrap items-center gap-2 border-primary/40 bg-primary/5 p-2 text-sm">
              <span className="font-medium">{selected.size} selected</span>
              <Button size="sm" variant="outline" onClick={() => bulkApply({ kind: "moveTop" })}>
                <ArrowUpToLine className="mr-1 h-3 w-3" /> Move to top
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkApply({ kind: "moveBottom" })}>
                <ArrowDownToLine className="mr-1 h-3 w-3" /> Move to bottom
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkApply({ kind: "lock", locked: true })}>
                <Lock className="mr-1 h-3 w-3" /> Lock
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkApply({ kind: "lock", locked: false })}>
                <LockOpen className="mr-1 h-3 w-3" /> Unlock
              </Button>
              <Select onValueChange={(v) => bulkApply({ kind: "priority", value: v as Priority })}>
                <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Set priority…" /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(PRIORITY_LABEL) as [Priority, string][]).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="destructive" onClick={() => bulkApply({ kind: "delete" })}>
                <Trash2 className="mr-1 h-3 w-3" /> Remove
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </Card>
          )}

          {isFetching && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {order && order.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              No pending stops. Click <b>+ Add customer</b> to insert one.
            </Card>
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
                      partners={(partners ?? []).filter((p) => p.id !== partnerId)
                        .map((p) => ({ id: p.id, name: p.full_name ?? p.id.slice(0, 8) }))}
                      canEdit={canEdit}
                      checked={selected.has(s.id)}
                      onCheck={() => toggleOne(s.id)}
                      onLock={() => toggleLockDraft(s)}
                      onEmergency={() => toggleEmergencyDraft(s)}
                      onPriority={(p) => setPriorityDraft(s, p)}
                      onReassign={(p) => reassignToOtherPartner(s, p)}
                      onRemove={() => removeFromDraft(s)}
                      onOpen={() => setSelectedStop(s.id)}
                      onUp={() => move(s, -1)}
                      onDown={() => move(s, 1)}
                      onTop={() => moveTo(s, "top")}
                      onBottom={() => moveTo(s, "bottom")}
                      onInsertAbove={() => insertNear(s, "above")}
                      onInsertBelow={() => insertNear(s, "below")}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </TabsContent>

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
          {dirty && (
            <p className="mt-2 text-xs text-amber-700">
              Timeline reflects the <b>saved</b> route. Save your draft to refresh ETAs.
            </p>
          )}
        </TabsContent>

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
                <Button size="sm" variant="outline" disabled={!canEdit}
                  onClick={async () => {
                    const { error } = await supabase.rpc("admin_route_restore_snapshot" as any, { p_snapshot_id: s.id });
                    if (error) return toast.error(error.message);
                    toast.success("Snapshot restored to draft");
                    qc.invalidateQueries({ queryKey: ["rm-draft"] });
                  }}>
                  Restore to draft
                </Button>
              </Card>
            ))}
            {!snapshots?.length && (
              <Card className="p-6 text-center text-sm text-muted-foreground">No snapshots yet.</Card>
            )}
          </div>
        </TabsContent>

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

      {/* Sticky save bar */}
      <SaveBar
        dirty={dirty}
        canUndo={!!draft?.past.length}
        canRedo={!!draft?.future.length}
        onUndo={() => setDraft((d) => d ? undoHistory(d) : d)}
        onRedo={() => setDraft((d) => d ? redoHistory(d) : d)}
        onDiscard={discardDraft}
        onSave={() => persistDraft()}
        saving={saving}
      />

      {/* Add customer sheet */}
      <AddCustomerSheet
        open={addOpen}
        onOpenChange={(o) => { setAddOpen(o); if (!o) pendingInsertRef.current = null; }}
        partnerId={partnerId}
        date={date}
        draftIds={draftIds}
        onAdd={handleAddCustomer}
        onReassign={handleReassignFromOther}
      />

      {/* Customer detail dialog */}
      <Dialog open={!!selectedRow} onOpenChange={(o) => !o && setSelectedStop(null)}>
        <DialogContent className="max-w-md">
          {selectedRow && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedRow.customers?.full_name ?? "Customer"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">{selectedRow.customers?.area} • {selectedRow.customers?.address_line}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">Vehicle</span><p>{selectedRow.vehicles?.make} {selectedRow.vehicles?.model}</p></div>
                  <div><span className="text-muted-foreground">Reg</span><p>{selectedRow.vehicles?.registration_number ?? "—"}</p></div>
                  <div><span className="text-muted-foreground">Preferred</span><p>{selectedRow.customers?.preferred_time ?? "—"}</p></div>
                  <div><span className="text-muted-foreground">Window</span>
                    <p>{selectedRow.customers?.time_window_type === "exact"
                      ? `Exact ${selectedRow.customers?.exact_time}` : "Soft"}</p></div>
                  <div><span className="text-muted-foreground">Status</span><p className="capitalize">{selectedRow.status}</p></div>
                  <div><span className="text-muted-foreground">Cluster</span><p>{selectedRow.cluster_id?.slice(0, 8) ?? "—"}</p></div>
                </div>
                <div className="pt-1">
                  <span className="text-xs text-muted-foreground">Priority</span>
                  <PrioritySelect
                    value={normalisePriority(selectedRow.priority)}
                    onChange={(p) => setPriorityDraft(selectedRow, p)}
                    disabled={!canEdit}
                    size="md"
                  />
                </div>
                <div className="flex flex-wrap gap-1 pt-2">
                  {selectedRow.customers?.phone && (
                    <a href={`tel:${selectedRow.customers.phone}`}>
                      <Button size="sm" variant="outline"><Phone className="mr-1 h-4 w-4" />Call</Button>
                    </a>
                  )}
                  {selectedRow.customers?.latitude && (
                    <a target="_blank" rel="noreferrer"
                       href={`https://www.google.com/maps/dir/?api=1&destination=${selectedRow.customers.latitude},${selectedRow.customers.longitude}`}>
                      <Button size="sm" variant="outline"><Navigation className="mr-1 h-4 w-4" />Navigate</Button>
                    </a>
                  )}
                  <Button size="sm" variant="outline" onClick={() => toggleLockDraft(selectedRow)} disabled={!canEdit}>
                    {selectedRow.locked_position ? <LockOpen className="mr-1 h-4 w-4" /> : <Lock className="mr-1 h-4 w-4" />}
                    {selectedRow.locked_position ? "Unlock" : "Lock"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toggleEmergencyDraft(selectedRow)} disabled={!canEdit}>
                    <Zap className="mr-1 h-4 w-4" />{selectedRow.is_emergency ? "Clear emergency" : "Emergency"}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => removeFromDraft(selectedRow)} disabled={!canEdit}>
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
  service: s, index, total, suggestedIndex, partners, canEdit, checked,
  onCheck, onLock, onEmergency, onPriority, onReassign, onRemove, onOpen,
  onUp, onDown, onTop, onBottom, onInsertAbove, onInsertBelow,
}: {
  service: ServiceRow; index: number; total: number; suggestedIndex: number;
  partners: Array<{ id: string; name: string }>; canEdit: boolean; checked: boolean;
  onCheck: () => void;
  onLock: () => void; onEmergency: () => void; onPriority: (p: Priority) => void;
  onReassign: (id: string) => void; onRemove: () => void; onOpen: () => void;
  onUp: () => void; onDown: () => void; onTop: () => void; onBottom: () => void;
  onInsertAbove: () => void; onInsertBelow: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const c = s.customers; const v = s.vehicles;
  const isExact = (c?.time_window_type ?? "soft") === "exact";
  const cutoff = c?.service_required_before ?? c?.preferred_time;
  const drift = suggestedIndex >= 0 ? suggestedIndex - index : 0;
  const priority = normalisePriority(s.priority);

  return (
    <Card ref={setNodeRef} style={style} className="flex flex-wrap items-center gap-3 p-3">
      <Checkbox checked={checked} onCheckedChange={onCheck} disabled={!canEdit} />
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
          <PriorityBadge value={priority} />
          {s.locked_position && <Badge variant="outline" className="text-[10px]"><Lock className="mr-1 h-3 w-3" />Locked</Badge>}
          {s.is_emergency && <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive"><Zap className="mr-1 h-3 w-3" />Emergency</Badge>}
          {isExact ? (
            <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive">Exact {c?.exact_time ?? cutoff}</Badge>
          ) : cutoff ? (
            <Badge variant="outline" className="text-[10px]">Soft · before {cutoff}</Badge>
          ) : null}
          {drift !== 0 && (
            <Badge variant="outline" className="text-[10px] text-amber-600">
              AI suggests {drift > 0 ? `↓${drift}` : `↑${Math.abs(drift)}`}
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
        <PrioritySelect value={priority} onChange={onPriority} disabled={!canEdit} />
        <Button variant="ghost" size="icon" onClick={onLock} disabled={!canEdit} title={s.locked_position ? "Unlock" : "Lock"}>
          {s.locked_position ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        </Button>
        <div className="flex items-center gap-1.5 rounded-md border border-input px-2 py-1 text-xs">
          <Zap className="h-3 w-3" /><Switch checked={!!s.is_emergency} onCheckedChange={onEmergency} disabled={!canEdit} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={!canEdit} title="More">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onInsertAbove}>Insert above…</DropdownMenuItem>
            <DropdownMenuItem onClick={onInsertBelow}>Insert below…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onTop}>Move to top</DropdownMenuItem>
            <DropdownMenuItem onClick={onBottom}>Move to bottom</DropdownMenuItem>
            <DropdownMenuSeparator />
            {partners.length > 0 && partners.slice(0, 8).map((p) => (
              <DropdownMenuItem key={p.id} onClick={() => onReassign(p.id)}>
                <ArrowRightLeft className="mr-2 h-3 w-3" /> Move to {p.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onRemove} className="text-destructive">
              <Trash2 className="mr-2 h-3 w-3" /> Remove from route
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
      </div>
    </Card>
  );
}
