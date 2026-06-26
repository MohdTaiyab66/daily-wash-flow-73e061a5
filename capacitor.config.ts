import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for Urban Wash.
 *
 * Two binaries share this codebase. Switch the appId/appName at build time
 * with the env var URBANWASH_APP=partner|customer when you run `cap sync`.
 * Default = partner (the higher-volume install).
 */
const variant = (process.env.URBANWASH_APP ?? "partner").toLowerCase();
const isCustomer = variant === "customer";

const config: CapacitorConfig = {
  appId: isCustomer ? "app.urbanwash.customer" : "app.urbanwash.partner",
  appName: isCustomer ? "Urban Wash" : "Urban Wash Partner",
  webDir: ".output/public", // TanStack Start static output; overridden if you use a different build target
  bundledWebRuntime: false,
  server: {
    // Production: load assets from the bundle. For staging/dev push testing
    // you can point this at your deployed URL via env: CAP_SERVER_URL=https://...
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
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    FirebaseMessaging: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
