/**
 * THE single payment layer for the whole app.
 *
 * Native Android only — the official Razorpay Android SDK behind the
 * `UrbanWashCheckout` Capacitor plugin
 * (android/app/src/main/java/com/urbanwash/payments/UrbanWashCheckoutPlugin.java).
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

export type CheckoutOptions = {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  description: string;
  bookingId: string;
  prefillEmail?: string;
  prefillContact?: string;
  onOpened?: () => void;
};

export type RazorpayResult =
  | { status: "success"; orderId: string; paymentId: string; signature: string }
  | { status: "cancelled" }
  | { status: "failed"; code?: string; message: string };

/**
 * Razorpay only offers UPI when the customer contact is a valid Indian mobile
 * number. Anything else (missing, +91-prefixed, spaced, 0-prefixed) makes the
 * checkout fall back to cards/net-banking only on some devices.
 */
export function normalizeIndianContact(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  if (ten.length !== 10 || !/^[6-9]/.test(ten)) return undefined;
  return `+91${ten}`;
}

function toNativeOptions(opts: CheckoutOptions): PaymentBridgeOptions {
  const email = opts.prefillEmail?.trim();
  const contact = normalizeIndianContact(opts.prefillContact);
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
    retry: { enabled: true, max_count: 1 },
    // Force a UPI block to the top of checkout on every device, then show the
    // remaining default blocks (cards, net banking, wallets) below it.
    config: {
      display: {
        blocks: {
          upi: {
            name: "Pay using UPI",
            instruments: [{ method: "upi" }],
          },
        },
        sequence: ["block.upi"],
        preferences: { show_default_blocks: true },
      },
    },
  };

  if (Object.keys(prefill).length > 0) options.prefill = prefill;
  return options;
}

export async function openRazorpayCheckout(opts: CheckoutOptions): Promise<RazorpayResult> {
  const platform = Capacitor.getPlatform();
  const attemptId = Math.random().toString(36).substring(7);
  
  try {
    console.log(`[PAYMENT] attempt=${attemptId} platform=${platform} open_requested`, { orderId: opts.orderId });
    
    if (platform === 'web') {
      return { 
        status: "failed", 
        message: "Mobile payments are only supported in the Android app." 
      };
    }

    opts.onOpened?.();
    const nativeOptions = toNativeOptions(opts);
    
    const res = await UrbanWashCheckout.open(nativeOptions);

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
    console.error(`[PAYMENT] attempt=${attemptId} fatal_plugin_error`, e);
    const message = String(e?.message ?? e?.description ?? e ?? "Payment failed");
    return { status: "failed", code: e?.code ? String(e.code) : undefined, message };
  }
}
