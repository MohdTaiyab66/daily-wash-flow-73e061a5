import { isNative, nativePlatform } from "@/lib/platform";

export type GpsPoint = { lat: number; lng: number; accuracy?: number | null };

type GpsOptions = {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
};

const DEFAULT_GPS: Required<GpsOptions> = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
};

function normalizeGpsOptions(options?: GpsOptions): Required<GpsOptions> {
  return { ...DEFAULT_GPS, ...(options ?? {}) };
}

export async function getCurrentGps(options?: GpsOptions): Promise<GpsPoint | null> {
  const opts = normalizeGpsOptions(options);
  console.log("[LOCATION] fresh location request start");
  const startTime = Date.now();

  if (isNative()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      console.log("[LOCATION] permission check start");
      let perm = await Geolocation.checkPermissions();
      console.log("[LOCATION] permission result:", perm.location);
      
      if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
        perm = await Geolocation.requestPermissions({ permissions: ["location"] });
      }
      
      if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
        console.log("[LOCATION] permission denied");
        return null;
      }

      // Try for last known location first for speed
      try {
        const lastKnown = await (Geolocation as any).getLastKnownLocation();
        if (lastKnown) {
          console.log("[LOCATION] cached location available");
          // If it's very fresh (< 10s), return it immediately
          if (Date.now() - lastKnown.timestamp < 10000) {
            console.log("[LOCATION] using fresh cached location");
            return { lat: lastKnown.coords.latitude, lng: lastKnown.coords.longitude, accuracy: lastKnown.coords.accuracy ?? null };
          }
        }
      } catch (e) {
        console.log("[LOCATION] lastKnown failed, continuing to fresh fix");
      }

      const p = await Geolocation.getCurrentPosition({
        enableHighAccuracy: opts.enableHighAccuracy,
        timeout: opts.timeout,
        maximumAge: opts.maximumAge,
      });
      console.log(`[LOCATION] coordinates received: ${Date.now() - startTime}ms`);
      return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null };
    } catch (err) {
      console.warn("[native:gps] Capacitor geolocation failed", err);
      return null;
    }
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        console.log(`[LOCATION] coordinates received: ${Date.now() - startTime}ms`);
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null });
      },
      () => {
        console.log("[LOCATION] GPS failed or timed out");
        resolve(null);
      },
      opts,
    );
  });
}

export async function watchCurrentGps(onPosition: (point: GpsPoint) => void): Promise<() => void> {
  if (isNative()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      let perm = await Geolocation.checkPermissions();
      if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
        perm = await Geolocation.requestPermissions({ permissions: ["location"] });
      }
      if (perm.location !== "granted" && perm.coarseLocation !== "granted") return () => {};
      const id = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 },
        (p) => {
          if (p?.coords) onPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null });
        },
      );
      return () => { void Geolocation.clearWatch({ id }); };
    } catch (err) {
      console.warn("[native:gps] watch failed", err);
      return () => {};
    }
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) return () => {};
  const id = navigator.geolocation.watchPosition(
    (p) => onPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null }),
    () => {},
    { enableHighAccuracy: true, maximumAge: 15000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

export async function openDirections(latitude: unknown, longitude: unknown): Promise<boolean> {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  if (isNative()) {
    const nativeUrls = nativePlatform() === "android"
      ? [`google.navigation:q=${lat},${lng}&mode=d`, `geo:0,0?q=${lat},${lng}(Urban%20Wash%20Customer)`, webUrl]
      : [`comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`, webUrl];
    try {
      const { AppLauncher } = await import("@capacitor/app-launcher");
      for (const url of nativeUrls) {
        try {
          await AppLauncher.openUrl({ url });
          return true;
        } catch {
          // Try the next native URL.
        }
      }
    } catch (err) {
      console.warn("[native:maps] launcher failed", err);
    }
  }

  if (typeof window !== "undefined") {
    window.open(webUrl, "_blank", "noopener,noreferrer");
    return true;
  }
  return false;
}