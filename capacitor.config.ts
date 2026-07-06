import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for Urban Wash.
 *
 * Two binaries share this codebase. Switch the variant at build time with:
 *   URBANWASH_APP=customer npx cap sync android   → Customer APK
 *   URBANWASH_APP=partner  npx cap sync android   → Partner APK   (default)
 *
 * The variant flag controls: appId, appName, splash background color, and
 * the runtime app shell (see src/lib/platform.ts → appVariant()).
 *
 * Same backend, same database, same realtime — only the package id/branding
 * and the routes the user lands on change.
 */
const variant = (process.env.URBANWASH_APP ?? "partner").toLowerCase();
const isCustomer = variant === "customer";

const config: CapacitorConfig = {
  appId: isCustomer ? "com.urbanwash.customer" : "com.urbanwash.partner",
  appName: isCustomer ? "Urban Wash" : "Urban Wash Partner",
  webDir: "mobile-shell", // Static Capacitor shell; the TanStack SSR build does not emit index.html.
  bundledWebRuntime: false,
  server: {
    androidScheme: "https",
    url: process.env.CAP_SERVER_URL || undefined,
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "always",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: isCustomer ? "#FF6B1A" : "#0F172A",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    FirebaseMessaging: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
