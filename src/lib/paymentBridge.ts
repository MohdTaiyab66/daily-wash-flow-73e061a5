/**
 * THE single payment layer for the whole app.
 *
 * Native Android only — the official Razorpay Android SDK behind the
 * `UrbanWashCheckout` Capacitor plugin
 * (android/app/src/main/java/com/urbanwash/payments/UrbanWashCheckoutPlugin.java).
 *
 * No web fallback. No legacy compatibility layer. No diagnostics.
 * No plugin version reporting. Every purchase path in the app — subscriptions,
 * one-time washes, add-ons, premium services, marketplace purchases — MUST call
 * `openRazorpayCheckout` from this file.
 *
 * Nothing is activated here: order creation, signature verification, the
 * webhook and booking activation are server-side and untouched by this layer.
 */
import { registerPlugin } from "@capacitor/core";

/** Exactly the payload the native plugin accepts. */
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

/** Exactly what the native plugin resolves. */
export type PaymentBridgeResult =
  | { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }
  | { cancelled: true };

export interface UrbanWashCheckoutPlugin {
  open(options: PaymentBridgeOptions): Promise<PaymentBridgeResult>;
}

export const UrbanWashCheckout = registerPlugin<UrbanWashCheckoutPlugin>("UrbanWashCheckout");

/** Direct single-method access to the native bridge. */
export function open(options: PaymentBridgeOptions): Promise<PaymentBridgeResult> {
  return UrbanWashCheckout.open(options);
}

export type CheckoutOptions = {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  description: string;
  bookingId: string;
  prefillEmail?: string;
  prefillContact?: string;
  /** Fires immediately before the native sheet is requested. */
  onOpened?: () => void;
};

export type RazorpayResult =
  | { status: "success"; orderId: string; paymentId: string; signature: string }
  | { status: "cancelled" }
  | { status: "failed"; code?: string; message: string };

function toNativeOptions(opts: CheckoutOptions): PaymentBridgeOptions {
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

/**
 * The one and only checkout entry point.
 * Resolves `cancelled` when the user dismisses the sheet and `failed` only
 * when the native SDK throws.
 */
export async function openRazorpayCheckout(opts: CheckoutOptions): Promise<RazorpayResult> {
  try {
    opts.onOpened?.();
    const res = await UrbanWashCheckout.open(toNativeOptions(opts));

    if ("razorpay_payment_id" in res && res.razorpay_payment_id) {
      return {
        status: "success",
        orderId: res.razorpay_order_id ?? opts.orderId,
        paymentId: res.razorpay_payment_id,
        signature: res.razorpay_signature,
      };
    }
    return { status: "cancelled" };
  } catch (e: any) {
    const message = String(e?.message ?? e?.description ?? e ?? "Payment failed");
    return { status: "failed", code: e?.code ? String(e.code) : undefined, message };
  }
}
