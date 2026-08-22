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
import { InAppNotification } from "@/components/ui/notification-banner";

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

const EVENT_TYPE_MAP: Record<string, { title: string; body: string }> = {
  new_booking: { title: "🚗 New Booking Available", body: "Check available work for earnings details." },
  assignment_released: { title: "🔄 Work Available", body: "New assignments have been released in your area." },
  service_started: { title: "🚗 Service Started", body: "Your vehicle service has started." },
  service_completed: { title: "✓ Service Completed", body: "Your vehicle has been serviced. Photos are ready." },
  vehicle_unavailable: { title: "⚠ Vehicle Unavailable", body: "Your vehicle could not be located today." },
  vehicle_dirty: { title: "⚠ Vehicle Needs Attention", body: "The partner marked your vehicle as dirty." },
  partner_accepted: { title: "✅ Partner Assigned", body: "A partner has accepted your service booking." },
  booking_confirmed: { title: "📅 Booking Confirmed", body: "Your service booking has been confirmed." },
};

function dispatchInAppNotification(data: Record<string, any>, notif: any) {
  const type = data.type || "default";
  const mapped = EVENT_TYPE_MAP[type];
  
  const payload: InAppNotification = {
    id: notif.id || `notif-${Date.now()}`,
    title: mapped?.title || notif.title || "Urban Wash Update",
    body: mapped?.body || notif.body || "You have a new notification",
    type: type,
    link: data.link || (type.includes('booking') || type.includes('assignment') ? '/app/assignments' : ''),
    data: data
  };

  // Enhance body with dynamic earnings/distance if present in payload
  if (type === 'new_booking' || type === 'assignment_released') {
    const earnings = data.earning_monthly || data.monthly_earnings;
    const count = data.customer_count;
    const distance = data.distance_display || (data.distance_km ? `${data.distance_km} km away` : '');
    
    if (earnings && count) {
      payload.body = `${count} customers · ${earnings} potential${distance ? ` · ${distance}` : ''}`;
    }
  }

  window.dispatchEvent(new CustomEvent('urbanwash:in-app-notification', { detail: payload }));
}


/**
 * Idempotently register the device for FCM and wire listeners. Call once after
 * the user is signed in. Safe to call multiple times (returns immediately if
 * already started or running on web).
 */
export async function startFcm(userId: string, app: "partner" | "customer" = appVariant()) {
  const native = isNative();
  const platform = nativePlatform();
  // Initialize FCM for native platform

  if (!native || !userId) {
    // Skip on web or missing user
    return;
  }
  
  // Force initialization for user on mount/login.
  started = false; 
  (window as any)._fcm_last_user = userId;
  
  // Register device for push notifications


  // 1) Permission
  // Check notification permissions
  let perm;
  try {
    perm = await FirebaseMessaging.checkPermissions();
    // Permissions already granted
  } catch (e: any) {
    // Fallback for permission check failure
    // Non-fatal, try to request anyway
  }
  
  if (!perm || perm.receive !== "granted") {
    // Request permissions from user
    try {
      perm = await FirebaseMessaging.requestPermissions();
      // Permission request completed
    } catch (e: any) {
      // Permission request failed
    }
  }
  
  // Note: Permission denial does NOT block token retrieval for diagnostics
  if (perm?.receive !== "granted") {
    // Log missing permissions for diagnostics
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
      // No token returned
      return;
    }
    
    // Register token with backend


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
      console.log(`[PARTNER-FCM] registerPushToken RPC starting...`);
      const { data: { session } } = await supabase.auth.getSession();
      console.log(`[PARTNER-FCM] auth session present: ${!!session}`);
      
      const res = await registerPushToken({
        data: { token, platform: nativePlatform(), device_id: deviceId, app },
      });
      console.log(`[PARTNER-FCM] registerPushToken succeeded:`, res);
      await markOk();
      return;

    } catch (e: any) {
      console.error(`[PARTNER-FCM] registerPushToken failed: ${e?.message ?? String(e)}`);
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
    console.log(`[PARTNER-FCM] getToken started`);
    const { token } = await FirebaseMessaging.getToken();
    console.log(`[PARTNER-FCM] getToken success = ${!!token}`);
    if (token) {
      console.log(`[PARTNER-FCM] token present: length=${token.length}`);
      await upsertToken(token);
    }
  } catch (e: any) {
    console.error(`[PARTNER-FCM] getToken failed with native exception: ${e?.message ?? String(e)}`);
    console.error(`[PARTNER-FCM] error details:`, e);
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
      const data = (event.notification?.data ?? {}) as Record<string, unknown>;
      const hasNotifPayload = !!(event.notification?.title || event.notification?.body);
      
      console.log(`[CUSTOMER-FCM-ANDROID:FOREGROUND] RECEIVED messageId=${event.notification?.id} hasNotif=${hasNotifPayload}`);

      // Dispatch Premium In-App Notification Banner
      dispatchInAppNotification(data, event.notification);

      // Trigger immediate cache invalidation when a notification arrives.
      const type = (data.type as string) || "default";
      if (type.includes('assignment') || type.includes('booking') || type === 'new_assignment') {
        window.dispatchEvent(new CustomEvent('urbanwash:assignment-refresh', { detail: data }));
      }


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
    } catch (e) {
      console.error("[CUSTOMER-FCM-ANDROID:FOREGROUND:ERR]", e);
    }
  });

  // 5) Tap / background open
  FirebaseMessaging.addListener("notificationActionPerformed", async (event) => {
    try {
      await Preferences.set({ key: "urbanwash.last_push_opened_at", value: new Date().toISOString() });
    } catch { /* noop */ }
    await recordLastFcm(event, "System Notification → tap", true);
    const data = (event.notification?.data ?? {}) as Record<string, unknown>;
    const type = (data.type as string) || "default";
    
    // Trigger refresh on tap to ensure we have latest state after coming from background.
    if (type.includes('assignment') || type.includes('booking') || type === 'new_assignment') {
      window.dispatchEvent(new CustomEvent('urbanwash:assignment-refresh', { detail: data }));
    }

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
  console.log(`[PARTNER-FCM] stopFcm triggered for user: ${userId}`);
  if (!isNative()) return;
  
  try {
    // 1. Remove all native listeners
    await FirebaseMessaging.removeAllListeners();
    console.log(`[PARTNER-FCM] stopFcm: native listeners removed`);
    
    // 2. Delete the token from Firebase (ensures a fresh one on next login)
    await FirebaseMessaging.deleteToken();
    console.log(`[PARTNER-FCM] stopFcm: FCM token deleted from device`);
  } catch (err) {
    console.warn(`[PARTNER-FCM] stopFcm cleanup error:`, err);
  }
  
  // 3. Invalidate in database
  if (userId) {
    const deviceId = (await Preferences.get({ key: DEVICE_ID_KEY })).value;
    if (deviceId) {
      console.log(`[PARTNER-FCM] stopFcm: invalidating token in DB for user ${userId} / device ${deviceId}`);
      await supabase
        .from("push_tokens")
        .update({ 
          invalid_at: new Date().toISOString(),
          token: `INVALID_${Date.now()}` // Scramble the token field to prevent accidental reuse
        } as any)
        .match({ user_id: userId, device_id: deviceId } as any);
    }
  }

  // 4. Clear local cache
  try {
    await Preferences.remove({ key: "urbanwash.current_token" });
    await Preferences.remove({ key: "urbanwash.last_uploaded_token" });
  } catch { /* noop */ }

  started = false;
  (window as any)._fcm_last_user = null;
}
