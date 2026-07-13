// Per-customer unlock window: a stop becomes actionable 1 hour before
// its scheduled time. Used on the Route page so partners cannot start
// jobs early. Preview / rest days keep every stop locked (no dateStr).

export const UNLOCK_WINDOW_MS = 60 * 60 * 1000;

function parseHHMM(t: string | null | undefined): { h: number; m: number } | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t).trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(mm)) return null;
  return { h, m: mm };
}

/**
 * @param scheduled  Customer's scheduled time ("HH:MM" or "HH:MM:SS" or "HH:MM - HH:MM")
 * @param dateStr    Service date "YYYY-MM-DD" — null/undefined means "today" for
 *                   working-day rows, or "always locked" when omitted intentionally
 *                   in preview mode.
 * @param now        Now (ms).
 */
export function computeUnlockState(
  scheduled: string | null | undefined,
  dateStr: string | null | undefined,
  now: number,
): { unlocked: boolean; unlockAt: Date | null; countdownMs: number } {
  if (!dateStr) return { unlocked: false, unlockAt: null, countdownMs: 0 };
  // If a range is given (e.g. "06:00 - 09:00"), unlock 1h before the START.
  const first = String(scheduled ?? "").split(/\s*-\s*/)[0];
  const hm = parseHHMM(first);
  if (!hm) return { unlocked: true, unlockAt: null, countdownMs: 0 };
  const [y, mo, d] = dateStr.split("-").map((v) => parseInt(v, 10));
  if (!y || !mo || !d) return { unlocked: true, unlockAt: null, countdownMs: 0 };
  const scheduledAt = new Date(y, mo - 1, d, hm.h, hm.m, 0, 0).getTime();
  const unlockMs = scheduledAt - UNLOCK_WINDOW_MS;
  const unlocked = now >= unlockMs;
  return {
    unlocked,
    unlockAt: new Date(unlockMs),
    countdownMs: Math.max(0, unlockMs - now),
  };
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  const s = Math.floor((ms % 60000) / 1000);
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
