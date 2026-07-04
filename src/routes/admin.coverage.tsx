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

async function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return;
  // Already fully loaded with drawing lib
  if (window.google?.maps?.drawing && window.google?.maps?.geometry) return;
  // Base API loaded (e.g. by LiveMap) without drawing — pull in additional libraries dynamically.
  if (window.google?.maps?.importLibrary) {
    await Promise.all([
      window.google.maps.importLibrary("drawing"),
      window.google.maps.importLibrary("geometry"),
      window.google.maps.importLibrary("maps"),
    ]);
    return;
  }
  // Wait for an in-flight base load then import libraries
  if (window.__lovableMapReady) {
    await window.__lovableMapReady;
    if (window.google?.maps?.importLibrary) {
      await Promise.all([
        window.google.maps.importLibrary("drawing"),
        window.google.maps.importLibrary("geometry"),
      ]);
    }
    return;
  }
  // Cold load — include drawing + geometry up front.
  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  if (!key) throw new Error("Google Maps key missing");
  window.__lovableMapReady = new Promise<void>((resolve, reject) => {
    window.__initLovableMap = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__initLovableMap&libraries=geometry,drawing&v=weekly`;
    s.async = true;
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  await window.__lovableMapReady;
}

type Zone = {
  id: string; name: string; city: string | null; color: string; priority: number;
  zone_type: "polygon"; status: "active" | "paused" | "coming_soon";
  polygon: number[][] | null;
  daily_shine_enabled: boolean; premium_enabled: boolean;
  washing_enabled: boolean; interior_enabled: boolean; exterior_enabled: boolean;
  int_ext_enabled: boolean; deep_clean_enabled: boolean; polish_enabled: boolean;
  cutter_polish_enabled: boolean; roof_cleaning_enabled: boolean; seat_cleaning_enabled: boolean;
  corporate_fleet_enabled: boolean; emergency_enabled: boolean;
  max_daily_capacity: number | null; max_active_partners: number | null;
  assignment_radius_m: number | null; route_optimization_radius_m: number | null;
  travel_buffer_min: number | null;
  max_cars_per_partner: number; max_route_distance_km: number; max_travel_time_min: number;
  start_time: string; finish_time: string;
  preferred_partner_ids: string[]; backup_partner_ids: string[]; neighbour_expand: boolean;
};

// Spherical polygon area in km² using the shoelace formula on lat/lng.
function polygonAreaKm2(pts: number[][] | null | undefined): number {
  if (!pts || pts.length < 3) return 0;
  const R = 6371; // km
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += ((x2 - x1) * Math.PI / 180) * (2 + Math.sin((y1 * Math.PI) / 180) + Math.sin((y2 * Math.PI) / 180));
  }
  return Math.abs((s * R * R) / 2);
}

// Lucknow locality presets — approximate bounding polygons. Admin can adjust
// vertices after loading. Coordinates are [lng, lat].
const LUCKNOW_LOCALITIES: Array<{ name: string; polygon: number[][] }> = [
  { name: "Gomti Nagar",   polygon: [[80.980, 26.840], [81.030, 26.840], [81.030, 26.870], [80.980, 26.870]] },
  { name: "Indira Nagar",  polygon: [[80.970, 26.870], [81.020, 26.870], [81.020, 26.900], [80.970, 26.900]] },
  { name: "Aliganj",       polygon: [[80.920, 26.880], [80.960, 26.880], [80.960, 26.910], [80.920, 26.910]] },
  { name: "Jankipuram",    polygon: [[80.910, 26.910], [80.960, 26.910], [80.960, 26.945], [80.910, 26.945]] },
  { name: "Hazratganj",    polygon: [[80.935, 26.845], [80.960, 26.845], [80.960, 26.865], [80.935, 26.865]] },
  { name: "Mahanagar",     polygon: [[80.940, 26.875], [80.975, 26.875], [80.975, 26.900], [80.940, 26.900]] },
  { name: "Ashiyana",      polygon: [[80.895, 26.795], [80.935, 26.795], [80.935, 26.825], [80.895, 26.825]] },
  { name: "Alambagh",      polygon: [[80.885, 26.810], [80.920, 26.810], [80.920, 26.840], [80.885, 26.840]] },
  { name: "Chinhat",       polygon: [[81.020, 26.855], [81.060, 26.855], [81.060, 26.885], [81.020, 26.885]] },
  { name: "Rajajipuram",   polygon: [[80.870, 26.840], [80.905, 26.840], [80.905, 26.870], [80.870, 26.870]] },
  { name: "Vikas Nagar",   polygon: [[80.910, 26.895], [80.945, 26.895], [80.945, 26.920], [80.910, 26.920]] },
  { name: "Kaiserbagh",    polygon: [[80.915, 26.855], [80.940, 26.855], [80.940, 26.875], [80.915, 26.875]] },
];

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

// Segment intersection test (proper crossings only; shared endpoints allowed).
function segmentsCross(a: number[], b: number[], c: number[], d: number[]): boolean {
  const o = (p: number[], q: number[], r: number[]) =>
    Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}
function isSelfIntersecting(pts: number[][]): boolean {
  const n = pts.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Skip adjacent segments (share a vertex)
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const c = pts[j], d = pts[(j + 1) % n];
      if (segmentsCross(a, b, c, d)) return true;
    }
  }
  return false;
}

// Bbox of a polygon in [minLat, minLng, maxLat, maxLng].
type Bbox = [number, number, number, number];
function polygonBbox(pts: number[][]): Bbox {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of pts) {
    if (p[1] < minLat) minLat = p[1];
    if (p[1] > maxLat) maxLat = p[1];
    if (p[0] < minLng) minLng = p[0];
    if (p[0] > maxLng) maxLng = p[0];
  }
  return [minLat, minLng, maxLat, maxLng];
}
function boundsIntersect(gBounds: any, bb: Bbox): boolean {
  if (!gBounds) return true;
  const sw = gBounds.getSouthWest(); const ne = gBounds.getNorthEast();
  return !(bb[2] < sw.lat() || bb[0] > ne.lat() || bb[3] < sw.lng() || bb[1] > ne.lng());
}

// Stable signature — if this string is unchanged we skip re-creating the overlay.
function zoneSignature(z: Zone, editable: boolean): string {
  return [
    z.status, z.color, heatColor(z), editable ? "1" : "0",
    `p:${JSON.stringify(z.polygon)}`,
  ].join("|");
}

function buildOverlay(
  z: Zone,
  map: any,
  opts: { editable: boolean; onClick: () => void; onEditCommit: (pts: number[][]) => void },
) {
  if (!Array.isArray(z.polygon) || z.polygon.length < 3) return null;
  const fill = heatColor(z);
  const base = { strokeColor: z.color, strokeWeight: 2, fillColor: fill, fillOpacity: 0.25, clickable: true };
  const path = z.polygon.map((p) => ({ lat: p[1], lng: p[0] }));
  const overlay: any = new window.google.maps.Polygon({ ...base, paths: path, map, editable: opts.editable, draggable: false });
  const cull = polygonBbox(z.polygon);
  const listeners: any[] = [];
  const editListeners: any[] = [];
  if (opts.editable) {
    const commit = () => {
      const p = overlay.getPath();
      const pts: number[][] = [];
      for (let i = 0; i < p.getLength(); i++) { const v = p.getAt(i); pts.push([v.lng(), v.lat()]); }
      opts.onEditCommit(pts);
    };
    const p0 = overlay.getPath();
    editListeners.push(window.google.maps.event.addListener(p0, "set_at", commit));
    editListeners.push(window.google.maps.event.addListener(p0, "insert_at", commit));
    editListeners.push(window.google.maps.event.addListener(p0, "remove_at", commit));
  }
  listeners.push(overlay.addListener("click", opts.onClick));
  return { overlay, sig: "", listeners, editListeners, type: "polygon" as const, cull };
}




function CoveragePage() {
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  // Overlay cache: id → { overlay, signature, listeners, editListeners }
  const overlaysRef = useRef<Map<string, { overlay: any; sig: string; listeners: any[]; editListeners: any[]; type: "polygon" }>>(new Map());
  const drawingMgrRef = useRef<any>(null);
  const expansionMarkersRef = useRef<any[]>([]);
  const boundsRef = useRef<any>(null);
  const boundsTimerRef = useRef<any>(null);
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
      // Viewport culling — remember bounds; re-apply visibility on debounced idle.
      const applyBoundsCull = () => {
        if (!mapRef.current) return;
        boundsRef.current = mapRef.current.getBounds();
        const b = boundsRef.current;
        if (!b) return;
        for (const [, entry] of overlaysRef.current) {
          const meta = (entry as any).cull;
          if (!meta) { entry.overlay.setMap(mapRef.current); continue; }
          const visible = boundsIntersect(b, meta);
          entry.overlay.setMap(visible ? mapRef.current : null);
        }
      };
      mapRef.current.addListener("idle", () => {
        clearTimeout(boundsTimerRef.current);
        boundsTimerRef.current = setTimeout(applyBoundsCull, 120);
      });
      setReady(true);
    }).catch((e) => setError(String(e?.message ?? e)));
  }, []);

  // Diff-based zone overlay render.
  // - Never rebuilds unchanged overlays (avoids Google Maps DOM churn).
  // - Only the currently-selected polygon is editable — editable polygons carry
  //   per-vertex handles which get very expensive at 100–500 zones.
  // - Viewport culling: overlays outside the current map bounds are detached.
  useEffect(() => {
    if (!ready || !mapRef.current || !zonesQ.data) return;
    const map = mapRef.current;
    const nextIds = new Set<string>();
    const selectedId = editing?.id;

    for (const z of zonesQ.data) {
      nextIds.add(z.id);
      const sig = zoneSignature(z, selectedId === z.id);
      const existing = overlaysRef.current.get(z.id);
      if (existing && existing.sig === sig) continue; // unchanged
      if (existing) {
        existing.listeners.forEach((l) => window.google.maps.event.removeListener(l));
        existing.editListeners.forEach((l) => window.google.maps.event.removeListener(l));
        existing.overlay.setMap(null);
        overlaysRef.current.delete(z.id);
      }
      const built = buildOverlay(z, map, {
        editable: selectedId === z.id,
        onClick: () => setEditing(z),
        onEditCommit: async (pts) => {
          if (pts.length < 3) return;
          if (isSelfIntersecting(pts)) {
            toast.error("Edit rejected — edges would cross.");
            qc.invalidateQueries({ queryKey: ["coverage-zones"] });
            return;
          }
          const { error } = await (supabase as any).rpc("admin_zone_upsert", { payload: { id: z.id, polygon: pts } });
          if (error) toast.error(error.message);
          else qc.invalidateQueries({ queryKey: ["coverage-zones"] });
        },
      });
      if (built) { built.sig = sig; overlaysRef.current.set(z.id, built); }
    }
    // Remove overlays for zones that no longer exist.
    for (const [id, entry] of overlaysRef.current) {
      if (nextIds.has(id)) continue;
      entry.listeners.forEach((l) => window.google.maps.event.removeListener(l));
      entry.editListeners.forEach((l) => window.google.maps.event.removeListener(l));
      entry.overlay.setMap(null);
      overlaysRef.current.delete(id);
    }
    // Re-apply viewport culling to the fresh set.
    const b = mapRef.current?.getBounds?.();
    if (b) {
      for (const [, entry] of overlaysRef.current) {
        const meta = (entry as any).cull;
        entry.overlay.setMap(!meta || boundsIntersect(b, meta) ? map : null);
      }
    }
  }, [ready, zonesQ.data, editing?.id, qc]);


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

  // Preset a new polygon zone from a Lucknow locality template.
  const startFromLocality = (loc: { name: string; polygon: number[][] }) => {
    if (mapRef.current && window.google?.maps) {
      const b = new window.google.maps.LatLngBounds();
      for (const [lng, lat] of loc.polygon) b.extend({ lat, lng });
      mapRef.current.fitBounds(b);
    }
    setEditing({
      zone_type: "polygon", polygon: loc.polygon,
      name: `Lucknow – ${loc.name}`, city: "Lucknow",
      color: "#3b82f6", priority: 10, status: "active",
      daily_shine_enabled: true, premium_enabled: true,
      washing_enabled: true, interior_enabled: true, exterior_enabled: true, int_ext_enabled: true,
      deep_clean_enabled: true, polish_enabled: true, cutter_polish_enabled: true,
      roof_cleaning_enabled: true, seat_cleaning_enabled: true,
      corporate_fleet_enabled: false, emergency_enabled: true,
    } as Partial<Zone>);
  };


  const startPolygonDraw = () => {
    if (!ready) return;
    if (!window.google?.maps?.drawing) {
      toast.error("Drawing library not loaded — reload the page and try again.");
      return;
    }
    if (drawingMgrRef.current) drawingMgrRef.current.setMap(null);
    const dm = new window.google.maps.drawing.DrawingManager({
      drawingMode: window.google.maps.drawing.OverlayType.POLYGON,
      drawingControl: false,
      polygonOptions: { fillColor: "#3b82f6", fillOpacity: 0.2, strokeColor: "#3b82f6", strokeWeight: 2, editable: true, draggable: true, clickable: true },
    });
    dm.setMap(mapRef.current);
    drawingMgrRef.current = dm;
    toast.info("Click on the map to add vertices. Double-click to finish. ESC to cancel.");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dm.setMap(null);
        drawingMgrRef.current = null;
        window.removeEventListener("keydown", onKey);
        toast.message("Drawing cancelled");
      }
    };
    window.addEventListener("keydown", onKey);
    window.google.maps.event.addListenerOnce(dm, "polygoncomplete", (poly: any) => {
      window.removeEventListener("keydown", onKey);
      const path = poly.getPath();
      const pts: number[][] = [];
      for (let i = 0; i < path.getLength(); i++) {
        const p = path.getAt(i);
        pts.push([p.lng(), p.lat()]);
      }
      poly.setMap(null);
      dm.setMap(null);
      drawingMgrRef.current = null;
      if (pts.length < 3) {
        toast.error("Polygon needs at least 3 vertices.");
        return;
      }
      if (isSelfIntersecting(pts)) {
        toast.error("Polygon edges cross — redraw without self-intersections.");
        return;
      }
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
          <LocalityMenu onPick={startFromLocality} disabled={!ready} />
          <Button size="sm" onClick={startPolygonDraw} disabled={!ready}><Plus className="mr-1 h-4 w-4" />New Zone</Button>

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
            <div className="mt-2 border-t pt-1 text-muted-foreground">
              Boundary rule: points on an edge or vertex count as <b>inside</b> (serviceable).
            </div>
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

function ZoneEditor({ zone, onClose, onChange, onSave, onDelete, onDuplicate, onToggleStatus, onSimulate }: {
  zone: Partial<Zone> | null;
  onClose: () => void;
  onChange: (z: Partial<Zone>) => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleStatus: (z: Zone) => void;
  onSimulate: (id: string) => void;
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
          {zone.zone_type === "polygon" && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-[11px] text-blue-900">
              <b>Boundary rule:</b> customer GPS points on a polygon edge or vertex are treated as <b>inside</b> this zone (serviceable). The same rule applies to booking, partner assignment, and Daily Shine routing.
            </div>
          )}
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
              <NumField label="Max Cars / Partner" v={zone.max_cars_per_partner ?? 30} onChange={(n) => set({ max_cars_per_partner: (n ?? 30) as any })} />
              <NumField label="Max Daily Capacity (override)" v={zone.max_daily_capacity} onChange={(n) => set({ max_daily_capacity: n })} />
              <NumField label="Max Active Partners" v={zone.max_active_partners} onChange={(n) => set({ max_active_partners: n })} />
              <NumField label="Max Route Distance (km)" v={zone.max_route_distance_km as any} onChange={(n) => set({ max_route_distance_km: (n ?? 8) as any })} />
              <NumField label="Max Travel Time (min)" v={zone.max_travel_time_min as any} onChange={(n) => set({ max_travel_time_min: (n ?? 90) as any })} />
              <NumField label="Assignment Radius (m)" v={zone.assignment_radius_m} onChange={(n) => set({ assignment_radius_m: n })} />
              <NumField label="Route Opt Radius (m)" v={zone.route_optimization_radius_m} onChange={(n) => set({ route_optimization_radius_m: n })} />
              <NumField label="Travel Buffer (min)" v={zone.travel_buffer_min} onChange={(n) => set({ travel_buffer_min: n })} />
              <div>
                <Label>Start Time</Label>
                <Input type="time" value={(zone.start_time ?? "07:00").slice(0,5)} onChange={(e) => set({ start_time: e.target.value as any })} />
              </div>
              <div>
                <Label>Finish Time</Label>
                <Input type="time" value={(zone.finish_time ?? "14:00").slice(0,5)} onChange={(e) => set({ finish_time: e.target.value as any })} />
              </div>
              <label className="col-span-2 flex items-center justify-between rounded-md border p-2 text-sm">
                <span>Expand into neighbouring zones if no partners</span>
                <Switch checked={zone.neighbour_expand !== false} onCheckedChange={(v) => set({ neighbour_expand: v as any })} />
              </label>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {isExisting && (
            <>
              <Button variant="outline" size="sm" onClick={() => onToggleStatus(zone as Zone)}>
                {zone.status === "active" ? <><Pause className="mr-1 h-4 w-4" />Pause</> : <><Play className="mr-1 h-4 w-4" />Resume</>}
              </Button>
              <Button variant="outline" size="sm" onClick={() => onSimulate(zone.id!)}><FlaskConical className="mr-1 h-4 w-4" />Simulate</Button>
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

// ============================================================================
// Operations Sheet — Dashboard / Calendar / Alerts / History
// ============================================================================

type DashRow = {
  zone_id: string; zone_name: string; status: string;
  daily_shine_enabled: boolean; premium_enabled: boolean;
  active_customers: number; ds_customers: number; premium_customers: number;
  active_partners: number; available_partners: number;
  marketplace_queue: number; leads_pending: number;
  services_today: number; services_completed: number;
  revenue_today: number; revenue_month: number;
  renewals_today: number; complaints_open: number; avg_rating: number;
  daily_capacity: number; booked: number; remaining: number; capacity_used_pct: number;
  calendar_ds_on: boolean; calendar_premium_on: boolean;
};

function capacityColor(p: number, status: string) {
  if (status === "coming_soon") return "#9ca3af";
  if (status === "paused") return "#dc2626";
  if (p >= 100) return "#dc2626";
  if (p >= 90) return "#f97316";
  if (p >= 60) return "#eab308";
  return "#22c55e";
}

function OperationsSheet({ view, onClose, zones }: { view: null | "dashboard" | "calendar" | "alerts" | "history"; onClose: () => void; zones: Zone[] }) {
  const qc = useQueryClient();
  const dashQ = useQuery({
    queryKey: ["zone-dashboard"],
    enabled: view !== null,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_zone_dashboard");
      if (error) throw error;
      return (data ?? []) as DashRow[];
    },
    refetchInterval: 30_000,
  });

  return (
    <Dialog open={view !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>Coverage Operations</DialogTitle>
        </DialogHeader>
        <Tabs value={view ?? "dashboard"} className="flex h-[80vh] flex-col">
          <TabsList className="mx-4 mt-2 grid grid-cols-4">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <div className="flex-1 overflow-auto p-4">
            <TabsContent value="dashboard" className="m-0">
              <DashboardTab rows={dashQ.data ?? []} loading={dashQ.isLoading} />
            </TabsContent>
            <TabsContent value="calendar" className="m-0">
              <CalendarTab zones={zones} />
            </TabsContent>
            <TabsContent value="alerts" className="m-0">
              <AlertsTab onChanged={() => qc.invalidateQueries({ queryKey: ["zone-alerts"] })} />
            </TabsContent>
            <TabsContent value="history" className="m-0">
              <HistoryTab zones={zones} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function DashboardTab({ rows, loading }: { rows: DashRow[]; loading: boolean }) {
  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (rows.length === 0) return <div className="p-4 text-sm text-muted-foreground">No zones yet.</div>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((r) => (
        <div key={r.zone_id} className="rounded-lg border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">{r.zone_name}</div>
              <div className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
                <Badge variant={r.status === "active" ? "default" : r.status === "paused" ? "destructive" : "secondary"} className="h-4">{r.status}</Badge>
                {r.daily_shine_enabled && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">DS {r.calendar_ds_on ? "" : "(paused today)"}</span>}
                {r.premium_enabled && <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-700">Premium {r.calendar_premium_on ? "" : "(paused today)"}</span>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase text-muted-foreground">Capacity</div>
              <div className="text-lg font-semibold" style={{ color: capacityColor(Number(r.capacity_used_pct), r.status) }}>
                {Number(r.capacity_used_pct).toFixed(0)}%
              </div>
              <div className="text-[11px] text-muted-foreground">{r.booked}/{r.daily_capacity} • {r.remaining} free</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
            <Metric label="Customers" v={r.active_customers} />
            <Metric label="DS" v={r.ds_customers} />
            <Metric label="Premium" v={r.premium_customers} />
            <Metric label="Partners" v={r.active_partners} />
            <Metric label="Available" v={r.available_partners} />
            <Metric label="Queue" v={r.marketplace_queue} />
            <Metric label="Leads" v={r.leads_pending} />
            <Metric label="Today" v={r.services_today} />
            <Metric label="Done" v={r.services_completed} />
            <Metric label="Revenue Today" v={`₹${Number(r.revenue_today).toLocaleString()}`} />
            <Metric label="Revenue Month" v={`₹${Number(r.revenue_month).toLocaleString()}`} />
            <Metric label="Renewals" v={r.renewals_today} />
            <Metric label="Complaints" v={r.complaints_open} />
            <Metric label="Avg Rating" v={Number(r.avg_rating).toFixed(2)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Metric({ label, v }: { label: string; v: any }) {
  return (
    <div className="rounded border bg-background px-2 py-1">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{v}</div>
    </div>
  );
}

// ---- Calendar tab ---------------------------------------------------------

const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function CalendarTab({ zones }: { zones: Zone[] }) {
  const qc = useQueryClient();
  const [zoneId, setZoneId] = useState<string>(zones[0]?.id ?? "");
  useEffect(() => { if (!zoneId && zones[0]) setZoneId(zones[0].id); }, [zones, zoneId]);

  const calQ = useQuery({
    queryKey: ["zone-calendar", zoneId],
    enabled: !!zoneId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("coverage_zone_calendar").select("*").eq("zone_id", zoneId).order("date_from", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [form, setForm] = useState<{ date_from: string; date_to: string; dow: number[]; ds: boolean; premium: boolean; reason: string }>({
    date_from: "", date_to: "", dow: [], ds: false, premium: true, reason: "",
  });

  const add = async () => {
    if (!zoneId) return;
    const { error } = await (supabase as any).rpc("admin_zone_calendar_upsert", {
      p_id: null, p_zone: zoneId,
      p_from: form.date_from || null,
      p_to: form.date_to || null,
      p_dow: form.dow,
      p_ds: form.ds,
      p_premium: form.premium,
      p_reason: form.reason || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Calendar entry added");
    setForm({ date_from: "", date_to: "", dow: [], ds: false, premium: true, reason: "" });
    qc.invalidateQueries({ queryKey: ["zone-calendar", zoneId] });
  };

  const del = async (id: string) => {
    if (!confirm("Remove this calendar entry?")) return;
    await (supabase as any).rpc("admin_zone_calendar_delete", { p_id: id });
    qc.invalidateQueries({ queryKey: ["zone-calendar", zoneId] });
  };

  return (
    <div className="grid gap-4">
      <div>
        <Label>Zone</Label>
        <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="block w-full rounded-md border bg-background px-2 py-2 text-sm">
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
      </div>

      <div className="rounded-md border p-3">
        <div className="mb-2 text-sm font-semibold">Add pause / availability rule</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>From date</Label>
            <Input type="date" value={form.date_from} onChange={(e) => setForm({ ...form, date_from: e.target.value })} />
          </div>
          <div>
            <Label>To date (optional)</Label>
            <Input type="date" value={form.date_to} onChange={(e) => setForm({ ...form, date_to: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Recurring days (optional)</Label>
            <div className="mt-1 flex gap-1">
              {DOW.map((d, i) => {
                const active = form.dow.includes(i);
                return (
                  <button key={i} type="button" onClick={() => setForm({ ...form, dow: active ? form.dow.filter((x) => x !== i) : [...form.dow, i] })}
                    className={`rounded px-2 py-1 text-xs ${active ? "bg-primary text-primary-foreground" : "border"}`}>{d}</button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center justify-between rounded border p-2 text-sm">
            <span>Daily Shine On</span>
            <Switch checked={form.ds} onCheckedChange={(v) => setForm({ ...form, ds: v })} />
          </label>
          <label className="flex items-center justify-between rounded border p-2 text-sm">
            <span>Premium On</span>
            <Switch checked={form.premium} onCheckedChange={(v) => setForm({ ...form, premium: v })} />
          </label>
          <div className="col-span-2">
            <Label>Reason</Label>
            <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Festival, rain alert, maintenance…" />
          </div>
        </div>
        <div className="mt-2 text-right">
          <Button size="sm" onClick={add}>Add rule</Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow><TableHead>Range</TableHead><TableHead>Recurring</TableHead><TableHead>DS</TableHead><TableHead>Prem</TableHead><TableHead>Reason</TableHead><TableHead /></TableRow>
        </TableHeader>
        <TableBody>
          {(calQ.data ?? []).map((c: any) => (
            <TableRow key={c.id}>
              <TableCell>{c.date_from ?? "—"}{c.date_to ? ` → ${c.date_to}` : ""}</TableCell>
              <TableCell>{(c.recurring_dow ?? []).map((i: number) => DOW[i]).join(", ") || "—"}</TableCell>
              <TableCell>{c.daily_shine_on ? "✓" : "✗"}</TableCell>
              <TableCell>{c.premium_on ? "✓" : "✗"}</TableCell>
              <TableCell className="max-w-[200px] truncate">{c.reason}</TableCell>
              <TableCell><Button size="sm" variant="ghost" onClick={() => del(c.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
            </TableRow>
          ))}
          {(calQ.data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">No rules yet</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

// ---- Alerts tab -----------------------------------------------------------

function AlertsTab({ onChanged }: { onChanged: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["zone-alerts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("coverage_alerts")
        .select("*, coverage_zones(name)").is("resolved_at", null).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const recompute = async () => {
    const { error } = await (supabase as any).rpc("compute_coverage_alerts");
    if (error) { toast.error(error.message); return; }
    toast.success("Alerts refreshed");
    qc.invalidateQueries({ queryKey: ["zone-alerts"] });
  };
  const resolve = async (id: string) => {
    await (supabase as any).rpc("admin_resolve_alert", { p_alert: id });
    qc.invalidateQueries({ queryKey: ["zone-alerts"] });
    onChanged();
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{(q.data ?? []).length} open</div>
        <Button size="sm" variant="outline" onClick={recompute}>Recompute alerts</Button>
      </div>
      {(q.data ?? []).map((a: any) => (
        <div key={a.id} className="flex items-center gap-3 rounded-md border bg-card p-3">
          <Bell className={`h-4 w-4 ${a.severity === "critical" ? "text-red-600" : "text-orange-500"}`} />
          <div className="flex-1">
            <div className="text-sm font-medium">{a.coverage_zones?.name ?? "—"} · {a.kind}</div>
            <div className="text-xs text-muted-foreground">{a.message}</div>
          </div>
          <div className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
          <Button size="sm" variant="ghost" onClick={() => resolve(a.id)}><CheckCircle2 className="mr-1 h-4 w-4" />Resolve</Button>
        </div>
      ))}
      {(q.data ?? []).length === 0 && <div className="rounded border p-6 text-center text-sm text-muted-foreground">No open alerts.</div>}
    </div>
  );
}

// ---- History tab ----------------------------------------------------------

function HistoryTab({ zones }: { zones: Zone[] }) {
  const qc = useQueryClient();
  const [zoneId, setZoneId] = useState<string>("");
  const q = useQuery({
    queryKey: ["zone-history", zoneId],
    queryFn: async () => {
      let qb: any = (supabase as any).from("coverage_zone_history").select("*").order("at", { ascending: false }).limit(200);
      if (zoneId) qb = qb.eq("zone_id", zoneId);
      const { data, error } = await qb;
      if (error) throw error;
      return data ?? [];
    },
  });
  const rollback = async (id: string) => {
    if (!confirm("Restore the zone to this earlier version?")) return;
    const { error } = await (supabase as any).rpc("admin_zone_rollback", { p_history_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Zone restored");
    qc.invalidateQueries({ queryKey: ["coverage-zones"] });
    qc.invalidateQueries({ queryKey: ["zone-history"] });
  };
  return (
    <div className="grid gap-3">
      <div>
        <Label>Filter by zone</Label>
        <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="block w-full rounded-md border bg-background px-2 py-2 text-sm">
          <option value="">All zones</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
      </div>
      <Table>
        <TableHeader>
          <TableRow><TableHead>When</TableHead><TableHead>Zone</TableHead><TableHead>Action</TableHead><TableHead>Operator</TableHead><TableHead /></TableRow>
        </TableHeader>
        <TableBody>
          {(q.data ?? []).map((h: any) => {
            const name = h.after?.name ?? h.before?.name ?? "—";
            return (
              <TableRow key={h.id}>
                <TableCell className="whitespace-nowrap text-xs">{new Date(h.at).toLocaleString()}</TableCell>
                <TableCell className="text-sm">{name}</TableCell>
                <TableCell><Badge variant="secondary">{h.action}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{h.operator ?? "system"}</TableCell>
                <TableCell>
                  {h.before && (
                    <Button size="sm" variant="ghost" onClick={() => rollback(h.id)}><Undo2 className="mr-1 h-4 w-4" />Rollback</Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {(q.data ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No history</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

// ---- Simulate dialog -----------------------------------------------------

function SimulateDialog({ zoneId, onClose }: { zoneId: string | null; onClose: () => void }) {
  const [radius, setRadius] = useState<number>(5000);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setResult(null); }, [zoneId]);

  const run = async () => {
    if (!zoneId) return;
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("simulate_zone_change", { p_zone: zoneId, p_patch: { radius_m: radius } });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setResult(Array.isArray(data) ? data[0] : data);
  };

  return (
    <Dialog open={!!zoneId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Coverage Simulation</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>New radius (metres)</Label>
            <Input type="number" value={radius} onChange={(e) => setRadius(parseInt(e.target.value) || 0)} />
          </div>
          <Button onClick={run} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Preview impact"}</Button>
          {result && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Metric label="Δ Houses (est)" v={result.delta_houses} />
              <Metric label="Δ Customers" v={result.delta_customers} />
              <Metric label="Δ Requests" v={result.delta_requests} />
              <Metric label="Δ Partners" v={result.delta_partners} />
              <div className="col-span-2"><Metric label="Est. monthly revenue change" v={`₹${Number(result.est_monthly_revenue).toLocaleString()}`} /></div>
            </div>
          )}
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
