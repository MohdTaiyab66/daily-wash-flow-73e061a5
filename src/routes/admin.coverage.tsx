import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, MapPin, Pause, Play, Copy, Trash2, Plus, Pencil, BarChart3, CalendarDays, Bell, History, FlaskConical, Undo2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/coverage")({ component: CoveragePage });

declare global {
  interface Window {
    google: any;
    __initLovableMap?: () => void;
    __lovableMapReady?: Promise<void>;
  }
}

function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps?.drawing) return Promise.resolve();
  if (window.__lovableMapReady && window.google?.maps?.drawing) return window.__lovableMapReady;
  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  if (!key) return Promise.reject(new Error("Google Maps key missing"));
  window.__lovableMapReady = new Promise<void>((resolve) => {
    window.__initLovableMap = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__initLovableMap&libraries=geometry,drawing`;
    s.async = true;
    document.head.appendChild(s);
  });
  return window.__lovableMapReady;
}

type Zone = {
  id: string; name: string; city: string | null; color: string; priority: number;
  zone_type: "radius" | "polygon"; status: "active" | "paused";
  center_lat: number | null; center_lng: number | null; radius_m: number | null;
  polygon: number[][] | null;
  daily_shine_enabled: boolean; premium_enabled: boolean;
  washing_enabled: boolean; interior_enabled: boolean; exterior_enabled: boolean;
  int_ext_enabled: boolean; deep_clean_enabled: boolean; polish_enabled: boolean;
  cutter_polish_enabled: boolean; roof_cleaning_enabled: boolean; seat_cleaning_enabled: boolean;
  corporate_fleet_enabled: boolean; emergency_enabled: boolean;
  max_daily_capacity: number | null; max_active_partners: number | null;
  assignment_radius_m: number | null; route_optimization_radius_m: number | null;
  travel_buffer_min: number | null;
};

const SERVICE_FLAGS: Array<{ key: keyof Zone; label: string }> = [
  { key: "daily_shine_enabled", label: "Daily Shine Subscription" },
  { key: "premium_enabled", label: "Premium Services" },
  { key: "washing_enabled", label: "Washing" },
  { key: "interior_enabled", label: "Interior Cleaning" },
  { key: "exterior_enabled", label: "Exterior Cleaning" },
  { key: "int_ext_enabled", label: "Int + Ext Wash" },
  { key: "deep_clean_enabled", label: "Deep Clean" },
  { key: "polish_enabled", label: "Body Polish" },
  { key: "cutter_polish_enabled", label: "Cutter + Polish" },
  { key: "roof_cleaning_enabled", label: "Roof Cleaning" },
  { key: "seat_cleaning_enabled", label: "Seat Cleaning" },
  { key: "corporate_fleet_enabled", label: "Corporate Fleet" },
  { key: "emergency_enabled", label: "Emergency Cleaning" },
];

function heatColor(z: Zone): string {
  if (z.status === "paused") return "#dc2626";
  if (z.daily_shine_enabled && z.premium_enabled) return "#22c55e";
  if (z.daily_shine_enabled) return "#3b82f6";
  if (z.premium_enabled) return "#f97316";
  return "#9ca3af";
}

function CoveragePage() {
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<Map<string, any>>(new Map());
  const drawingMgrRef = useRef<any>(null);
  const expansionMarkersRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Zone> | null>(null);
  const [opsView, setOpsView] = useState<null | "dashboard" | "calendar" | "alerts" | "history">(null);
  const [simZoneId, setSimZoneId] = useState<string | null>(null);

  const zonesQ = useQuery({
    queryKey: ["coverage-zones"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("coverage_zones").select("*").order("priority", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Zone[];
    },
  });

  const expansionQ = useQuery({
    queryKey: ["expansion-requests-map"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("expansion_requests").select("id, lat, lng, area_name, interested_service, phone, created_at").not("lat", "is", null).limit(500);
      return data ?? [];
    },
  });

  // Realtime — refresh on any zone change
  useEffect(() => {
    const ch = (supabase as any).channel("coverage-zones-rt").on("postgres_changes",
      { event: "*", schema: "public", table: "coverage_zones" },
      () => {
        qc.invalidateQueries({ queryKey: ["coverage-zones"] });
        qc.invalidateQueries({ queryKey: ["zone-dashboard"] });
        qc.invalidateQueries({ queryKey: ["zone-history"] });
      }
    ).on("postgres_changes", { event: "*", schema: "public", table: "coverage_alerts" },
      () => qc.invalidateQueries({ queryKey: ["zone-alerts"] })
    ).on("postgres_changes", { event: "*", schema: "public", table: "coverage_zone_calendar" },
      () => qc.invalidateQueries({ queryKey: ["zone-calendar"] })
    ).subscribe();
    return () => { (supabase as any).removeChannel(ch); };
  }, [qc]);

  // init map
  useEffect(() => {
    loadGoogleMaps().then(() => {
      if (!ref.current) return;
      mapRef.current = new window.google.maps.Map(ref.current, {
        center: { lat: 26.8467, lng: 80.9462 },
        zoom: 11,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      setReady(true);
    }).catch((e) => setError(String(e?.message ?? e)));
  }, []);

  // render zone overlays
  useEffect(() => {
    if (!ready || !mapRef.current || !zonesQ.data) return;
    const map = mapRef.current;
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current.clear();
    for (const z of zonesQ.data) {
      const fill = heatColor(z);
      const opts = { strokeColor: z.color, strokeWeight: 2, fillColor: fill, fillOpacity: 0.25, clickable: true };
      let ov: any;
      if (z.zone_type === "radius" && z.center_lat != null && z.center_lng != null && z.radius_m) {
        ov = new window.google.maps.Circle({ ...opts, center: { lat: z.center_lat, lng: z.center_lng }, radius: z.radius_m, map });
      } else if (z.zone_type === "polygon" && Array.isArray(z.polygon)) {
        const path = z.polygon.map((p) => ({ lat: p[1], lng: p[0] }));
        ov = new window.google.maps.Polygon({ ...opts, paths: path, map });
      }
      if (ov) {
        ov.addListener("click", () => setEditing(z));
        overlaysRef.current.set(z.id, ov);
      }
    }
  }, [ready, zonesQ.data]);

  // expansion request pins
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    expansionMarkersRef.current.forEach((m) => m.setMap(null));
    expansionMarkersRef.current = [];
    for (const r of (expansionQ.data ?? [])) {
      if (r.lat == null || r.lng == null) continue;
      const m = new window.google.maps.Marker({
        position: { lat: r.lat, lng: r.lng },
        map: mapRef.current,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 5, fillColor: "#ef4444", fillOpacity: 0.85, strokeColor: "#fff", strokeWeight: 1 },
        title: `${r.area_name ?? ""} • ${r.interested_service ?? ""}`,
      });
      expansionMarkersRef.current.push(m);
    }
  }, [ready, expansionQ.data]);

  const startRadiusDraw = () => {
    if (!ready) return;
    if (drawingMgrRef.current) drawingMgrRef.current.setMap(null);
    const dm = new window.google.maps.drawing.DrawingManager({
      drawingMode: window.google.maps.drawing.OverlayType.CIRCLE,
      drawingControl: false,
      circleOptions: { fillColor: "#3b82f6", fillOpacity: 0.2, strokeColor: "#3b82f6", strokeWeight: 2, editable: true },
    });
    dm.setMap(mapRef.current);
    drawingMgrRef.current = dm;
    window.google.maps.event.addListenerOnce(dm, "circlecomplete", (circle: any) => {
      const c = circle.getCenter();
      const r = circle.getRadius();
      circle.setMap(null);
      dm.setMap(null);
      drawingMgrRef.current = null;
      setEditing({
        zone_type: "radius", center_lat: c.lat(), center_lng: c.lng(), radius_m: Math.round(r),
        name: "", color: "#3b82f6", priority: 10, status: "active",
        daily_shine_enabled: true, premium_enabled: true,
        washing_enabled: true, interior_enabled: true, exterior_enabled: true, int_ext_enabled: true,
        deep_clean_enabled: true, polish_enabled: true, cutter_polish_enabled: true,
        roof_cleaning_enabled: true, seat_cleaning_enabled: true,
        corporate_fleet_enabled: false, emergency_enabled: true,
      } as Partial<Zone>);
    });
  };

  const startPolygonDraw = () => {
    if (!ready) return;
    if (drawingMgrRef.current) drawingMgrRef.current.setMap(null);
    const dm = new window.google.maps.drawing.DrawingManager({
      drawingMode: window.google.maps.drawing.OverlayType.POLYGON,
      drawingControl: false,
      polygonOptions: { fillColor: "#3b82f6", fillOpacity: 0.2, strokeColor: "#3b82f6", strokeWeight: 2, editable: true },
    });
    dm.setMap(mapRef.current);
    drawingMgrRef.current = dm;
    window.google.maps.event.addListenerOnce(dm, "polygoncomplete", (poly: any) => {
      const path = poly.getPath();
      const pts: number[][] = [];
      for (let i = 0; i < path.getLength(); i++) {
        const p = path.getAt(i);
        pts.push([p.lng(), p.lat()]);
      }
      poly.setMap(null);
      dm.setMap(null);
      drawingMgrRef.current = null;
      setEditing({
        zone_type: "polygon", polygon: pts,
        name: "", color: "#3b82f6", priority: 10, status: "active",
        daily_shine_enabled: true, premium_enabled: true,
        washing_enabled: true, interior_enabled: true, exterior_enabled: true, int_ext_enabled: true,
        deep_clean_enabled: true, polish_enabled: true, cutter_polish_enabled: true,
        roof_cleaning_enabled: true, seat_cleaning_enabled: true,
        corporate_fleet_enabled: false, emergency_enabled: true,
      } as Partial<Zone>);
    });
  };

  const save = async () => {
    if (!editing?.name) { toast.error("Zone name is required"); return; }
    const payload: any = { ...editing };
    if (editing.id) payload.id = editing.id;
    const { error } = await (supabase as any).rpc("admin_zone_upsert", { payload });
    if (error) { toast.error(error.message); return; }
    toast.success("Zone saved");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["coverage-zones"] });
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this zone?")) return;
    const { error } = await (supabase as any).rpc("admin_zone_delete", { p_id: id });
    if (error) { toast.error(error.message); return; }
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["coverage-zones"] });
  };
  const onDuplicate = async (id: string) => {
    const { error } = await (supabase as any).rpc("admin_zone_duplicate", { p_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Zone duplicated (paused)");
    qc.invalidateQueries({ queryKey: ["coverage-zones"] });
  };
  const onToggleStatus = async (z: Zone) => {
    const next = z.status === "active" ? "paused" : "active";
    await (supabase as any).rpc("admin_zone_set_status", { p_id: z.id, p_status: next });
    qc.invalidateQueries({ queryKey: ["coverage-zones"] });
  };

  const stats = useMemo(() => {
    const zs = zonesQ.data ?? [];
    return {
      total: zs.length,
      active: zs.filter((z) => z.status === "active").length,
      ds: zs.filter((z) => z.status === "active" && z.daily_shine_enabled).length,
      prem: zs.filter((z) => z.status === "active" && z.premium_enabled).length,
    };
  }, [zonesQ.data]);

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      <div className="flex items-center gap-2 border-b bg-card px-4 py-3">
        <MapPin className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Coverage Manager</h1>
        <div className="ml-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{stats.total} zones</Badge>
          <Badge variant="secondary">{stats.active} active</Badge>
          <Badge variant="secondary">DS: {stats.ds}</Badge>
          <Badge variant="secondary">Premium: {stats.prem}</Badge>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpsView("dashboard")}><BarChart3 className="mr-1 h-4 w-4" />Dashboard</Button>
          <Button size="sm" variant="outline" onClick={() => setOpsView("calendar")}><CalendarDays className="mr-1 h-4 w-4" />Calendar</Button>
          <Button size="sm" variant="outline" onClick={() => setOpsView("alerts")}><Bell className="mr-1 h-4 w-4" />Alerts</Button>
          <Button size="sm" variant="outline" onClick={() => setOpsView("history")}><History className="mr-1 h-4 w-4" />History</Button>
          <Button size="sm" onClick={startRadiusDraw} disabled={!ready}><Plus className="mr-1 h-4 w-4" />Radius Zone</Button>
          <Button size="sm" variant="outline" onClick={startPolygonDraw} disabled={!ready}><Plus className="mr-1 h-4 w-4" />Polygon</Button>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 shrink-0 overflow-y-auto border-r bg-card">
          <div className="p-3 text-xs font-semibold uppercase text-muted-foreground">Zones</div>
          {(zonesQ.data ?? []).map((z) => (
            <button key={z.id} onClick={() => setEditing(z)} className="flex w-full items-start gap-2 border-b px-3 py-2 text-left hover:bg-accent">
              <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: heatColor(z) }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{z.name}</span>
                  {z.status === "paused" && <Badge variant="destructive" className="h-4 text-[10px]">Paused</Badge>}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {z.zone_type} • priority {z.priority}
                  {z.zone_type === "radius" && z.radius_m ? ` • ${(z.radius_m / 1000).toFixed(1)}km` : ""}
                </div>
                <div className="mt-0.5 flex gap-1 text-[10px]">
                  {z.daily_shine_enabled && <span className="rounded bg-blue-100 px-1 text-blue-700">DS</span>}
                  {z.premium_enabled && <span className="rounded bg-orange-100 px-1 text-orange-700">Prem</span>}
                </div>
              </div>
            </button>
          ))}
        </aside>
        <main className="relative flex-1">
          {error && <div className="absolute inset-0 z-10 grid place-items-center bg-background/80 p-6 text-center text-sm text-destructive">{error}</div>}
          {!ready && !error && <div className="absolute inset-0 z-10 grid place-items-center bg-background/60"><Loader2 className="h-6 w-6 animate-spin" /></div>}
          <div ref={ref} className="h-full w-full" />
          <div className="absolute bottom-3 left-3 rounded-md border bg-card/95 p-2 text-[11px] shadow">
            <div className="mb-1 font-semibold">Heat Map</div>
            <Legend color="#22c55e" label="Daily Shine + Premium" />
            <Legend color="#3b82f6" label="Daily Shine only" />
            <Legend color="#f97316" label="Premium only" />
            <Legend color="#9ca3af" label="No services" />
            <Legend color="#dc2626" label="Paused" />
          </div>
        </main>
      </div>
      <ZoneEditor zone={editing} onClose={() => setEditing(null)} onChange={setEditing}
        onSave={save} onDelete={onDelete} onDuplicate={onDuplicate} onToggleStatus={onToggleStatus}
        onSimulate={(id) => setSimZoneId(id)} />
      <OperationsSheet view={opsView} onClose={() => setOpsView(null)} zones={zonesQ.data ?? []} />
      <SimulateDialog zoneId={simZoneId} onClose={() => setSimZoneId(null)} />
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      <span>{label}</span>
    </div>
  );
}

function ZoneEditor({ zone, onClose, onChange, onSave, onDelete, onDuplicate, onToggleStatus }: {
  zone: Partial<Zone> | null;
  onClose: () => void;
  onChange: (z: Partial<Zone>) => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleStatus: (z: Zone) => void;
}) {
  if (!zone) return null;
  const set = (patch: Partial<Zone>) => onChange({ ...zone, ...patch });
  const isExisting = !!zone.id;

  return (
    <Dialog open={!!zone} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isExisting ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {isExisting ? "Edit Zone" : "New Zone"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Zone Name</Label>
              <Input value={zone.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="Lucknow – Daily Shine East" />
            </div>
            <div>
              <Label>City</Label>
              <Input value={zone.city ?? ""} onChange={(e) => set({ city: e.target.value })} placeholder="Lucknow" />
            </div>
            <div>
              <Label>Priority</Label>
              <Input type="number" value={zone.priority ?? 10} onChange={(e) => set({ priority: parseInt(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>Color</Label>
              <Input type="color" value={zone.color ?? "#3b82f6"} onChange={(e) => set({ color: e.target.value })} />
            </div>
            {zone.zone_type === "radius" && (
              <div className="col-span-2">
                <Label>Radius (metres) — {zone.radius_m ?? 0} m ({((zone.radius_m ?? 0) / 1000).toFixed(1)} km)</Label>
                <Input type="number" min={500} max={25000} value={zone.radius_m ?? 0} onChange={(e) => set({ radius_m: parseInt(e.target.value) || 0 })} />
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold">Services Available</div>
            <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
              {SERVICE_FLAGS.map((s) => (
                <label key={s.key as string} className="flex items-center justify-between gap-2 text-sm">
                  <span>{s.label}</span>
                  <Switch checked={!!(zone as any)[s.key]} onCheckedChange={(v) => set({ [s.key]: v } as any)} />
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold">Capacity & Routing (overrides)</div>
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Max Daily Capacity" v={zone.max_daily_capacity} onChange={(n) => set({ max_daily_capacity: n })} />
              <NumField label="Max Active Partners" v={zone.max_active_partners} onChange={(n) => set({ max_active_partners: n })} />
              <NumField label="Assignment Radius (m)" v={zone.assignment_radius_m} onChange={(n) => set({ assignment_radius_m: n })} />
              <NumField label="Route Opt Radius (m)" v={zone.route_optimization_radius_m} onChange={(n) => set({ route_optimization_radius_m: n })} />
              <NumField label="Travel Buffer (min)" v={zone.travel_buffer_min} onChange={(n) => set({ travel_buffer_min: n })} />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {isExisting && (
            <>
              <Button variant="outline" size="sm" onClick={() => onToggleStatus(zone as Zone)}>
                {zone.status === "active" ? <><Pause className="mr-1 h-4 w-4" />Pause</> : <><Play className="mr-1 h-4 w-4" />Resume</>}
              </Button>
              <Button variant="outline" size="sm" onClick={() => onDuplicate(zone.id!)}><Copy className="mr-1 h-4 w-4" />Duplicate</Button>
              <Button variant="destructive" size="sm" onClick={() => onDelete(zone.id!)}><Trash2 className="mr-1 h-4 w-4" />Delete</Button>
            </>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumField({ label, v, onChange }: { label: string; v: number | null | undefined; onChange: (n: number | null) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type="number" value={v ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : parseInt(e.target.value))} />
    </div>
  );
}
