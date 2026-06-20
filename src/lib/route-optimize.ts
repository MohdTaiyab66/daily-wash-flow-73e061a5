// Priority-bucket + nearest-neighbor route optimizer.
// Treats customer's required-time as a LATEST completion deadline, groups stops
// into deadline buckets, and orders by distance within (and across) buckets
// using greedy nearest-neighbor from a starting point.

export type Stop = {
  id: string;
  lat: number | null | undefined;
  lng: number | null | undefined;
  deadline?: string | null; // "07:00", "Before 7 AM", "06:00 - 09:00", etc.
};

export function parseDeadlineMinutes(s?: string | null): number | null {
  if (!s) return null;
  const txt = String(s).trim().toLowerCase();
  // "before 7 am", "before 10 am"
  const before = txt.match(/before\s+(\d{1,2})\s*(am|pm)?/);
  if (before) {
    let h = parseInt(before[1], 10);
    const ap = before[2];
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return h * 60;
  }
  // "06:00 - 09:00" → use upper bound (deadline)
  const range = txt.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
  if (range) return parseInt(range[3], 10) * 60 + parseInt(range[4], 10);
  // "07:00"
  const single = txt.match(/(\d{1,2}):(\d{2})/);
  if (single) return parseInt(single[1], 10) * 60 + parseInt(single[2], 10);
  return null;
}

// Bucket = deadline hour (ceil). Stops with no deadline → Infinity (last).
export function bucketOf(s?: string | null): number {
  const m = parseDeadlineMinutes(s);
  if (m == null) return Number.POSITIVE_INFINITY;
  return Math.ceil(m / 60);
}

function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Returns stops re-ordered: bucket ascending, then nearest-neighbor within
 * the bucket starting from `from` (and from the last picked stop afterwards).
 * Stops without coordinates are appended at the end of their bucket.
 */
export function optimizeRoute<T extends Stop>(
  stops: T[],
  from?: { lat: number; lng: number } | null,
): T[] {
  if (!stops.length) return [];
  const groups = new Map<number, T[]>();
  for (const s of stops) {
    const b = bucketOf(s.deadline);
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b)!.push(s);
  }
  const bucketKeys = Array.from(groups.keys()).sort((a, b) => a - b);

  let cursor: { lat: number; lng: number } | null = from ?? null;
  const result: T[] = [];

  for (const k of bucketKeys) {
    const remaining = groups.get(k)!.slice();
    const noCoords = remaining.filter((s) => s.lat == null || s.lng == null);
    let withCoords = remaining.filter((s) => s.lat != null && s.lng != null);

    while (withCoords.length) {
      let bestIdx = 0;
      if (cursor) {
        let bestD = Infinity;
        for (let i = 0; i < withCoords.length; i++) {
          const s = withCoords[i];
          const d = distKm(cursor, { lat: s.lat as number, lng: s.lng as number });
          if (d < bestD) {
            bestD = d;
            bestIdx = i;
          }
        }
      }
      const picked = withCoords.splice(bestIdx, 1)[0];
      result.push(picked);
      cursor = { lat: picked.lat as number, lng: picked.lng as number };
    }
    result.push(...noCoords);
  }
  return result;
}

export function pickNextStop<T extends Stop>(
  stops: T[],
  from?: { lat: number; lng: number } | null,
): T | null {
  return optimizeRoute(stops, from)[0] ?? null;
}
