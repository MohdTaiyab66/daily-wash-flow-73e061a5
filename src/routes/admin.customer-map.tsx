import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCustomersForMap } from "@/lib/ops.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEffect, useRef, useState } from "react";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

export const Route = createFileRoute("/admin/customer-map")({
  component: CustomerMapPage,
});

function CustomerMapPage() {
  const fn = useServerFn(listCustomersForMap);
  useRealtimeInvalidation(["customers", "vehicles", "services"], [["admin-customer-map"]]);
  const { data } = useQuery({ queryKey: ["admin-customer-map"], queryFn: () => fn() });
  const rows = data ?? [];
  const groups: Record<string, any[]> = {};
  rows.forEach((r: any) => { (groups[r.area] ??= []).push(r); });

  const counts = {
    active: rows.filter((r: any) => r.bucket === "active").length,
    renewal_due: rows.filter((r: any) => r.bucket === "renewal_due").length,
    inactive: rows.filter((r: any) => r.bucket === "inactive").length,
  };

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Customer Map</h1>
      <p className="mt-1 text-sm text-muted-foreground">Grouped by area · color-coded by subscription state.</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Legend tone="bg-emerald-600" label={`Active · ${counts.active}`} />
        <Legend tone="bg-amber-500" label={`Renewal due · ${counts.renewal_due}`} />
        <Legend tone="bg-destructive" label={`Inactive · ${counts.inactive}`} />
      </div>

      <div className="mt-6">
        <CustomerPinMap rows={rows} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {Object.entries(groups).sort().map(([area, list]) => (
          <Card key={area} className="p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{area}</h2>
              <span className="text-2xl font-semibold">{list.length}</span>
            </div>
            <div className="mt-3 grid gap-2">
              {list.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${dotFor(c.bucket)}`} />
                    <span className="truncate">{c.full_name}</span>
                  </div>
                  <Badge variant="outline" className="capitalize text-[10px]">{c.bucket.replace("_", " ")}</Badge>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CustomerPinMap({ rows }: { rows: any[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!window.google?.maps) {
        const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
        if (!key) throw new Error("missing key");
        await new Promise<void>((resolve) => {
          window.__initLovableMap = () => resolve();
          const s = document.createElement("script");
          s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__initLovableMap`;
          s.async = true;
          document.head.appendChild(s);
        });
      }
      if (!ref.current || mapRef.current) return;
      mapRef.current = new window.google.maps.Map(ref.current, { center: { lat: 26.8467, lng: 80.9462 }, zoom: 12, mapTypeControl: false, streetViewControl: false });
    };
    load().catch(() => setError(true));
  }, []);

  useEffect(() => {
    if (!mapRef.current || !window.google?.maps) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    const bounds = new window.google.maps.LatLngBounds();
    rows.forEach((c) => {
      const pos = { lat: Number(c.latitude), lng: Number(c.longitude) };
      const marker = new window.google.maps.Marker({ position: pos, map: mapRef.current, title: c.full_name, icon: markerIcon(c.bucket) });
      const vehicle = c.vehicles?.[0];
      const info = new window.google.maps.InfoWindow({ content: `<div style="font:14px system-ui;min-width:220px"><b>${c.full_name}</b><br/>+91 ${c.phone ?? "—"}<br/>${c.area ?? "—"}<br/>${vehicle ? `${vehicle.make ?? ""} ${vehicle.model ?? ""} · ${vehicle.registration_number ?? ""}` : "No vehicle"}<br/>Plan: ${c.subscription_plan ?? "—"}<br/>Renewal: ${c.subscription_end ?? "—"}<br/>Partner: ${c.assigned_partner?.full_name ?? "Unassigned"}</div>` });
      marker.addListener("click", () => info.open({ anchor: marker, map: mapRef.current }));
      markersRef.current.push(marker);
      bounds.extend(pos);
    });
    if (rows.length) mapRef.current.fitBounds(bounds, 48);
  }, [rows]);

  return <Card className="overflow-hidden p-0"><div ref={ref} className="h-[520px] w-full bg-muted" />{error && <p className="p-4 text-sm text-muted-foreground">Map unavailable.</p>}</Card>;
}

function markerIcon(bucket: string) {
  const color = bucket === "active" ? "#16a34a" : bucket === "renewal_due" ? "#f59e0b" : "#dc2626";
  return { path: window.google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: color, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 };
}

function dotFor(b: string) {
  if (b === "active") return "bg-emerald-600";
  if (b === "renewal_due") return "bg-amber-500";
  return "bg-destructive";
}
function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs">
      <span className={`h-2 w-2 rounded-full ${tone}`} />{label}
    </div>
  );
}
