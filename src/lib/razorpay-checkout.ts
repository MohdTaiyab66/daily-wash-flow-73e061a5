/**
 * Shared Razorpay checkout opener.
 *
 * Native-first (capacitor-razorpay), falling back to the web checkout script.
 * Callers own order creation (`createRazorpayOrder`) and verification
 * (`verifyRazorpayPayment`) — this helper only opens the sheet and resolves
 * with the provider response, or rejects/`cancelled` when the user dismisses.
 *
 * BUSINESS RULE: nothing is activated here. Activation happens server-side
 * only after signature verification.
 */

export type RazorpayResult =
  | { status: "success"; orderId: string; paymentId: string; signature: string }
  | { status: "cancelled" };

export type CheckoutOptions = {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  description: string;
  bookingId: string;
  prefillEmail?: string;
  prefillContact?: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
    __UW_FORCE_WEB?: boolean;
    __UW_FORCE_NATIVE?: boolean;
  }
}

function loadRazorpayCheckout() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const src = "https://checkout.razorpay.com/v1/checkout.js";
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Razorpay checkout failed to load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay checkout failed to load"));
    document.body.appendChild(script);
  });
}

async function openNative(opts: CheckoutOptions): Promise<RazorpayResult> {
  const mod: any = await import("capacitor-razorpay");
  const Checkout = mod?.Checkout;
  if (!Checkout) throw new Error("Native Razorpay plugin not available");
  // Minimal option set — the Android SDK renders its own method sheet (UPI
  // intent apps included) and breaks when web-only `display.blocks` is sent.
  const res: any = await Checkout.open({
    key: opts.keyId,
    amount: opts.amount,
    currency: opts.currency,
    name: "Urban Wash",
    description: opts.description,
    order_id: opts.orderId,
    prefill: { email: opts.prefillEmail ?? "", contact: opts.prefillContact ?? "" },
    notes: { booking_id: opts.bookingId },
    theme: { color: "#0F172A" },
  });
  const r = res?.response ?? res;
  if (!r?.razorpay_payment_id) return { status: "cancelled" };
  return {
    status: "success",
    orderId: r.razorpay_order_id,
    paymentId: r.razorpay_payment_id,
    signature: r.razorpay_signature,
  };
}

function openWeb(opts: CheckoutOptions): Promise<RazorpayResult> {
  return new Promise<RazorpayResult>((resolve, reject) => {
    try {
      const rz = new window.Razorpay!({
        key: opts.keyId,
        amount: opts.amount,
        currency: opts.currency,
        name: "Urban Wash",
        description: opts.description,
        order_id: opts.orderId,
        prefill: { email: opts.prefillEmail ?? "", contact: opts.prefillContact ?? "" },
        notes: { booking_id: opts.bookingId },
        theme: { color: "#0F172A" },
        handler: (r: any) =>
          resolve({
            status: "success",
            orderId: r.razorpay_order_id,
            paymentId: r.razorpay_payment_id,
            signature: r.razorpay_signature,
          }),
        modal: { ondismiss: () => resolve({ status: "cancelled" }) },
      });
      rz.open();
    } catch (e) {
      reject(e as Error);
    }
  });
}

export async function openRazorpayCheckout(opts: CheckoutOptions): Promise<RazorpayResult> {
  const { isNative } = await import("@/lib/platform");
  const nativeMode = window.__UW_FORCE_WEB ? false : window.__UW_FORCE_NATIVE || isNative();

  if (nativeMode) {
    try {
      return await openNative(opts);
    } catch (e) {
      console.warn("[uw-pay] native checkout unavailable, falling back to web", e);
    }
  }

  await loadRazorpayCheckout();
  if (!window.Razorpay) throw new Error("Razorpay checkout is unavailable");
  return openWeb(opts);
}
