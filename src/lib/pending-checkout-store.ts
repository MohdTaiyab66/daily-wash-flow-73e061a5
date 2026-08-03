/**
 * Crash-safe pending checkout store.
 *
 * When a Razorpay checkout is opened we persist the minimal context needed to
 * resume it (booking + order ids, amount, prefill). If the WebView is killed,
 * the app is swiped away, or the user simply navigates away mid-payment, the
 * next mount can verify the real payment status server-side and either
 * finalize the booking or offer a safe "Resume payment" action — instead of
 * making the customer start the booking from scratch.
 *
 * BUSINESS RULE: nothing here activates anything. It only remembers *what*
 * was being paid for; the server remains the single source of truth for
 * whether it was actually paid.
 */

const KEY = "uw_pending_checkout";
/** Stale entries are dropped — a Razorpay order is not worth resuming after this. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h

export type PersistedCheckout = {
  bookingId: string;
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  serviceName: string;
  serviceSlug: string;
  isSubscription: boolean;
  prefillEmail: string;
  prefillContact: string;
  attemptNo: number;
  savedAt: number;
};

export function savePendingCheckout(row: Omit<PersistedCheckout, "savedAt">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...row, savedAt: Date.now() }));
  } catch (e) {
    console.warn("[uw-checkout] could not persist pending checkout", e);
  }
}

export function readPendingCheckout(): PersistedCheckout | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedCheckout;
    if (!parsed?.bookingId || !parsed?.orderId) {
      clearPendingCheckout();
      return null;
    }
    if (!parsed.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      clearPendingCheckout();
      return null;
    }
    return parsed;
  } catch {
    clearPendingCheckout();
    return null;
  }
}

export function clearPendingCheckout() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
