// Helpers for the Route Manager Manual Operations Mode.
// A "draft" is the working route order before the admin clicks Save.

export type DraftItem = {
  service_id: string;
  sequence: number;
  locked: boolean;
  priority: Priority;
  is_emergency: boolean;
};

export const PRIORITIES = [
  "normal",
  "vip",
  "emergency",
  "complaint",
  "corporate",
  "repeat",
  "high",
] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<Priority, string> = {
  normal: "Normal",
  vip: "VIP",
  emergency: "Emergency",
  complaint: "Complaint",
  corporate: "Corporate",
  repeat: "Repeat",
  high: "High Priority",
};

export const PRIORITY_TONE: Record<Priority, string> = {
  normal: "bg-muted text-muted-foreground",
  vip: "bg-amber-100 text-amber-800 border-amber-300",
  emergency: "bg-red-100 text-red-800 border-red-300",
  complaint: "bg-orange-100 text-orange-800 border-orange-300",
  corporate: "bg-blue-100 text-blue-800 border-blue-300",
  repeat: "bg-emerald-100 text-emerald-800 border-emerald-300",
  high: "bg-purple-100 text-purple-800 border-purple-300",
};

export function normalisePriority(p: string | null | undefined): Priority {
  return (PRIORITIES as readonly string[]).includes(p ?? "")
    ? (p as Priority)
    : "normal";
}

export function payloadFromOrder(items: { id: string; locked_position?: boolean | null; priority?: string | null; is_emergency?: boolean | null }[]): DraftItem[] {
  return items.map((s, i) => ({
    service_id: s.id,
    sequence: i + 1,
    locked: !!s.locked_position,
    priority: normalisePriority(s.priority ?? null),
    is_emergency: !!s.is_emergency,
  }));
}

export function diffPayloads(a: DraftItem[] | null, b: DraftItem[] | null): boolean {
  if (!a || !b) return !!(a || b);
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x.service_id !== y.service_id) return true;
    if (x.locked !== y.locked) return true;
    if (x.priority !== y.priority) return true;
    if (x.is_emergency !== y.is_emergency) return true;
  }
  return false;
}

// Tiny undo/redo stack (pure)
export type HistoryStack<T> = { past: T[]; present: T; future: T[] };
export function newHistory<T>(present: T): HistoryStack<T> {
  return { past: [], present, future: [] };
}
export function pushHistory<T>(h: HistoryStack<T>, next: T, max = 50): HistoryStack<T> {
  const past = [...h.past, h.present].slice(-max);
  return { past, present: next, future: [] };
}
export function undoHistory<T>(h: HistoryStack<T>): HistoryStack<T> {
  if (!h.past.length) return h;
  const prev = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}
export function redoHistory<T>(h: HistoryStack<T>): HistoryStack<T> {
  if (!h.future.length) return h;
  const next = h.future[0];
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
}
