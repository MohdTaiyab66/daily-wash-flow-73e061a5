// Canonical Lucknow service-area list. Single source of truth — used by partner area picker
// and admin customer import to prevent typos / casing duplicates (Kalyanpur vs KALYANPUR etc.).
export type ServiceArea = { name: string; lat: number; lng: number };

export const SERVICE_AREAS: ServiceArea[] = [
  { name: "Indira Nagar", lat: 26.8783, lng: 80.9989 },
  { name: "Gomti Nagar", lat: 26.8467, lng: 81.0023 },
  { name: "Gomti Nagar Extension", lat: 26.8889, lng: 81.0234 },
  { name: "Aliganj", lat: 26.8956, lng: 80.9456 },
  { name: "Jankipuram", lat: 26.9234, lng: 80.9189 },
  { name: "Hazratganj", lat: 26.8489, lng: 80.945 },
  { name: "Vikas Nagar", lat: 26.9012, lng: 80.9012 },
  { name: "Ashiyana", lat: 26.7989, lng: 80.9089 },
  { name: "Rajajipuram", lat: 26.8312, lng: 80.8723 },
  { name: "Alambagh", lat: 26.8089, lng: 80.8889 },
  { name: "Mahanagar", lat: 26.8856, lng: 80.9523 },
  { name: "Kalyanpur", lat: 26.9089, lng: 80.9356 },
  { name: "Khurram Nagar", lat: 26.8978, lng: 80.9712 },
];

export const SERVICE_AREA_NAMES = SERVICE_AREAS.map((a) => a.name);

export function nearestServiceArea(lat: number, lng: number): ServiceArea {
  let best = SERVICE_AREAS[0];
  let bestD = Infinity;
  for (const a of SERVICE_AREAS) {
    const d = Math.hypot(a.lat - lat, a.lng - lng);
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}
