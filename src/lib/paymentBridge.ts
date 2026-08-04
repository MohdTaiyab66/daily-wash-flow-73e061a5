/**
 * New minimal Android payment bridge wrapper.
 *
 * One method only: `open(options)`. No fallback, no retry, no diagnostics.
 * Not yet used by any screen — the app still runs on the legacy bridge in
 * `src/lib/razorpay-checkout.ts`.
 */
import { registerPlugin } from "@capacitor/core";

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

export function open(options: PaymentBridgeOptions): Promise<PaymentBridgeResult> {
  return UWCheckout.open(options);
}
