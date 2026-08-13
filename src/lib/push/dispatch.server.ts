/**
 * Shared push dispatch logic.
 *
 * Single source of truth for BOTH:
 *   - the immediate (inline) dispatch path, invoked right after an offer is
 *     created or a notification row is inserted, and
 *   - the pg_cron retry/recovery path (/api/public/cron/offer-push-dispatch
 *     and /api/public/hooks/notification-push).
 *
 * Never duplicate this logic in a route file — routes are thin wrappers.
 * Server-only: `.server.ts` is blocked from client bundles.
 */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function sender() {
  const { sendOfferPush } = await import("@/lib/push/send.server");
  return sendOfferPush;
}

/* ------------------------------------------------------------------ *
 * Daily Shine offer pushes (partner side)
 * ------------------------------------------------------------------ */

type PendingOfferRow = {
  offer_id: string;
  queue_id: string;
  partner_id: string;
  area: string | null;
  vehicle_category: string | null;
  expires_at: string;
};

async function listPendingOffers(sb: any): Promise<PendingOfferRow[]> {
  const { data: offers, error } = await sb.rpc("list_pending_push_offers");
  if (!error && offers) return offers as PendingOfferRow[];
  // Fallback when the RPC isn't installed.
  const { data: fallback, error: fbErr } = await sb
    .from("subscription_offers")
    .select(
      "id, queue_id, partner_id, expires_at, response, subscription_assignment_queue!inner(area,vehicle_category)",
    )
    .eq("response", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("offered_at", { ascending: false })
    .limit(50);
  if (fbErr) throw fbErr;
  return (fallback ?? []).map((o: any) => ({
    offer_id: o.id,
    queue_id: o.queue_id,
    partner_id: o.partner_id,
    area: o.subscription_assignment_queue?.area ?? null,
    vehicle_category: o.subscription_assignment_queue?.vehicle_category ?? null,
    expires_at: o.expires_at,
  }));
}

/**
 * Claim-and-send every pending Daily Shine offer.
 *
 * The partial unique index on offer_delivery_events(offer_id) for the
 * push_claimed/push_sent/push_failed stages makes the claim atomic, so the
 * immediate path and the cron can race safely: whoever claims first sends,
 * the other skips. That is exactly what makes cron a pure fallback.
 *
 * @param claimedBy label recorded in offer_delivery_events.meta
 */
export async function dispatchPendingOffers(claimedBy = "offer-push-dispatch"): Promise<number> {
  const sb = await admin();
  const sendOfferPush = await sender();
  const rows = await listPendingOffers(sb);

  let dispatched = 0;
  for (const r of rows) {
    const { data: claim, error: claimError } = await sb
      .from("offer_delivery_events")
      .insert({
        offer_id: r.offer_id,
        queue_id: r.queue_id,
        partner_id: r.partner_id,
        stage: "push_claimed",
        meta: { claimed_by: claimedBy, claimed_at: new Date().toISOString() },
      })
      .select("id")
      .single();
    if (claimError || !claim?.id) continue;

    const title = "🚗 New Daily Shine Customer";
    const body = `${r.vehicle_category ?? "Vehicle"}${r.area ? ` • ${r.area}` : ""} — tap to view (90s)`;
    // NOTE: `type` must be in the Kotlin ASSIGNMENT_TYPES set so the native
    // service routes this through `postAssignment` (high-importance channel,
    // full-screen intent, custom sound, vibration, wake screen). `dataOnly`
    // suppresses the FCM notification block so background/killed devices
    // always dispatch through onMessageReceived instead of the system tray.
    // REQUIRED CONTRACT — UrbanwashMessagingService.postOffer() returns early
    // (no notify() call, no visible notification) unless ALL THREE of
    // `action_token`, `broadcast_id` and `offer_id` are present in `data`.
    // Daily Shine offers live in subscription_offers / subscription_assignment_queue,
    // which have no marketplace broadcast row, so we map queue_id -> broadcast_id
    // and use the offer id as the action nonce — exactly the shape the Offer
    // Self-Test sends (push-selftest.functions.ts).
    const data: Record<string, string> = {
      type: "daily_shine_offer",
      offer_id: r.offer_id,
      queue_id: r.queue_id,
      broadcast_id: r.queue_id,
      action_token: r.offer_id,
      partner_id: r.partner_id,
      category: "daily_shine",
      link: `/app`,
    };
    if (r.area) data.area = r.area;
    if (r.vehicle_category) data.vehicle = r.vehicle_category;



    try {
      const result = await sendOfferPush({
        userId: r.partner_id,
        title,
        body,
        data,
        channelId: "assignments_v4",
        dataOnly: true,
        tag: r.offer_id,
      });
      const { error: logError } = await sb
        .from("offer_delivery_events")
        .update({
          stage: result.sent > 0 ? "push_sent" : "push_failed",
          meta: {
            sent: result.sent,
            failed: result.failed,
            sample: result.results.slice(0, 3),
            claimed_event_id: claim.id,
            claimed_by: claimedBy,
          },
        })
        .eq("id", claim.id);
      if (logError) throw logError;
      await sb
        .from("partner_notifications")
        .update({ pushed_at: new Date().toISOString() })
        .eq("type", "daily_shine_offer")
        .eq("metadata->>offer_id", r.offer_id);
      if (result.sent > 0) dispatched++;
    } catch (e: any) {
      // Leave the event as push_failed; the cron sweep is the retry path.
      const { error: failLogError } = await sb
        .from("offer_delivery_events")
        .update({
          stage: "push_failed",
          meta: { error: e?.message ?? String(e), claimed_event_id: claim.id, claimed_by: claimedBy },
        })
        .eq("id", claim.id);
      if (failLogError) throw failLogError;
    }
  }
  return dispatched;
}

/* ------------------------------------------------------------------ *
 * Notification-row pushes (customer / partner / admin)
 * ------------------------------------------------------------------ */

/**
 * H-2: server-side allow-list of notification types the Customer App may
 * receive. Anything else — partner lifecycle events, marketplace offers,
 * assignment/dispatch internals — is silently dropped even if a future bug
 * or manual insert accidentally lands in `customer_notifications`.
 */
export const CUSTOMER_ALLOWED_TYPES = new Set<string>([
  // Payment lifecycle
  "payment_success",
  "payment_failed",
  "payment_cancelled",
  "payment_pending",
  "subscription_paid",
  "subscription_activated",
  "booking_confirmed",
  "refund_processing",
  // Service lifecycle (customer-visible only)
  "service_completed",
  "service_started",
  "partner_accepted",
  "partner_assigned",

  "completed",
  "vehicle_unavailable",
  "service_unavailable",
  "vehicle_dirty",
  "dirty_vehicle",
  "extension_applied",
  "addon_completed",
  "entitlement_exhausted",
  // Reminders
  "weekly_wash_reminder",
  "weekly_included_reminder",
  "renewal_reminder",
  "subscription_renewing_soon",
  "expiry_reminder",
  "subscription_expiring_soon",
]);

/**
 * H-1: partner-side types that must render through the unified Kotlin
 * heads-up path (assignments_v4 channel, uw_offer.mp3, full-screen intent,
 * deep link on tap). MUST match `ASSIGNMENT_TYPES` in
 * android-native/kotlin/UrbanwashMessagingService.kt.
 */
export const PARTNER_ASSIGNMENT_TYPES = new Set<string>([
  "new_assignment",
  "new_assignments",
  "assignment_created",
  "assignment_updated",
  "partner_assigned",
  "daily_shine",
  "daily_shine_offer",
  "marketplace_offer",
  "marketplace_offer_update",
  "new_booking",
  "new_customers",
  "route_updated",
]);

/**
 * Customer-side lifecycle types that MUST render through the native Kotlin
 * heads-up path (`postAssignment`, assignments_v4 channel) instead of the
 * Android system tray. Sent data-only so `onMessageReceived` always runs —
 * in foreground, background AND killed states.
 * MUST stay a subset of `ASSIGNMENT_TYPES` in
 * android-native/kotlin/UrbanwashMessagingService.kt.
 */
export const CUSTOMER_HEADSUP_TYPES = new Set<string>([
  "partner_accepted",
  "service_started",
  "service_completed",
  "payment_success",
  "payment_failed",
  "subscription_activated",
  "booking_confirmed",
]);

/**
 * Dispatch unpushed customer notifications.
 *
 * `pushed_at` is stamped ONLY after Firebase reports at least one successful
 * send, so a transient failure leaves the row for the cron retry.
 * Types outside the allow-list are stamped without a send (H-2 safety net).
 */
export async function dispatchCustomerNotifications(): Promise<number> {
  const sb = await admin();
  const sendOfferPush = await sender();
  const { data: rows } = await sb
    .from("customer_notifications")
    .select("id,user_id,title,body,type,link")
    .is("pushed_at", null)
    .gt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .limit(50);

  let sentCount = 0;
  for (const r of (rows ?? [])) {
    const type = String(r.type ?? "");
    console.log(`[CUSTOMER-SERVICE-PUSH:E3] Processing id=${r.id} type=${type} user=${r.user_id}`);

    if (!CUSTOMER_ALLOWED_TYPES.has(type)) {
      await sb.from("customer_notifications").update({ pushed_at: new Date().toISOString() }).eq("id", r.id);
      console.warn(`[CUSTOMER-SERVICE-PUSH:BLOCKED] blocked type="${type}" id=${r.id}`);
      continue;
    }
    const headsUp = CUSTOMER_HEADSUP_TYPES.has(type);
    try {
      console.log(`[CUSTOMER-SERVICE-PUSH:E4] DISPATCH_STARTED event_id=${r.id} type=${type} recipient_id=${r.user_id}`);
      
      const result = await sendOfferPush({
        userId: r.user_id,
        title: r.title,
        body: r.body ?? "",
        data: {
          type,
          link: r.link || (headsUp ? "/app" : ""),
          broadcast_id: `customer:${r.id}`,
          action_token: String(r.id),
          offer_id: String(r.id),
        },
        channelId: headsUp ? "assignments_v4" : "general",
        dataOnly: headsUp,
        ...(headsUp ? { tag: `customer:${r.id}` } : {}),
      });

      if (result.sent > 0) {
        console.log(`[CUSTOMER-SERVICE-PUSH:E7] FCM_SUCCESS event_id=${r.id} sent=${result.sent}`);
        await sb.from("customer_notifications").update({ pushed_at: new Date().toISOString() }).eq("id", r.id);
        sentCount++;
      } else if (result.failed === 0) {
        console.log(`[CUSTOMER-SERVICE-PUSH:E6] DISPATCH_TARGET_RESOLVED user=${r.user_id} token_count=0`);
        await sb.from("customer_notifications").update({ pushed_at: new Date().toISOString() }).eq("id", r.id);
      } else {
        console.error(`[CUSTOMER-SERVICE-PUSH:E8] FCM_FAILURE event_id=${r.id} failed=${result.failed} errors=`, result.results.filter(x => !x.ok).map(x => x.errorCode));
      }
      // sent === 0 && failed > 0 → leave pushed_at null so cron retries.
    } catch (e) {
      console.warn("[push-dispatch] customer send failed, leaving for cron retry", r.id, e);
    }
  }
  return sentCount;
}

/** Dispatch unpushed partner notifications (excluding Daily Shine offers). */
export async function dispatchPartnerNotifications(): Promise<number> {
  const sb = await admin();
  const sendOfferPush = await sender();
  const { data: rows } = await sb
    .from("partner_notifications")
    .select("id,partner_id,title,body,type,link,metadata")
    .is("pushed_at", null)
    // Daily Shine offer pushes are owned exclusively by dispatchPendingOffers,
    // keyed by offer_id and logged in offer_delivery_events.
    .neq("type", "daily_shine_offer")
    .gt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .limit(50);

  let sentCount = 0;
  for (const r of rows ?? []) {
    const type = String(r.type ?? "");
    const isAssignment = PARTNER_ASSIGNMENT_TYPES.has(type);
    try {
      console.log(`[CUSTOMER-SERVICE-PUSH] sendOfferPush start id=${r.id} type=${type}`);
      const result = await sendOfferPush({
        userId: r.partner_id,
        title: r.title,
        body: r.body ?? "",
        data: {
          type,
          link: r.link ?? (isAssignment ? "/app/assignments" : ""),
          // REQUIRED CONTRACT — UrbanwashMessagingService.postAssignment()
          // or postOffer() returns early unless broadcast_id and action_token
          // are present.
          broadcast_id: String(r.id),
          action_token: String(r.id),
          offer_id: String(r.id),
          // Kotlin uses these to key the notification and deep link.
          ...(r.metadata?.assignment_id ? { assignment_id: String(r.metadata.assignment_id) } : {}),
          ...(r.metadata?.service_id ? { service_id: String(r.metadata.service_id) } : {}),
        },
        channelId: isAssignment ? "assignments_v4" : "general",
        dataOnly: isAssignment,
        tag: isAssignment ? `assignment:${r.id}` : undefined,
      });
      if (result.sent > 0) sentCount++;
      if (result.sent > 0 || result.failed === 0) {
        await sb.from("partner_notifications").update({ pushed_at: new Date().toISOString() }).eq("id", r.id);
      }
    } catch (e) {
      console.warn("[push-dispatch] partner send failed, leaving for cron retry", r.id, e);
    }
  }
  return sentCount;
}

/** Dispatch unpushed admin alerts to every admin user. */
export async function dispatchAdminAlerts(): Promise<number> {
  const sb = await admin();
  const sendOfferPush = await sender();
  const { data: rows } = await sb
    .from("admin_alerts")
    .select("id,title,body,kind,meta")
    .is("pushed_at", null)
    .gt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .limit(20);
  if (!rows?.length) return 0;
  const admins = await sb
    .rpc("get_admin_user_ids")
    .then((res: any) => res.data)
    .catch(() => null);
  const adminIds: string[] = (admins ?? []).map((x: any) => x.user_id ?? x);
  for (const r of rows) {
    for (const uid of adminIds) {
      try {
        await sendOfferPush({
          userId: uid,
          title: r.title,
          body: r.body ?? "",
          data: { type: "admin_alert", kind: r.kind ?? "" },
          channelId: "general",
        });
      } catch {
        /* noop */
      }
    }
    await sb.from("admin_alerts").update({ pushed_at: new Date().toISOString() }).eq("id", r.id);
  }
  return rows.length;
}
