import { createServerFn } from "@tanstack/react-start";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

type LatLng = { lat: number; lng: number };

export const computeRoute = createServerFn({ method: "POST" })
  .inputValidator((data: { origin: LatLng; destination: LatLng; waypoints?: LatLng[] }) => {
    if (!data?.origin || !data?.destination) throw new Error("origin and destination required");
    return data;
  })
  .handler(async ({ data }) => {
    const lovable = process.env.LOVABLE_API_KEY;
    const gKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovable || !gKey) throw new Error("Google Maps connector not configured");

    const body = {
      origin: { location: { latLng: { latitude: data.origin.lat, longitude: data.origin.lng } } },
      destination: { location: { latLng: { latitude: data.destination.lat, longitude: data.destination.lng } } },
      intermediates: (data.waypoints ?? []).map((w) => ({
        location: { latLng: { latitude: w.lat, longitude: w.lng } },
      })),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      optimizeWaypointOrder: true,
    };

    const res = await fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovable}`,
        "X-Connection-Api-Key": gKey,
        "Content-Type": "application/json",
        "X-Goog-FieldMask":
          "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.optimizedIntermediateWaypointIndex",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Routes API ${res.status}: ${t.slice(0, 200)}`);
    }
    const json = await res.json();
    const route = json.routes?.[0];
    if (!route) return { distanceMeters: 0, durationSeconds: 0, polyline: "", order: [] as number[] };
    return {
      distanceMeters: route.distanceMeters ?? 0,
      durationSeconds: Number(String(route.duration ?? "0s").replace("s", "")) || 0,
      polyline: route.polyline?.encodedPolyline ?? "",
      order: (route.optimizedIntermediateWaypointIndex ?? []) as number[],
    };
  });
