import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Loader2, MapPin } from "lucide-react";

declare global {
  interface Window {
    google: any;
    __initLovableMap?: () => void;
    __lovableMapReady?: Promise<void>;
  }
}

function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  if (window.__lovableMapReady) return window.__lovableMapReady;
  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  if (!key) return Promise.reject(new Error("Google Maps key missing"));
  window.__lovableMapReady = new Promise<void>((resolve) => {
    window.__initLovableMap = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__initLovableMap&libraries=geometry`;
    s.async = true;
    document.head.appendChild(s);
  });
  return window.__lovableMapReady;
}

export type MapStop = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  sequence: number;
  status: "next" | "pending" | "completed" | "delayed" | "unavailable" | "emergency";
  clusterId?: string | null;
};

const COLORS: Record<MapStop["status"], string> = {
  next: "#1d4ed8",
  pending: "#f97316",
  completed: "#16a34a",
  delayed: "#dc2626",
  unavailable: "#6b7280",
  emergency: "#9333ea",
};

export function RouteMapPanel({
  stops,
  partner,
  onSelect,
  height = 420,
}: {
  stops: MapStop[];
  partner?: { lat: number | null; lng: number | null; name?: string | null } | null;
  onSelect?: (stopId: string) => void;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const partnerMarkerRef = useRef<any>(null);
  const polyRef = useRef<any>(null);
  const hullsRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGoogleMaps()
      .then(() => {
        if (!ref.current) return;
        mapRef.current = new window.google.maps.Map(ref.current, {
          center: { lat: 26.8467, lng: 80.9462 },
          zoom: 12,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
        });
        setReady(true);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!ready) return;
    const g = window.google;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (polyRef.current) polyRef.current.setMap(null);
    hullsRef.current.forEach((h) => h.setMap(null));
    hullsRef.current = [];

    if (!stops.length && !partner?.lat) return;
    const bounds = new g.maps.LatLngBounds();
    if (partner?.lat && partner.lng) bounds.extend({ lat: partner.lat, lng: partner.lng });

    // cluster bubbles
    const byCluster = new Map<string, MapStop[]>();
    stops.forEach((s) => {
      if (!s.clusterId) return;
      const list = byCluster.get(s.clusterId) ?? [];
      list.push(s);
      byCluster.set(s.clusterId, list);
    });
    byCluster.forEach((list) => {
      if (list.length < 2) return;
      const lat = list.reduce((a, s) => a + s.lat, 0) / list.length;
      const lng = list.reduce((a, s) => a + s.lng, 0) / list.length;
      const dist = Math.max(
        ...list.map((s) => Math.hypot((s.lat - lat) * 111, (s.lng - lng) * 111)),
      );
      const c = new g.maps.Circle({
        map: mapRef.current,
        center: { lat, lng },
        radius: Math.max(dist * 1000, 250),
        strokeColor: "#94a3b8",
        strokeOpacity: 0.4,
        strokeWeight: 1,
        fillColor: "#e2e8f0",
        fillOpacity: 0.2,
      });
      hullsRef.current.push(c);
    });

    stops.forEach((s) => {
      const m = new g.maps.Marker({
        position: { lat: s.lat, lng: s.lng },
        map: mapRef.current,
        label: { text: String(s.sequence), color: "#fff", fontSize: "11px", fontWeight: "700" },
        title: s.label,
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 13,
          fillColor: COLORS[s.status],
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });
      m.addListener("click", () => onSelect?.(s.id));
      markersRef.current.push(m);
      bounds.extend({ lat: s.lat, lng: s.lng });
    });

    if (partner?.lat && partner.lng) {
      if (partnerMarkerRef.current) partnerMarkerRef.current.setMap(null);
      partnerMarkerRef.current = new g.maps.Marker({
        position: { lat: partner.lat, lng: partner.lng },
        map: mapRef.current,
        title: partner.name ?? "Partner",
        icon: {
          path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: "#0f172a",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
        zIndex: 999,
      });
    }

    const path: any[] = [];
    if (partner?.lat && partner.lng) path.push({ lat: partner.lat, lng: partner.lng });
    stops.forEach((s) => path.push({ lat: s.lat, lng: s.lng }));
    if (path.length > 1) {
      polyRef.current = new g.maps.Polyline({
        path,
        map: mapRef.current,
        strokeColor: "#1d4ed8",
        strokeOpacity: 0.7,
        strokeWeight: 3,
        icons: [{ icon: { path: g.maps.SymbolPath.FORWARD_OPEN_ARROW }, offset: "100%" }],
      });
    }

    if (!bounds.isEmpty()) mapRef.current.fitBounds(bounds, 56);
  }, [ready, stops, partner?.lat, partner?.lng, partner?.name, onSelect]);

  return (
    <Card className="overflow-hidden p-0">
      <div className="relative w-full bg-muted" style={{ height }}>
        <div ref={ref} className="h-full w-full" />
        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center text-center text-xs text-muted-foreground">
            <div>
              <MapPin className="mx-auto h-5 w-5" /> Map unavailable
            </div>
          </div>
        )}
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-1 rounded-md bg-background/90 px-2 py-1 text-[10px] shadow">
          {(["next", "pending", "completed", "delayed", "unavailable", "emergency"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[k] }} />
              <span className="capitalize">{k}</span>
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}
