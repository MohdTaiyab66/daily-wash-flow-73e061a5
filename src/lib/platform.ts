/**
 * Platform detection — single source of truth for "are we running inside the
 * Capacitor native shell vs a normal browser?". Safe to import anywhere.
 */
import { Capacitor } from "@capacitor/core";

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function nativePlatform(): "android" | "ios" | "web" {
  try {
    const p = Capacitor.getPlatform();
    if (p === "android" || p === "ios") return p;
  } catch {
    /* noop */
  }
  return "web";
}

export function appVariant(): "partner" | "customer" {
  // The two apps are separate binaries with separate appIds. We detect by
  // appId at runtime, falling back to a Vite-time env if needed.
  try {
    const id = (Capacitor as any)?.getAppId?.();
    if (typeof id === "string" && id.includes("customer")) return "customer";
    if (typeof id === "string" && id.includes("partner")) return "partner";
  } catch {
    /* noop */
  }
  const v = import.meta.env.VITE_URBANWASH_APP;
  return v === "customer" ? "customer" : "partner";
}
