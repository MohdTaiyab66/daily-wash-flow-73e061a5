/**
 * Crash-safe / offline-safe pending checkout store.
 *
 * When a Razorpay checkout is opened we persist the minimal context needed to
 * resume it (booking + order ids, amount, prefill), the *selected items* that
 * produced it (vehicle, address, date, slot, add-ons, coupon) and a small
 * event timeline. If the WebView is killed, the network drops, or the user
 * navigates away mid-payment, the next mount can verify the real payment
 * status server-side and either finalize the booking or offer a safe
 * "Resume payment" action — with a readable history of what happened.
 *
 * BUSINESS RULE: nothing here activates anything. It only remembers *what*
 * was being paid for; the server remains the single source of truth for
 * whether it was actually paid.
 */

const KEY = "uw_pending_checkout";
const HOLDER_KEY = "uw_checkout_holder_id";
/** Stale entries are dropped — a Razorpay order is not worth resuming after this. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h
const MAX_EVENTS = 20;

export type CheckoutStage =
  | "created"
  | "opened"
  | "failed"
  | "timeout"
  | "cancelled"
  | "offline"
  | "verifying"
  | "paid"
  | "unpaid";

export type CheckoutEvent = {
  stage: CheckoutStage;
  at: number;
  detail?: string;
};

export type CheckoutSelection = {
  vehicleId?: string | null;
  addressId?: string | null;
  date?: string | null;
  slot?: string | null;
  notes?: string | null;
  addonQty?: Record<string, number>;
  couponCode?: string | null;
};

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
  selection?: CheckoutSelection;
  events?: CheckoutEvent[];
};

/**
 * Stable per-device holder id. The server-side hold is keyed on this so the
 * same device can re-enter its own checkout after a reload, while a second
 * tab/device is blocked while a payment is in flight.
 */
export function getCheckoutHolderId(): string {
  try {
    let id = localStorage.getItem(HOLDER_KEY);
    if (!id) {
      id = `uwh_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      localStorage.setItem(HOLDER_KEY, id);
    }
    return id;
  } catch {
    return `uwh_mem_${Date.now().toString(36)}`;
  }
}

export function savePendingCheckout(row: Omit<PersistedCheckout, "savedAt">) {
  try {
    const prev = readPendingCheckout();
    const events =
      row.events ?? (prev && prev.bookingId === row.bookingId ? prev.events : undefined) ?? [];
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...row, events: events.slice(-MAX_EVENTS), savedAt: Date.now() }),
    );
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
    return { ...parsed, events: parsed.events ?? [] };
  } catch {
    clearPendingCheckout();
    return null;
  }
}

/** Append a timeline event to the persisted checkout (no-op when none). */
export function appendCheckoutEvent(
  bookingId: string,
  stage: CheckoutStage,
  detail?: string,
): CheckoutEvent[] {
  try {
    const stored = readPendingCheckout();
    if (!stored || stored.bookingId !== bookingId) return stored?.events ?? [];
    const events = [...(stored.events ?? []), { stage, at: Date.now(), detail }].slice(-MAX_EVENTS);
    localStorage.setItem(KEY, JSON.stringify({ ...stored, events, savedAt: Date.now() }));
    return events;
  } catch (e) {
    console.warn("[uw-checkout] could not append checkout event", e);
    return [];
  }
}

export function clearPendingCheckout() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
