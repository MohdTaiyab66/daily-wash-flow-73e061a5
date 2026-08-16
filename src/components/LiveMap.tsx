import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  
  // Try to find the key from env or window config
  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
  
  if (!key) {
    console.error("[LiveMap] Google Maps API key missing. Check VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY.");
    return Promise.reject(new Error("Google Maps key missing"));
  }
  
  window.__lovableMapReady = new Promise<void>((resolve, reject) => {
    window.__initLovableMap = () => {
      console.log("[LiveMap] Google Maps library loaded successfully");
      resolve();
    };
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__initLovableMap${channel ? `&channel=${channel}` : ""}&libraries=geometry`;
    s.async = true;
    s.onerror = (err) => {
      console.error("[LiveMap] Script load failed", err);
      reject(new Error("Google Maps script failed to load"));
    };
    document.head.appendChild(s);
  });
  return window.__lovableMapReady;
}

export function LiveMap({ stops, showCustomers, heightClass, hideStats, onStats, onStopClick }: { stops: Stop[]; showCustomers: boolean; heightClass?: string; hideStats?: boolean; onStats?: (s: { km: number; mins: number } | null) => void; onStopClick?: (stopId: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const partnerMarkerRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const fittedRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapRenderFailed, setMapRenderFailed] = useState(false);
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
    console.log("[LiveMap] Starting initialization...");
    loadGoogleMaps()
      .then(() => {
        if (!ref.current) {
          console.warn("[LiveMap] Ref is null during init");
          return;
        }
        console.log("[LiveMap] Creating new google.maps.Map instance");
        mapRef.current = new window.google.maps.Map(ref.current, {
          center: { lat: 26.8467, lng: 80.9462 },
          zoom: 12,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          styles: [
            {
              featureType: "poi",
              elementType: "labels",
              stylers: [{ visibility: "off" }]
            }
          ]
        });
        
        // Listen for the first idle event to confirm the map is actually rendering tiles
        window.google.maps.event.addListenerOnce(mapRef.current, "idle", () => {
          console.log("[LiveMap] Map is idle and ready");
          setReady(true);
        });
      })
      .catch((e) => {
        console.error("[LiveMap] Initialization error:", e);
        setError(e.message);
      });
  }, []);

  useEffect(() => {
    if (!ready || !ref.current) return;
    const el = ref.current;
    const detectFailure = () => {
      const text = el.innerText || "";
      if (el.querySelector(".gm-err-container") || text.includes("Oops! Something went wrong")) {
        setMapRenderFailed(true);
      }
    };
    const observer = new MutationObserver(detectFailure);
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    const timer = window.setTimeout(detectFailure, 1200);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [ready]);

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
    if (!ready || !mapRef.current) return;
    const g = window.google;
    
    console.log("[LiveMap] Rendering markers for", stableStops.length, "stops");

    // Clear existing markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    
    // Clear existing polyline
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    if (!showCustomers || stableStops.length === 0) {
      console.log("[LiveMap] No customers to show or showCustomers is false");
      setStats(null);
      fittedRef.current = null;
      return;
    }

    const bounds = new g.maps.LatLngBounds();
    if (partnerPos) {
      bounds.extend(partnerPos);
      console.log("[LiveMap] Extended bounds to partnerPos:", partnerPos);
    }
    
    stableStops.forEach((s) => {
      const isNext = s.sequence_no === 1;
      const marker = new g.maps.Marker({
        position: { lat: s.lat, lng: s.lng },
        map: mapRef.current,
        label: { 
          text: String(s.sequence_no ?? ""), 
          color: "#fff", 
          fontSize: isNext ? "16px" : "14px", 
          fontWeight: "900" 
        },
        title: s.label,
        // Larger, brighter icon for the current next stop
        icon: isNext ? {
          path: g.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: "#FF6B00",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        } : undefined,
      });
      
      marker.addListener("click", () => {
        console.log("[LiveMap] Marker clicked:", s.id);
        if (onStopClick) onStopClick(s.id);
      });
      
      markersRef.current.push(marker);
      bounds.extend({ lat: s.lat, lng: s.lng });
    });

    // Only fit bounds the first time this stop-set is shown so the user can pan freely without snap-back
    if (fittedRef.current !== stopsKey) {
      console.log("[LiveMap] Fitting bounds to", stableStops.length, "stops");
      mapRef.current.fitBounds(bounds, 48);
      fittedRef.current = stopsKey;
    }

    // Always draw the approved Route Manager stop order immediately.
    const fallbackPath = [partnerPos, ...stableStops.map((s) => ({ lat: s.lat, lng: s.lng }))].filter(Boolean) as Array<{ lat: number; lng: number }>;
    if (fallbackPath.length >= 2) {
      const fallbackKm = fallbackPath.slice(1).reduce((sum, point, i) => sum + haversineKm(fallbackPath[i], point), 0);
      setStats({ km: Math.round(fallbackKm * 10) / 10, mins: Math.round((fallbackKm / 22) * 60) });
      
      console.log("[LiveMap] Drawing fallback polyline");
      polylineRef.current = new g.maps.Polyline({
        path: fallbackPath,
        map: mapRef.current,
        strokeColor: "#64748b",
        strokeWeight: 3,
        strokeOpacity: 0.75,
      });
    }

    // Upgrade to the server-computed road route
    const routeOrigin = partnerPos ?? (stableStops[0] ? { lat: stableStops[0].lat, lng: stableStops[0].lng } : null);
    const routeStops = partnerPos ? stableStops : stableStops.slice(1);
    
    if (routeOrigin && routeStops.length >= 1) {
      const destination = routeStops[routeStops.length - 1];
      const waypoints = routeStops.slice(0, -1).map((s) => ({ lat: s.lat, lng: s.lng }));
      
      console.log("[LiveMap] Requesting computed road route");
      compute({
        data: {
          origin: routeOrigin,
          destination: { lat: destination.lat, lng: destination.lng },
          waypoints,
        },
      })
        .then((r) => {
          if (r.polyline) {
            console.log("[LiveMap] Road route received, updating polyline");
            setStats({ km: Math.round((r.distanceMeters / 1000) * 10) / 10, mins: Math.round(r.durationSeconds / 60) });
            if (polylineRef.current) polylineRef.current.setMap(null);
            
            const path = g.maps.geometry.encoding.decodePath(r.polyline);
            polylineRef.current = new g.maps.Polyline({
              path,
              map: mapRef.current,
              strokeColor: "#1d4ed8",
              strokeWeight: 4,
              strokeOpacity: 0.9,
            });
          }
        })
        .catch((err) => {
          console.error("[LiveMap] Route computation failed:", err);
        });
    }
  }, [ready, showCustomers, stableStops, stopsKey, compute]);

  const effectiveStats = stats ?? fallbackStats;
  useEffect(() => { onStats?.(effectiveStats ?? null); }, [effectiveStats?.km, effectiveStats?.mins]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className="overflow-hidden p-0">
      <div className={`relative w-full bg-muted ${heightClass ?? "h-56"}`}>
        <div ref={ref} className="h-full w-full" />
        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {(error || mapRenderFailed) && <RouteFallback stops={stableStops} />}
      </div>
      {!hideStats && showCustomers && effectiveStats && (
        <div className="grid grid-cols-2 border-t border-border text-center">
          <div className="px-2 py-2">
            <p className="text-base font-semibold">{effectiveStats.km} km</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Route distance</p>
          </div>
          <div className="px-2 py-2 border-l border-border">
            <p className="text-base font-semibold">~{effectiveStats.mins} min</p>
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
    <div className="absolute inset-0 z-10 bg-neutral-50 p-6 flex items-center justify-center">
      <div className="w-full max-w-[280px] text-center space-y-4">
        <div className="mx-auto h-12 w-12 bg-neutral-100 rounded-full flex items-center justify-center">
          <MapPin className="h-6 w-6 text-neutral-400" />
        </div>
        <div>
          <p className="text-sm font-black text-neutral-900 tracking-tight">Map could not load</p>
          <p className="text-[11px] text-neutral-500 font-medium mt-1">We've loaded your {stops.length} stops, but the visual map is currently unavailable.</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="rounded-full font-bold text-[11px] h-9 px-6 border-neutral-200"
          onClick={() => window.location.reload()}
        >
          Retry Map
        </Button>
      </div>
    </div>
  );
}
