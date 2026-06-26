// Cluster-first, distance-optimal route optimizer with soft time windows.
//
// Rules:
//  - "Before X AM" preferences are SOFT — they bias scoring with a per-minute
//    late penalty but never block ordering.
//  - Only stops with `timeWindowType === 'exact'` are HARD; they get a fixed
//    target arrival time and pull their cluster forward.
//  - Admin overrides win: locked stops keep their position, manual_sequence_no
//    overrides the optimizer, emergencies insert next.
//  - Clusters are formed by ~0.6 km cells; we finish a cluster before leaving
//    unless a hard-time stop elsewhere is about to be missed.

export type TimeWindowType = "soft" | "exact";

export type Stop = {
  id: string;
  lat: number | null | undefined;
  lng: number | null | undefined;
  // Soft preference: e.g. "Before 9 AM", "07:00 - 09:00"
  deadline?: string | null;
  // Hard target — only honoured when timeWindowType === 'exact'
  exactTime?: string | null; // "HH:MM"
  timeWindowType?: TimeWindowType;
  // Admin overrides
  locked?: boolean;
  manualSequence?: number | null;
  isEmergency?: boolean;
  clusterId?: string | null;
  // Scoring boosts
  isVip?: boolean;
  reliabilityBoost?: number; // partner-side; usually constant across stops
  complaintFlag?: boolean;
};

export type OptimizerWeights = {
  route_impact: number;
  distance: number;
  travel_time: number;
  preferred_time: number;
  continuity: number;
  reliability: number;
  vip: number;
  complaint: number;
};

export const DEFAULT_WEIGHTS: OptimizerWeights = {
  route_impact: 40,
  distance: 20,
  travel_time: 10,
  preferred_time: 8,
  continuity: 7,
  reliability: 6,
  vip: 5,
  complaint: 4,
};

export type OptimizerOpts = {
  weights?: OptimizerWeights;
  /** Penalty added per minute late vs the soft preferred window. */
  softPenaltyPerMin?: number;
  /** Cluster grid size in km (~0.6–1.0 km works well at city scale). */
  clusterRadiusKm?: number;
  /** Minutes spent at each stop on average. */
  avgServiceMinutes?: number;
  /** Average travel speed (km/h) used to convert distance → ETA minutes. */
  avgSpeedKmh?: number;
  /** Day start as "HH:MM"; used to compute ETA when from-location is set. */
  startTime?: string;
};

const R = 6371;
function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function parseHHMM(s?: string | null): number | null {
  if (!s) return null;
  const txt = String(s).trim().toLowerCase();
  const before = txt.match(/before\s+(\d{1,2})\s*(am|pm)?/);
  if (before) {
    let h = parseInt(before[1], 10);
    const ap = before[2];
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return h * 60;
  }
  const range = txt.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
  if (range) return parseInt(range[3], 10) * 60 + parseInt(range[4], 10);
  const single = txt.match(/(\d{1,2}):(\d{2})/);
  if (single) return parseInt(single[1], 10) * 60 + parseInt(single[2], 10);
  return null;
}

/** Backwards-compat shim for callers that still use parseDeadlineMinutes. */
export const parseDeadlineMinutes = parseHHMM;

/** Bucket grid id for two coordinates at the given cell size in km. */
function cellId(lat: number, lng: number, cellKm: number): string {
  const dLat = cellKm / 111;
  const dLng = cellKm / (111 * Math.cos((lat * Math.PI) / 180) || 1);
  const r = Math.floor(lat / dLat);
  const c = Math.floor(lng / dLng);
  return `${r}:${c}`;
}

type Internal<T extends Stop> = T & { _cluster: string; _lat: number; _lng: number };

export function optimizeRoute<T extends Stop>(
  stops: T[],
  from?: { lat: number; lng: number } | null,
  opts: OptimizerOpts = {},
): T[] {
  if (!stops.length) return [];
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const penalty = opts.softPenaltyPerMin ?? 0.5;
  const cellKm = opts.clusterRadiusKm ?? 0.8;
  const serviceMin = opts.avgServiceMinutes ?? 10;
  const speed = opts.avgSpeedKmh ?? 22;
  const startMin = parseHHMM(opts.startTime ?? "08:00") ?? 8 * 60;

  // 1. Admin overrides — locked + manual sequence + emergencies
  const locked = stops.filter((s) => s.locked && s.manualSequence != null);
  const manualOrdered = stops
    .filter((s) => !s.locked && s.manualSequence != null)
    .sort((a, b) => (a.manualSequence! - b.manualSequence!));
  const emergencies = stops.filter(
    (s) => s.isEmergency && s.manualSequence == null && !s.locked,
  );
  const fixed = new Set<string>([
    ...locked.map((s) => s.id),
    ...manualOrdered.map((s) => s.id),
    ...emergencies.map((s) => s.id),
  ]);

  // 2. The pool to score: everything not pre-placed
  const pool: Internal<T>[] = stops
    .filter((s) => !fixed.has(s.id) && s.lat != null && s.lng != null)
    .map((s) => ({
      ...s,
      _lat: Number(s.lat),
      _lng: Number(s.lng),
      _cluster: s.clusterId ?? cellId(Number(s.lat), Number(s.lng), cellKm),
    }));
  const noCoords = stops.filter(
    (s) => !fixed.has(s.id) && (s.lat == null || s.lng == null),
  );

  // 3. Greedy scored selection
  let cursor: { lat: number; lng: number } | null = from ?? null;
  let etaMin = startMin;
  let lastCluster: string | null = null;
  const ordered: T[] = [];

  // Emergencies go first (most urgent), then locked positions, then manual,
  // then scored pool — we merge after.
  const scoredOrder: T[] = [];
  const remaining = pool.slice();

  while (remaining.length) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i];
      const km = cursor ? distKm(cursor, { lat: s._lat, lng: s._lng }) : 0;
      const travelMin = (km / speed) * 60;
      const arrival = etaMin + travelMin;

      // Soft preference penalty
      let latePenalty = 0;
      const pref = parseHHMM(s.deadline);
      if (s.timeWindowType !== "exact" && pref != null && arrival > pref) {
        latePenalty = arrival - pref;
      }
      // Hard preference: huge bonus for hitting an exact-time stop near its slot
      let hardBonus = 0;
      if (s.timeWindowType === "exact") {
        const target = parseHHMM(s.exactTime ?? s.deadline);
        if (target != null) {
          const slack = Math.abs(arrival - target);
          // Strong pull when we're within ~30 min of the target
          hardBonus = Math.max(0, 200 - slack * 6);
        }
      }

      // Route-impact: prefer staying inside the current cluster
      const sameCluster = lastCluster && s._cluster === lastCluster ? 1 : 0;
      // Δkm saved vs. the average remaining distance from cursor — proxy for
      // "this stop is the closest" benefit
      let avgRemaining = 0;
      if (cursor && remaining.length > 1) {
        let sum = 0;
        for (const r of remaining) sum += distKm(cursor, { lat: r._lat, lng: r._lng });
        avgRemaining = sum / remaining.length;
      }
      const routeImpact = Math.max(0, avgRemaining - km);

      const score =
        weights.route_impact * routeImpact +
        weights.distance * -km +
        weights.travel_time * -travelMin +
        weights.preferred_time * -latePenalty +
        weights.continuity * sameCluster * 5 +
        weights.reliability * (s.reliabilityBoost ?? 0) +
        weights.vip * (s.isVip ? 1 : 0) +
        weights.complaint * (s.complaintFlag ? 1 : 0) +
        hardBonus;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const picked = remaining.splice(bestIdx, 1)[0];
    const km = cursor ? distKm(cursor, { lat: picked._lat, lng: picked._lng }) : 0;
    etaMin += (km / speed) * 60 + serviceMin;
    cursor = { lat: picked._lat, lng: picked._lng };
    lastCluster = picked._cluster;
    scoredOrder.push(picked);
  }

  // 4. Merge: emergencies → locked (at their manualSequence slots) → manual → scored
  //    Implementation: build a list of (slot, item). Locked + manual slots win.
  const slotted: Array<{ at: number; item: T }> = [];
  for (const l of locked) slotted.push({ at: l.manualSequence!, item: l });
  for (const m of manualOrdered) slotted.push({ at: m.manualSequence!, item: m });
  slotted.sort((a, b) => a.at - b.at);

  for (const item of [...emergencies, ...scoredOrder]) ordered.push(item);
  // Reinsert slotted items at their fixed positions (1-based)
  for (const { at, item } of slotted) {
    const idx = Math.max(0, Math.min(ordered.length, at - 1));
    ordered.splice(idx, 0, item);
  }
  ordered.push(...noCoords);
  return ordered;
}

export function pickNextStop<T extends Stop>(
  stops: T[],
  from?: { lat: number; lng: number } | null,
  opts: OptimizerOpts = {},
): T | null {
  return optimizeRoute(stops, from, opts)[0] ?? null;
}

/** Convenience: returns each stop tagged with its cluster cell id. */
export function withClusters<T extends Stop>(
  stops: T[],
  cellKm = 0.8,
): Array<T & { clusterCell: string | null }> {
  return stops.map((s) => ({
    ...s,
    clusterCell:
      s.lat != null && s.lng != null
        ? cellId(Number(s.lat), Number(s.lng), cellKm)
        : null,
  }));
}

/** Kept for backwards-compat with older callers (returns deadline hour). */
export function bucketOf(s?: string | null): number {
  const m = parseHHMM(s);
  if (m == null) return Number.POSITIVE_INFINITY;
  return Math.ceil(m / 60);
}
