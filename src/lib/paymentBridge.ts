/**
 * Active Android payment bridge.
 *
 * Native (Android) goes through the minimal `UWCheckout` Capacitor plugin
 * (android/app/src/main/java/com/urbanwash/payments/UWCheckoutPlugin.java).
 * Web uses Razorpay Standard Checkout.
 *
 * The exported API shape is identical to the legacy bridge
 * (`src/lib/razorpay-checkout.ts`, still present but unused) so no calling
 * screen or business logic changes.
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
  onOpened?: (channel: CheckoutChannel) => void;
  onDiagnostic?: (label: string, data?: unknown) => void;
};

/** Native payload contract — exactly the nine keys the plugin accepts. */
export type PaymentBridgeOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: { email?: string; contact?: string; name?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
};

export type PaymentBridgeResult =
  | { payment_id: string; order_id: string; signature: string }
  | { cancelled: true };

export interface UWCheckoutPlugin {
  open(options: PaymentBridgeOptions): Promise<PaymentBridgeResult>;
}

export const UWCheckout = registerPlugin<UWCheckoutPlugin>("UWCheckout");

/** Direct, single-method access to the native bridge. */
export function open(options: PaymentBridgeOptions): Promise<PaymentBridgeResult> {
  return UWCheckout.open(options);
}

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

function baseOptions(opts: CheckoutOptions): PaymentBridgeOptions {
  return {
    key: opts.keyId,
    order_id: opts.orderId,
    amount: opts.amount,
    currency: opts.currency,
    name: "Urban Wash",
    description: opts.description,
    prefill: { email: opts.prefillEmail ?? "", contact: opts.prefillContact ?? "" },
    notes: { booking_id: opts.bookingId },
    theme: { color: "#FF6B1A" },
  };
}

async function openNative(opts: CheckoutOptions): Promise<RazorpayResult> {
  const payload = baseOptions(opts);
  opts.onDiagnostic?.("final native checkout payload", payload);
  opts.onOpened?.("native");

  const res = await UWCheckout.open(payload);
  opts.onDiagnostic?.("native checkout returned", res);

  if ("payment_id" in res && res.payment_id) {
    return {
      status: "success",
      channel: "native",
      orderId: res.order_id ?? opts.orderId,
      paymentId: res.payment_id,
      signature: res.signature,
    };
  }
  return { status: "cancelled", channel: "native" };
}

function openWeb(opts: CheckoutOptions): Promise<RazorpayResult> {
  return new Promise<RazorpayResult>((resolve, reject) => {
    let settled = false;
    const settle = (r: RazorpayResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    try {
      const options = {
        ...baseOptions(opts),
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
      opts.onDiagnostic?.("native checkout error", { code: e?.code, message: msg });
      return {
        status: "failed",
        channel: "native",
        code: e?.code ? String(e.code) : undefined,
        message: msg || "Payment failed",
      };
    }
  }

  await loadWebCheckout();
  if (!window.Razorpay) throw new Error("Razorpay checkout is unavailable");
  return openWeb(opts);
}
