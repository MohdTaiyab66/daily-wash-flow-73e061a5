import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Loader2, MapPin } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { computeRoute } from "@/lib/maps.functions";
import { watchCurrentGps } from "@/lib/native";

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

type Stop = {
  id: string;
  sequence_no: number | null;
  lat: number;
  lng: number;
  label: string;
};

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
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
  if (!key) return Promise.reject(new Error("Google Maps key missing"));
  window.__lovableMapReady = new Promise<void>((resolve) => {
    window.__initLovableMap = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__initLovableMap${channel ? `&channel=${channel}` : ""}&libraries=geometry`;
    s.async = true;
    document.head.appendChild(s);
  });
  return window.__lovableMapReady;
}

export function LiveMap({ stops, showCustomers }: { stops: Stop[]; showCustomers: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const partnerMarkerRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const fittedRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partnerPos, setPartnerPos] = useState<{ lat: number; lng: number } | null>(null);
  const [stats, setStats] = useState<{ km: number; mins: number } | null>(null);
  const compute = useServerFn(computeRoute);

  // Stable key derived from stop ids — prevents map effect re-running when underlying refs change
  const stopsKey = useMemo(
    () => stops.map((s) => `${s.id}:${s.sequence_no ?? ""}:${s.lat.toFixed(6)},${s.lng.toFixed(6)}`).join("|"),
    [stops]
  );
  const stableStops = useMemo(() => stops, [stopsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const fallbackStats = useMemo(() => computeFallbackStats(stableStops, partnerPos), [stableStops, partnerPos]);

  // Initialize map
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

  // Partner location (watch)
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    void watchCurrentGps((p) => setPartnerPos({ lat: p.lat, lng: p.lng })).then((fn) => {
      if (cancelled) fn();
      else cleanup = fn;
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  // Render partner marker
  useEffect(() => {
    if (!ready || !partnerPos) return;
    const g = window.google;
    if (partnerMarkerRef.current) {
      partnerMarkerRef.current.setPosition(partnerPos);
    } else {
      partnerMarkerRef.current = new g.maps.Marker({
        position: partnerPos,
        map: mapRef.current,
        title: "You",
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#1d4ed8",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });
      mapRef.current.panTo(partnerPos);
    }
  }, [ready, partnerPos]);

  // Render customer markers + route — depends on stable stops key so it only re-runs when stops actually change
  useEffect(() => {
    if (!ready) return;
    const g = window.google;
    // Clear existing
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    if (!showCustomers || stableStops.length === 0) {
      setStats(null);
      fittedRef.current = null;
      return;
    }

    const bounds = new g.maps.LatLngBounds();
    if (partnerPos) bounds.extend(partnerPos);
    stableStops.forEach((s) => {
      const marker = new g.maps.Marker({
        position: { lat: s.lat, lng: s.lng },
        map: mapRef.current,
        label: { text: String(s.sequence_no ?? ""), color: "#fff", fontSize: "11px", fontWeight: "600" },
        title: s.label,
      });
      markersRef.current.push(marker);
      bounds.extend({ lat: s.lat, lng: s.lng });
    });
    // Only fit bounds the first time this stop-set is shown so the user can pan freely without snap-back
    if (fittedRef.current !== stopsKey) {
      mapRef.current.fitBounds(bounds, 48);
      fittedRef.current = stopsKey;
    }

    // Always draw the approved Route Manager stop order immediately. This keeps
    // numbered customer routes visible even before partner GPS or the road-route
    // API returns. Missing GPS stops are not passed into this component.
    const fallbackPath = [partnerPos, ...stableStops.map((s) => ({ lat: s.lat, lng: s.lng }))].filter(Boolean) as Array<{ lat: number; lng: number }>;
    if (fallbackPath.length >= 2) {
      const fallbackKm = fallbackPath.slice(1).reduce((sum, point, i) => sum + haversineKm(fallbackPath[i], point), 0);
      setStats({ km: Math.round(fallbackKm * 10) / 10, mins: Math.round((fallbackKm / 22) * 60) });
      polylineRef.current = new g.maps.Polyline({
        path: fallbackPath,
        map: mapRef.current,
        strokeColor: "#64748b",
        strokeWeight: 3,
        strokeOpacity: 0.75,
      });
    }

    // Upgrade to the server-computed road route in the same approved sequence.
    if (partnerPos && stableStops.length >= 1) {
      const destination = stableStops[stableStops.length - 1];
      const waypoints = stableStops.slice(0, -1).map((s) => ({ lat: s.lat, lng: s.lng }));
      compute({
        data: {
          origin: partnerPos,
          destination: { lat: destination.lat, lng: destination.lng },
          waypoints,
        },
      })
        .then((r) => {
          setStats({ km: Math.round((r.distanceMeters / 1000) * 10) / 10, mins: Math.round(r.durationSeconds / 60) });
          if (r.polyline) {
            if (polylineRef.current) polylineRef.current.setMap(null);
            const path = g.maps.geometry.encoding.decodePath(r.polyline);
            polylineRef.current = new g.maps.Polyline({
              path,
              map: mapRef.current,
              strokeColor: "#1d4ed8",
              strokeWeight: 4,
              strokeOpacity: 0.8,
            });
          }
        })
        .catch(() => {});
    }
  // Intentionally exclude partnerPos so the map doesn't refit / re-fetch the route on every GPS tick
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, showCustomers, stableStops, stopsKey, compute]);

  return (
    <Card className="overflow-hidden p-0">
      <div className="relative h-56 w-full bg-muted">
        <div ref={ref} className="h-full w-full" />
        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && <RouteFallback stops={stableStops} />}
      </div>
      {showCustomers && (stats || fallbackStats) && (
        <div className="grid grid-cols-2 border-t border-border text-center">
          <div className="px-2 py-2">
            <p className="text-base font-semibold">{(stats ?? fallbackStats)!.km} km</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Route distance</p>
          </div>
          <div className="px-2 py-2 border-l border-border">
            <p className="text-base font-semibold">~{(stats ?? fallbackStats)!.mins} min</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Est. completion</p>
          </div>
        </div>
      )}
    </Card>
  );
}

function computeFallbackStats(stops: Stop[], partnerPos: { lat: number; lng: number } | null) {
  const points = [partnerPos, ...stops.map((s) => ({ lat: s.lat, lng: s.lng }))].filter(Boolean) as Array<{ lat: number; lng: number }>;
  if (points.length < 2) return null;
  const km = points.slice(1).reduce((sum, point, i) => sum + haversineKm(points[i], point), 0);
  return { km: Math.max(0.1, Math.round(km * 10) / 10), mins: Math.max(1, Math.round((km / 22) * 60)) };
}

function RouteFallback({ stops }: { stops: Stop[] }) {
  const first = stops[0];
  return (
    <div className="absolute inset-0 bg-muted p-4">
      <div className="flex h-full flex-col justify-between rounded-md border border-border bg-background/80 p-4">
        <div>
          <MapPin className="h-5 w-5 text-primary" />
          <p className="mt-2 text-sm font-semibold">Route ready</p>
          <p className="mt-1 text-xs text-muted-foreground">{stops.length} stop{stops.length === 1 ? "" : "s"} loaded from saved route order.</p>
        </div>
        {first && (
          <div className="rounded-md bg-muted/70 p-3 text-xs">
            <p className="font-medium">Next: {first.label}</p>
            <p className="mt-0.5 text-muted-foreground">Use Navigate for turn-by-turn directions.</p>
          </div>
        )}
      </div>
    </div>
  );
}
