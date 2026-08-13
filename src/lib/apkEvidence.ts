import { supabase } from "@/integrations/supabase/client";

/**
2026-08-11: Internal build marker for payment verification.
VERSION: 1.0.32-PAYMENT-FINAL-01
BUILD_TIME: 2026-08-11T00:45:00Z
TARGET: ANDROID_NATIVE_RAZORPAY_1.7.18
*/
export const APK_EVIDENCE = {
  version: "1.0.32-FIX-B-01",
  timestamp: "2026-08-13T10:45:00Z",
  resolvedSdk: "com.razorpay:standard-core:1.7.18",
  bridge: "UrbanWashCheckout"
};

console.log("[APK_EVIDENCE] Loading", APK_EVIDENCE.version);

/**
 * Re-exporting legacy functions used by partner pages to fix build breaks.
 * These are stubs — the customer payment task does not touch partner evidence logic.
 */
export async function logApkEvidence(params: any) {
  console.log("[APK_EVIDENCE] log", params);
  return Promise.resolve();
}

export function evidenceError(err: any) {
  return { message: String(err?.message || err) };
}

