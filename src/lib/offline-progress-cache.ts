// Lightweight offline resilience for the Route page: whenever we successfully
// fetch today's services we snapshot them to localStorage; when the network
// is flaky we can still render the last-known queue and progress instead of
// showing an empty state. Server-side truth wins as soon as Supabase replies.
//
// This does NOT queue mutations — completion still requires network and
// server-side validation. It only makes reads resilient to short outages.

const KEY_PREFIX = "uw:route-cache:";
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h

type Snapshot<T> = { at: number; date: string; data: T };

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveRouteSnapshot<T>(scope: string, date: string, data: T): void {
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(
      `${KEY_PREFIX}${scope}`,
      JSON.stringify({ at: Date.now(), date, data } satisfies Snapshot<T>),
    );
  } catch {
    /* quota / private mode — ignore */
  }
}

export function loadRouteSnapshot<T>(scope: string, date: string): T | null {
  const s = safeStorage();
  if (!s) return null;
  try {
    const raw = s.getItem(`${KEY_PREFIX}${scope}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot<T>;
    if (!parsed || parsed.date !== date) return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}
