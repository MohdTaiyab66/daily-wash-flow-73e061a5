import { SERVICE_AREAS } from "@/lib/areas";

export const GPS_INVALID_MESSAGE =
  "We couldn't determine your exact location. Please enable GPS or move to an open area before saving.";

export type ExactGps = { latitude: number; longitude: number };

export function isValidLatLng(latitude: unknown, longitude: unknown): latitude is number {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function isServiceAreaCentroid(latitude: unknown, longitude: unknown) {
  if (!isValidLatLng(latitude, longitude)) return false;
  const lat = Number(latitude);
  const lng = Number(longitude);
  return SERVICE_AREAS.some((a) => Math.abs(a.lat - lat) < 0.0005 && Math.abs(a.lng - lng) < 0.0005);
}

export function validateExactGps(latitude: unknown, longitude: unknown): ExactGps | null {
  if (!isValidLatLng(latitude, longitude)) return null;
  if (isServiceAreaCentroid(latitude, longitude)) return null;
  return { latitude: Number(latitude), longitude: Number(longitude) };
}

export function googleMapsDirectionsUrl(latitude: unknown, longitude: unknown) {
  const gps = validateExactGps(latitude, longitude);
  return gps ? `https://www.google.com/maps/dir/?api=1&destination=${gps.latitude},${gps.longitude}` : null;
}

export function gpsLabel(latitude: unknown, longitude: unknown) {
  const gps = validateExactGps(latitude, longitude);
  return gps ? `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}` : "Location unavailable";
}