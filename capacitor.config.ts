import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for Urban Wash.
 *
 * Two binaries share this codebase. Switch the variant at build time with:
 *   URBANWASH_APP=customer node node_modules/@capacitor/cli/bin/capacitor sync android   → Customer APK
 *   URBANWASH_APP=partner  node node_modules/@capacitor/cli/bin/capacitor sync android   → Partner APK (default)
 *
 * The variant flag controls: appId, appName, splash background color, and
 * the runtime app shell (see src/lib/platform.ts → appVariant()).
 *
 * Same backend, same database, same realtime — only the package id/branding
 * and the routes the user lands on change.
 */
const variant = (process.env.URBANWASH_APP ?? "partner").toLowerCase();
const isCustomer = variant === "customer";
const defaultServerUrl = isCustomer
  ? "https://daily-wash-flow.lovable.app/c"
  : "https://daily-wash-flow.lovable.app/auth";
const serverUrl = process.env.CAP_SERVER_URL || defaultServerUrl;

const config: CapacitorConfig = {
  appId: isCustomer ? "com.urbanwash.customer" : "com.urbanwash.partner",
  appName: isCustomer ? "Urban Wash" : "Urban Wash Partner",
  webDir: "mobile-shell", // Fallback shell if the hosted app cannot be reached.
  bundledWebRuntime: false,
  server: {
    androidScheme: "https",
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    allowNavigation: [
      "daily-wash-flow.lovable.app",
      "*.lovable.app",
      "*.supabase.co",
      "*.google.com",
      "*.googleapis.com",
      "*.gstatic.com",
    ],
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
