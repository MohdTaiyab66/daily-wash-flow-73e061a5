/**
 * THE single Razorpay integration for the whole app.
 *
 * Every purchase path — subscriptions, one-time washes, included washes,
 * add-ons, premium services, marketplace purchases and anything added later —
 * MUST go through `openRazorpayCheckout`. No screen may implement its own
 * Razorpay logic: doing so re-introduces divergent payloads, callbacks,
 * verification and logging (audit finding F2).
 *
 * Native (Android) uses the app-owned `UrbanWashCheckout` Capacitor plugin,
 * which calls com.razorpay.Checkout.open(activity, options). Web uses
 * Razorpay Standard Checkout. Both emit exactly one outcome.
 *
 * BUSINESS RULE: nothing is activated here. Activation happens server-side
 * only after signature verification.
 */
import { registerPlugin } from "@capacitor/core";

export type CheckoutChannel = "native" | "web";

export type RazorpayResult =
  | { status: "success"; channel: CheckoutChannel; orderId: string; paymentId: string; signature: string }
  | { status: "cancelled"; channel: CheckoutChannel }
  | { status: "failed"; channel: CheckoutChannel; code?: string; message: string };

export type CheckoutOptions = {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  description: string;
  bookingId: string;
  prefillEmail?: string;
  prefillContact?: string;
  /** Fires once the checkout sheet is genuinely on screen. */
  onOpened?: (channel: CheckoutChannel) => void;
  /** Optional structured logger (diagnostics, timeline, attempt logs). */
  onDiagnostic?: (label: string, data?: unknown) => void;
};

export interface UrbanWashCheckoutPlugin {
  open(options: Record<string, unknown>): Promise<any>;
  recordDiagnostics(options: { line: string }): Promise<{ ok: boolean }>;
  getDiagnostics(): Promise<Record<string, unknown>>;
  exportDiagnostics(options: { webDiagnostics?: string }): Promise<Record<string, unknown>>;
  addListener(event: "checkoutLaunched", cb: (ev: any) => void): Promise<{ remove: () => void }>;
}

/** App-owned native plugin (android/app/src/main/java/com/urbanwash/payments). */
export const UrbanWashCheckout = registerPlugin<UrbanWashCheckoutPlugin>("UrbanWashCheckout");

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on?: (e: string, cb: (r: any) => void) => void };
    __UW_FORCE_WEB?: boolean;
    __UW_FORCE_NATIVE?: boolean;
  }
}

const WEB_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadWebCheckout() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${WEB_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Razorpay checkout failed to load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = WEB_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay checkout failed to load"));
    document.body.appendChild(script);
  });
}

/** Options shared by both channels. Web-only keys are added in `openWeb`. */
function baseOptions(opts: CheckoutOptions) {
  return {
    key: opts.keyId,
    amount: opts.amount,
    currency: opts.currency,
    name: "Urban Wash",
    description: opts.description,
    order_id: opts.orderId,
    prefill: { email: opts.prefillEmail ?? "", contact: opts.prefillContact ?? "" },
    notes: { booking_id: opts.bookingId },
    theme: { color: "#FF6B1A" },
  };
}

async function openNative(opts: CheckoutOptions): Promise<RazorpayResult> {
  const payload = baseOptions(opts);
  opts.onDiagnostic?.("final native checkout payload", payload);

  let launchListener: { remove: () => void } | null = null;
  try {
    launchListener = await UrbanWashCheckout.addListener("checkoutLaunched", () => opts.onOpened?.("native"));
  } catch {
    // Listener is best-effort; the outcome still resolves below.
  }

  try {
    const res: any = await UrbanWashCheckout.open(payload);
    opts.onDiagnostic?.("native checkout returned", res);
    const r = res?.response ?? res;
    if (r?.razorpay_payment_id) {
      return {
        status: "success",
        channel: "native",
        orderId: r.razorpay_order_id ?? opts.orderId,
        paymentId: r.razorpay_payment_id,
        signature: r.razorpay_signature,
      };
    }
    return { status: "cancelled", channel: "native" };
  } finally {
    try { launchListener?.remove?.(); } catch { /* noop */ }
  }
}

function openWeb(opts: CheckoutOptions): Promise<RazorpayResult> {
  return new Promise<RazorpayResult>((resolve, reject) => {
    let settled = false;
    const settle = (r: RazorpayResult) => {
      if (settled) return; // guarantees no duplicate callbacks
      settled = true;
      resolve(r);
    };
    try {
      const options = {
        ...baseOptions(opts),
        // Web-only preferences. EMI / Pay Later stay suppressed so UPI, cards,
        // netbanking and wallets are what customers see.
        method: { upi: true, card: true, netbanking: true, wallet: true, emi: false, paylater: false },
        timeout: 600,
        modal: { escape: true, ondismiss: () => settle({ status: "cancelled", channel: "web" }) },
        handler: (r: any) =>
          settle({
            status: "success",
            channel: "web",
            orderId: r.razorpay_order_id ?? opts.orderId,
            paymentId: r.razorpay_payment_id,
            signature: r.razorpay_signature,
          }),
      };
      opts.onDiagnostic?.("final web checkout payload", options);
      const rz = new window.Razorpay!(options);
      rz.on?.("payment.failed", (resp: any) => {
        opts.onDiagnostic?.("web checkout payment.failed", resp);
        settle({
          status: "failed",
          channel: "web",
          code: resp?.error?.code,
          message: resp?.error?.description || "Payment failed. Please try again.",
        });
      });
      rz.open();
      opts.onOpened?.("web");
    } catch (e) {
      reject(e as Error);
    }
  });
}

/** Resolve the channel to use for this device/session. */
export async function resolveCheckoutChannel(): Promise<CheckoutChannel> {
  if (typeof window !== "undefined" && window.__UW_FORCE_WEB) return "web";
  if (typeof window !== "undefined" && window.__UW_FORCE_NATIVE) return "native";
  const { isNative } = await import("@/lib/platform");
  return isNative() ? "native" : "web";
}

export async function openRazorpayCheckout(opts: CheckoutOptions): Promise<RazorpayResult> {
  const channel = await resolveCheckoutChannel();

  if (channel === "native") {
    try {
      return await openNative(opts);
    } catch (e: any) {
      const msg = String(e?.message || e?.description || e || "");
      const unavailable = /not implemented|not available|unimplemented/i.test(msg) || e?.code === "UNIMPLEMENTED";
      opts.onDiagnostic?.("native checkout error", { code: e?.code, message: msg, unavailable });
      if (!unavailable) {
        return { status: "failed", channel: "native", code: e?.code ? String(e.code) : undefined, message: msg || "Payment failed" };
      }
      // Only a missing native bridge falls back to the WebView sheet.
      console.warn("[uw-pay] native checkout unavailable, falling back to web", e);
    }
  }

  await loadWebCheckout();
  if (!window.Razorpay) throw new Error("Razorpay checkout is unavailable");
  return openWeb(opts);
}
