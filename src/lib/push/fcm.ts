/**
 * Native FCM client glue. All entry points are no-ops on web (returning early
 * via `isNative()`), so calling them from a shared component is safe.
 *
 * Responsibilities:
 *  - request notification permission
 *  - register for native push and persist the FCM token in `push_tokens`
 *  - listen for token refresh
 *  - route foreground / background / cold-start payloads to the correct screen
 *  - record `push_delivered` / `opened` events in `offer_delivery_events`
 */
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { App as CapApp } from "@capacitor/app";
import { Preferences } from "@capacitor/preferences";
import { supabase } from "@/integrations/supabase/client";
import { isNative, nativePlatform, appVariant } from "@/lib/platform";

type OfferPayload = {
  type: "offer";
  offer_id: string;
  queue_id: string;
  partner_id?: string;
};

const DEVICE_ID_KEY = "urbanwash.device_id";
let started = false;
let pendingDeepLink: OfferPayload | null = null;
let pendingLink: string | null = null;

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await Preferences.get({ key: DEVICE_ID_KEY });
  if (existing.value) return existing.value;
  const id = `dev_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  await Preferences.set({ key: DEVICE_ID_KEY, value: id });
  return id;
}

export function consumePendingOfferDeepLink(): OfferPayload | null {
  const p = pendingDeepLink;
  pendingDeepLink = null;
  return p;
}

export function consumePendingLink(): string | null {
  const l = pendingLink;
  pendingLink = null;
  return l;
}

async function recordEvent(stage: string, offer: OfferPayload, extra: Record<string, unknown> = {}) {
  try {
    // Best-effort; do not block UX if it fails.
    await supabase.from("offer_delivery_events" as any).insert({
      offer_id: offer.offer_id,
      queue_id: offer.queue_id,
      partner_id: offer.partner_id ?? null,
      stage,
      meta: { source: "native", platform: nativePlatform(), ...extra },
    });
  } catch {
    /* noop */
  }
}

function isOffer(data: unknown): data is OfferPayload {
  return !!data && typeof data === "object" && (data as any).type === "offer" && !!(data as any).offer_id;
}

/**
 * Idempotently register the device for FCM and wire listeners. Call once after
 * the user is signed in. Safe to call multiple times (returns immediately if
 * already started or running on web).
 */
export async function startFcm(userId: string, app: "partner" | "customer" = appVariant()) {
  if (!isNative() || !userId) {
    console.log(`[CUSTOMER-FCM-ANDROID:00] startFcm aborted: native=${isNative()}, userId=${!!userId}`);
    return;
  }
  
  // Reset started to false if it's a new user to allow re-registration
  const lastUser = (window as any)._fcm_last_user;
  if (lastUser && lastUser !== userId) {
    console.log(`[CUSTOMER-FCM-REGISTRATION] User changed from ${lastUser} to ${userId}, resetting registration state`);
    started = false;
  }
  (window as any)._fcm_last_user = userId;

  if (started) {
    console.log(`[CUSTOMER-FCM-REGISTRATION:01] startFcm already started for user: ${userId}`);
    return;
  }
  started = true;

  console.log(`[CUSTOMER-FCM-ANDROID:01] Firebase initialized (Capacitor)`);
  console.log(`[CUSTOMER-FCM-ANDROID:02] Firebase project ID: (via google-services.json)`);
  console.log(`[CUSTOMER-FCM-ANDROID:03] Application/package ID: com.urbanwash.${app}`);
  console.log(`[CUSTOMER-FCM-REGISTRATION:01] AUTH_SESSION_AVAILABLE. user: ${userId}, app: ${app}`);


  // 1) Permission
  console.log(`[CUSTOMER-FCM-ANDROID:05] getToken started`);
  let perm = await FirebaseMessaging.checkPermissions();
  console.log(`[CUSTOMER-FCM-ANDROID:04] Notification permission: ${perm.receive}`);
  console.log(`[CUSTOMER-FCM-REGISTRATION:02] NOTIFICATION_PERMISSION_STATUS: ${JSON.stringify(perm)}`);

  
  if (perm.receive !== "granted") {
    console.log(`[CUSTOMER-FCM-REGISTRATION] requesting permissions...`);
    perm = await FirebaseMessaging.requestPermissions();
    console.log(`[CUSTOMER-FCM-REGISTRATION] requestPermissions result: ${JSON.stringify(perm)}`);
  }
  
  if (perm.receive !== "granted") {
    console.warn(`[CUSTOMER-FCM-REGISTRATION] permission DENIED`);
    started = false;
    return;
  }

  // 2) Notification channels (Android)
  if (nativePlatform() === "android") {
    try {
      await FirebaseMessaging.createChannel({
        id: "offers_v4",
        name: "Offers",
        description: "New customer offers — accept within 90 seconds",
        importance: 5, // MAX
        sound: "default",
        vibration: true,
        lights: true,
        visibility: 1,
      });
      await FirebaseMessaging.createChannel({
        id: "assignments_v4",
        name: "Assignments",
        description: "Updates about your assigned customers",
        importance: 5, // MAX importance for customer heads-up
        sound: "default",
        vibration: true,
      });

      await FirebaseMessaging.createChannel({
        id: "general",
        name: "General",
        description: "General notifications",
        importance: 3,
      });
    } catch {
      /* channels may already exist */
    }
  }

  // 3) Token registration + persistence
  const deviceId = await getOrCreateDeviceId();
  const upsertToken = async (token: string) => {
    if (!token) {
      console.error("[CUSTOMER-FCM-ANDROID:06] getToken failed: empty token");
      console.error("[CUSTOMER-FCM-REGISTRATION:07] TOKEN_BACKEND_REGISTRATION_FAILED: empty token");
      return;
    }
    
    console.log(`[CUSTOMER-FCM-ANDROID:06] getToken success`);
    console.log(`[CUSTOMER-FCM-REGISTRATION:02] token received = true`);
    console.log(`[CUSTOMER-FCM-REGISTRATION:03] platform = ${nativePlatform()}`);
    console.log(`[CUSTOMER-FCM-REGISTRATION:05] TOKEN_BACKEND_REGISTRATION_STARTED. user_id: ${userId}, platform: ${nativePlatform()}, app: ${app}, token_len: ${token.length}, tail: ${token.slice(-4)}`);


    try {
      await Preferences.set({ key: "urbanwash.last_token_refresh_at", value: new Date().toISOString() });
      await Preferences.set({ key: "urbanwash.current_token", value: token });
    } catch { /* noop */ }

    const markOk = async () => {
      try {
        await Preferences.set({ key: "urbanwash.last_token_upload_at", value: new Date().toISOString() });
        await Preferences.set({ key: "urbanwash.last_uploaded_token", value: token });
        await Preferences.set({ key: "urbanwash.last_token_upload_error", value: "" });
        console.log(`[CUSTOMER-FCM-REGISTRATION:06] TOKEN_BACKEND_REGISTRATION_SUCCESS`);
      } catch { /* noop */ }
    };
    const markErr = async (msg: string) => {
      try {
        await Preferences.set({ key: "urbanwash.last_token_upload_error", value: msg });
      } catch { /* noop */ }
      console.error("[CUSTOMER-FCM-REGISTRATION:07] TOKEN_BACKEND_REGISTRATION_FAILED:", msg);
    };

    try {
      const { registerPushToken } = await import("./register-token.functions");
      console.log(`[CUSTOMER-FCM-REGISTRATION:04] upsert started`);
      const res = await registerPushToken({
        data: { token, platform: nativePlatform(), device_id: deviceId, app },
      });
      console.log(`[CUSTOMER-FCM-ANDROID:07] backend registration success`);
      console.log(`[CUSTOMER-FCM-REGISTRATION:05] upsert success`);
      await markOk();
      return;

    } catch (e: any) {
      console.error(`[CUSTOMER-FCM-REGISTRATION] RPC catch: ${e?.message ?? String(e)}`);
      await markErr(`server: ${String(e?.message ?? e ?? "unknown")}`);
    }

    // Fallback (offline / server fn unreachable)
    try {
      console.log(`[CUSTOMER-FCM-REGISTRATION] falling back to direct Supabase upsert...`);
      const { error } = await supabase.from("push_tokens").upsert(
        {
          user_id: userId,
          token,
          platform: nativePlatform(),
          device_id: deviceId,
          app,
          last_seen: new Date().toISOString(),
          invalid_at: null,
        } as any,
        { onConflict: "token" } as any,
      );
      if (!error) {
        console.log(`[CUSTOMER-FCM-REGISTRATION] direct upsert SUCCESS`);
        await markOk();
      } else {
        console.error(`[CUSTOMER-FCM-REGISTRATION] direct upsert FAILED: ${error.code} ${error.message}`);
        await markErr(`${error.code ?? ""} ${error.message ?? ""}`.trim());
      }
    } catch (e: any) {
      console.error(`[CUSTOMER-FCM-REGISTRATION] direct upsert catch: ${e?.message ?? String(e)}`);
      await markErr(String(e?.message ?? e ?? "unknown"));
    }
  };

  try {
    console.log(`[CUSTOMER-FCM-REGISTRATION:03] FCM_TOKEN_REQUEST_STARTED`);
    const { token } = await FirebaseMessaging.getToken();
    console.log(`[CUSTOMER-FCM-REGISTRATION:04] FCM_TOKEN_RECEIVED. exists: ${!!token}, len: ${token?.length || 0}`);
    if (token) await upsertToken(token);
  } catch (e: any) {
    console.error(`[CUSTOMER-FCM-REGISTRATION] getToken failed: ${e?.message ?? String(e)}`);
  }

  FirebaseMessaging.addListener("tokenReceived", async ({ token }) => {
    await upsertToken(token);
  });

  // Diagnostics: persist a snapshot of the most recently received FCM push so
  // the Device Diagnostics card can prove delivery/display path.
  const recordLastFcm = async (
    event: any,
    displayPath: string,
    displayed: boolean,
  ) => {
    try {
      const notif = event?.notification ?? {};
      const data = (notif.data ?? {}) as Record<string, unknown>;
      const meta = {
        time: new Date().toISOString(),
        payloadType: (data.type as string) ?? (notif.title ? "notification" : "unknown"),
        channel:
          (data.channel_id as string) ??
          (data.channelId as string) ??
          notif.channelId ??
          notif.android?.channelId ??
          "—",
        messageId: notif.id ?? notif.messageId ?? (data.message_id as string) ?? "—",
        displayed,
        displayPath,
        title: notif.title ?? null,
        body: notif.body ?? null,
      };
      await Preferences.set({ key: "urbanwash.last_fcm_meta", value: JSON.stringify(meta) });
    } catch { /* noop */ }
  };

  // 4) Foreground: incoming notification
  FirebaseMessaging.addListener("notificationReceived", async (event) => {
    try {
      await Preferences.set({ key: "urbanwash.last_push_at", value: new Date().toISOString() });
    } catch { /* noop */ }
    const data = (event.notification?.data ?? {}) as Record<string, unknown>;
    const hasNotifPayload = !!(event.notification?.title || event.notification?.body);
    await recordLastFcm(
      event,
      hasNotifPayload
        ? "System Notification (foreground)"
        : "UrbanwashMessagingService → data-only (foreground)",
      hasNotifPayload,
    );
    if (isOffer(data)) {
      await recordEvent("push_delivered", data, { in_app: true });
      // OfferPopup is already mounted globally and listens to realtime; no
      // further action required for the foreground case.
    }
  });

  // 5) Tap / background open
  FirebaseMessaging.addListener("notificationActionPerformed", async (event) => {
    try {
      await Preferences.set({ key: "urbanwash.last_push_opened_at", value: new Date().toISOString() });
    } catch { /* noop */ }
    await recordLastFcm(event, "System Notification → tap", true);
    const data = (event.notification?.data ?? {}) as Record<string, unknown>;
    const link = typeof data.link === "string" ? data.link : null;
    if (isOffer(data)) {
      await recordEvent("opened", data, { action: event.actionId });
      pendingDeepLink = data;
      // Single-UI flow: notification tap opens the app and refreshes offers;
      // OfferPopup (globally mounted) then shows the pending offer. No
      // dedicated fullscreen lead route.
      pendingLink = "/app";
      window.dispatchEvent(new CustomEvent("urbanwash:offer-deeplink", { detail: data }));
      window.dispatchEvent(new CustomEvent("urbanwash:offer-refresh"));
      window.dispatchEvent(new CustomEvent("urbanwash:deeplink", { detail: { link: pendingLink } }));
    } else if (link && link.startsWith("/")) {

      pendingLink = link;
      window.dispatchEvent(new CustomEvent("urbanwash:deeplink", { detail: { link } }));
    }
  });

  // 6) Cold-start: app launched by tapping a notification
  try {
    const last = await FirebaseMessaging.getDeliveredNotifications();
    const firstOffer = last.notifications?.find((n) => isOffer(n.data));
    if (firstOffer) {
      const data = firstOffer.data as OfferPayload;
      await recordEvent("opened", data, { cold_start: true });
      await recordLastFcm({ notification: firstOffer }, "System Notification (cold-start)", true);
      pendingDeepLink = data;
    }
  } catch {
    /* noop */
  }

  // 7) When the app comes back to foreground, give the popup another nudge.
  CapApp.addListener("appStateChange", ({ isActive }) => {
    if (isActive) {
      window.dispatchEvent(new CustomEvent("urbanwash:offer-refresh"));
    }
  });
}

/**
 * Disconnect (sign-out). Best-effort cleanup of listeners + token row.
 */
export async function stopFcm(userId: string | null) {
  if (!isNative()) return;
  try {
    await FirebaseMessaging.removeAllListeners();
  } catch {
    /* noop */
  }
  if (userId) {
    const deviceId = (await Preferences.get({ key: DEVICE_ID_KEY })).value;
    if (deviceId) {
      await supabase
        .from("push_tokens")
        .update({ invalid_at: new Date().toISOString() } as any)
        .match({ user_id: userId, device_id: deviceId } as any);
    }
  }
  started = false;
}
