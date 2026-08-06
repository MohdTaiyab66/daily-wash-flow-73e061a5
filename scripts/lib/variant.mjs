// Single source of truth for which app variant is being built.
//
// The Partner app never collects payments, so the whole Razorpay/native
// checkout surface (plugin source, SDK dependency, UPI package visibility,
// MainActivity callbacks) must not exist in the Partner APK. The Customer app
// is unchanged and keeps the full payment stack.
export const VARIANT = (process.env.URBANWASH_APP ?? process.env.VITE_URBANWASH_APP ?? "customer")
  .toLowerCase()
  .trim();

export const IS_PARTNER = VARIANT === "partner";

/** Razorpay / native checkout is only part of the Customer build. */
export const PAYMENTS_ENABLED = !IS_PARTNER;
