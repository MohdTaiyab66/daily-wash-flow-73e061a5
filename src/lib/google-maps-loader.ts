// Shared Google Maps JS API loader. Uses the async loader + callback pattern
// required by loading=async. Safe to call from multiple components — the
// script tag is only injected once.
declare global {
  interface Window {
    google: any;
    __lovableMapReady?: Promise<void>;
    __initLovableMap?: () => void;
  }
}

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  if (window.__lovableMapReady) return window.__lovableMapReady;
  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
  if (!key) return Promise.reject(new Error("Google Maps key missing"));
  window.__lovableMapReady = new Promise<void>((resolve) => {
    window.__initLovableMap = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__initLovableMap${channel ? `&channel=${channel}` : ""}&libraries=geometry,places&v=weekly`;
    s.async = true;
    document.head.appendChild(s);
  });
  return window.__lovableMapReady;
}
