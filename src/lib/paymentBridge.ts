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
import { registerPlugin, Capacitor } from "@capacitor/core";

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
  retry?: { enabled: boolean; max_count: number };
  config?: any;
  method?: string | Record<string, boolean>;
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
  // Razorpay treats a present-but-empty prefill value as supplied-invalid and can
  // suppress payment method blocks (notably UPI). Only send what we actually have.
  const email = opts.prefillEmail?.trim();
  const contact = opts.prefillContact?.trim();
  const prefill: NonNullable<PaymentBridgeOptions["prefill"]> = {};
  if (email) prefill.email = email;
  if (contact) prefill.contact = contact;

  const options: PaymentBridgeOptions = {
    key: opts.keyId,
    order_id: opts.orderId,
    amount: opts.amount,
    currency: opts.currency,
    name: "Urban Wash",
    description: opts.description,
    notes: { booking_id: opts.bookingId },
    theme: { color: "#FF6B1A" },
    retry: { enabled: true, max_count: 1 }
  };
  
  // MATCH RAZORPAY DOCUMENTATION: Force "upi" method if we want to ensure it appears.
  // We'll leave it out for the general case first, or explicitly add it if requested.
  // options.method = "upi"; 

  if (Object.keys(prefill).length > 0) options.prefill = prefill;
  return options;
}

/**
 * The one and only checkout entry point.
 * Resolves `cancelled` when the user dismisses the sheet and `failed` only
 * when the native SDK throws.
 */
export async function openRazorpayCheckout(opts: CheckoutOptions): Promise<RazorpayResult> {
  const platform = Capacitor.getPlatform();
  const attemptId = Math.random().toString(36).substring(7);
  
  try {
    console.log(`[PAYMENT] attempt=${attemptId} platform=${platform} open_requested`, { orderId: opts.orderId });
    
    if (platform === 'web') {
      console.warn(`[PAYMENT] attempt=${attemptId} skipping native plugin on web`);
      return { 
        status: "failed", 
        message: "Mobile payments are only supported in the Android app. Please open the Urban Wash app to complete your booking." 
      };
    }

    opts.onOpened?.();
    
    const nativeOptions = toNativeOptions(opts);
    console.log(`[PAYMENT] attempt=${attemptId} calling_native_open`, { 
      pluginName: "UrbanWashCheckout",
      method: "open"
    });
    
    const res = await UrbanWashCheckout.open(nativeOptions);
    console.log(`[PAYMENT] attempt=${attemptId} native_response_received`, res);

    if ("razorpay_payment_id" in res && res.razorpay_payment_id) {
      return {
        status: "success",
        orderId: res.razorpay_order_id ?? opts.orderId,
        paymentId: res.razorpay_payment_id,
        signature: res.razorpay_signature,
      };
    }
    console.log("[PAY_NOW:BRIDGE] payment_cancelled_by_user");
    return { status: "cancelled" };
  } catch (e: any) {
    console.error(`[PAYMENT] attempt=${attemptId} fatal_plugin_error`, e);
    const message = String(e?.message ?? e?.description ?? e ?? "Payment failed");
    return { status: "failed", code: e?.code ? String(e.code) : undefined, message };
  }
}
