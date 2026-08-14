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

async function resolvers() {
  const { resolvePartnerBookingEarning, resolvePartnerBookingDistance, resolvePartnerMonthlyEarning } = await import("@/lib/push/resolvers.server");
  return { resolvePartnerBookingEarning, resolvePartnerBookingDistance, resolvePartnerMonthlyEarning };
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
  if (!error && offers) {
    return offers as PendingOfferRow[];
  }
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
export async function dispatchPendingOffers(claimedBy = "offer-push-dispatch", pBookingId?: string): Promise<number> {
  const ts_event = Date.now();
  console.log(`[PUSH-LATENCY:01] EVENT_CREATED ts=${ts_event}`);
  const sb = await admin();

  const sendOfferPush = await sender();
  
  if (pBookingId) {
    console.log(`[BOOKING-PUSH:02] AREA_RESOLVED booking_id=${pBookingId}`);
  }
  const rows = await listPendingOffers(sb);
  const ts_dispatch = Date.now();
  console.log(`[PUSH-LATENCY:03] DISPATCH_TRIGGERED ts=${ts_dispatch}`);
  const totalEligible = rows.length;
  console.log(`[BOOKING-PUSH:03] ELIGIBLE_PARTNERS count=${totalEligible}`);
  console.log(`[BOOKING-PUSH:05] FANOUT_STARTED count=${totalEligible} claimed_by=${claimedBy}`);


  let dispatched = 0;
  // FAN OUT IN PARALLEL: One bad token or timeout must not stop others.
  const fanoutPromises = rows.map(async (r) => {
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
    
    if (claimError || !claim?.id) {
      if (claimError?.code === "23505") {
        // Idempotency check: already claimed by another process (e.g., cron vs immediate)
        return false;
      }
      return false;
    }
    
    const ts_created = Date.now();
    console.log(`[PUSH-LATENCY:02] NOTIFICATION_CREATED ts=${ts_created}`);
    console.log(`[BOOKING-PUSH:04] NOTIFICATION_ROWS_CREATED offer_id=${r.offer_id}`);


    const { resolvePartnerBookingEarning, resolvePartnerBookingDistance, resolvePartnerMonthlyEarning } = await resolvers();
    
    // Resolve Partner-specific Earnings and Distance
    const [earnings, monthly, distance] = await Promise.all([
      resolvePartnerBookingEarning({
        sb,
        offerId: r.offer_id,
        partnerId: r.partner_id,
        incentive: 0, 
      }),
      resolvePartnerMonthlyEarning({
        sb,
        partnerId: r.partner_id,
        incentive: 0,
        startDate: (r as any).subscription_start_date ?? null,
        renewalDate: (r as any).subscription_renewal_date ?? null,
      }),
      resolvePartnerBookingDistance({
        sb,
        partnerId: r.partner_id,
        customerLat: (r as any).customer_lat ?? null,
        customerLng: (r as any).customer_lng ?? null,
      }),
    ]);

    const title = `🚗 New Booking • ${monthly.display}`;
    const body = `${r.vehicle_category ?? "Vehicle"}${r.area ? ` • ${r.area}` : ""} • ${distance.display}`;
    
    const data: Record<string, string> = {
      type: "daily_shine_offer",
      offer_id: r.offer_id,
      queue_id: r.queue_id,
      broadcast_id: r.queue_id,
      action_token: r.offer_id,
      partner_id: r.partner_id,
      category: "daily_shine",
      link: `/app`,
      earning_display: monthly.display,
      earning_amount: String(monthly.monthlyAmount),
      earning_monthly: monthly.display,
      distance_display: distance.display,
      distance_km: distance.km ? String(distance.km) : "",
    };

    if (r.area) data.area = r.area;
    if (r.vehicle_category) data.vehicle = r.vehicle_category;

    try {
      const ts_dispatch = Date.now();
      console.log(`[PUSH-LATENCY:03] DISPATCH_TRIGGERED ts=${ts_dispatch}`);
      console.log(`[BOOKING-PUSH:07] FCM_BATCH_DISPATCH_STARTED partner_id=${r.partner_id} offer_id=${r.offer_id}`);



      const result = await sendOfferPush({
        userId: r.partner_id,
        title,
        body,
        data,
        channelId: "assignments_v4",
        dataOnly: true,
        tag: r.offer_id,
      });

      const successCount = result.sent;
      const failureCount = result.failed;
      console.log(`[BOOKING-PUSH:08] FCM_BATCH_DISPATCH_RESULT success=${successCount} failed=${failureCount} offer_id=${r.offer_id}`);

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
      
      return result.sent > 0;
    } catch (e: any) {
      console.error(`[BOOKING-PUSH:ERROR] Dispatch failed for partner_id=${r.partner_id}`, e);
      const { error: failLogError } = await sb
        .from("offer_delivery_events")
        .update({
          stage: "push_failed",
          meta: { error: e?.message ?? String(e), claimed_event_id: claim.id, claimed_by: claimedBy },
        })
        .eq("id", claim.id);
      if (failLogError) console.warn("Failed to log push failure", failLogError);
      return false;
    }
  });

  const results = await Promise.all(fanoutPromises);
  dispatched = results.filter(Boolean).length;
  
  console.log(`[BOOKING-PUSH:09] FANOUT_COMPLETE total_dispatched=${dispatched}`);
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
  "booking_created",
  "new_booking",
  "booking_cancelled",
  // Service lifecycle (customer-visible only)
  "service_completed",
  "service_started",
  "partner_accepted",
  "partner_assigned",
  "partner_assigned_immediate",
  "service_rescheduled",

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
  "assignment_released",
  "assignment_cancelled",
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
  "booking_created",
  "new_booking",
  "booking_cancelled",
  "vehicle_unavailable",
  "service_unavailable",
  "vehicle_dirty",
  "dirty_vehicle",
  "service_rescheduled",
]);

/**
 * Dispatch unpushed customer notifications.
 *
 * `pushed_at` is stamped ONLY after Firebase reports at least one successful
 * send, so a transient failure leaves the row for the cron retry.
 * Types outside the allow-list are stamped without a send (H-2 safety net).
 */
export async function dispatchCustomerNotifications(): Promise<number> {
  const ts_event = Date.now();
  console.log(`[PUSH-LATENCY:01] EVENT_CREATED ts=${ts_event}`);
  const sb = await admin();

  const sendOfferPush = await sender();
  const { data: rows } = await sb
    .from("customer_notifications")
    .select("id,user_id,title,body,type,link")
    .is("pushed_at", null)
    .order("created_at", { ascending: false })
    .gt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .limit(50);

  let sentCount = 0;
  for (const r of (rows ?? [])) {
    console.log(`[PUSH-LATENCY:02] NOTIFICATION_CREATED ts=${Date.now()}`);
    const type = String(r.type ?? "");

    // Canonical mapping to prevent unknown events
    const canonicalTypeMap: Record<string, string> = {
      "vehicle_not_found": "vehicle_unavailable",
      "dirty": "vehicle_dirty",
      "completed": "service_completed",
      "assigned": "partner_assigned",
    };
    const mappedType = canonicalTypeMap[type] || type;

    const isUnavailable = mappedType === "service_unavailable" || mappedType === "vehicle_unavailable" || mappedType === "vehicle_dirty" || mappedType === "dirty_vehicle" || mappedType === "vehicle_not_found" || mappedType === "dirty";
    
    if (isUnavailable) {
      console.log(`[UNAVAILABLE-PUSH:03] EVENT_RESOLVED type=${mappedType} original=${type}`);
      console.log(`[UNAVAILABLE-PUSH:04] CUSTOMER_NOTIFICATION_CREATED id=${r.id}`);
      console.log(`[UNAVAILABLE-E2E:03] EVENT_TYPE_RESOLVED type=${mappedType}`);
      console.log(`[UNAVAILABLE-E2E:04] CUSTOMER_NOTIFICATION_CREATED`);
    } else {

      console.log(`[CUSTOMER-PROD-E2E:03] CUSTOMER_NOTIFICATION_CREATED id=${r.id} type=${mappedType} user_id=${r.user_id}`);
      console.log(`[CUSTOMER-PROD-E2E:04] NOTIFICATION_TYPE_RESOLVED type=${mappedType}`);
      console.log(`[CUSTOMER-PROD-E2E:05] CUSTOMER_USER_RESOLVED user_id=${r.user_id}`);
    }

    if (!CUSTOMER_ALLOWED_TYPES.has(mappedType)) {
      await sb.from("customer_notifications").update({ pushed_at: new Date().toISOString() }).eq("id", r.id);
      console.warn(`[CUSTOMER-PROD-E2E:DISPATCH:BLOCKED] blocked type="${mappedType}" id=${r.id}`);
      continue;
    }
    
    const headsUp = CUSTOMER_HEADSUP_TYPES.has(mappedType);
    try {
      const ts_dispatch = Date.now();
      if (isUnavailable) {
        console.log(`[UNAVAILABLE-PUSH:05] IMMEDIATE_DISPATCH_STARTED id=${r.id} user_id=${r.user_id}`);
        console.log(`[UNAVAILABLE-E2E:05] IMMEDIATE_DISPATCH_TRIGGERED`);
        console.log(`[PUSH-LATENCY:03] DISPATCH_TRIGGERED ts=${ts_dispatch}`);
      } else {
        console.log(`[CUSTOMER-PROD-E2E:03-DETAIL] NOTIFICATION_ROW_FOUND id=${r.id} user_id=${r.user_id} type=${mappedType}`);
        console.log(`[PUSH-LATENCY:03] DISPATCH_TRIGGERED ts=${ts_dispatch}`);
      }


      // Checkpointed Payload (Checkpoint 9)
      const dataPayload: Record<string, string> = {
        type: mappedType,
        link: r.link || (headsUp ? "/app" : ""),
        broadcast_id: `customer:${r.id}`,
        action_token: String(r.id),
        offer_id: String(r.id),
      };

      if (isUnavailable) {
        console.log(`[UNAVAILABLE-PUSH:06] CUSTOMER_TOKEN_RESOLVED`);
        console.log(`[UNAVAILABLE-E2E:06] CUSTOMER_TOKEN_RESOLVED`);
      }
      console.log(`[PUSH-LATENCY:04] TOKEN_RESOLVED ts=${Date.now()}`);


      const result = await sendOfferPush({
        userId: r.user_id,
        title: r.title,
        body: r.body ?? "",
        data: dataPayload,
        channelId: headsUp ? "assignments_v4" : "general",
        dataOnly: headsUp,
        ...(headsUp ? { tag: `customer:${r.id}` } : {}),
      });

      if (result.sent > 0) {
        if (isUnavailable) {
          console.log(`[UNAVAILABLE-PUSH:07] FCM_ACCEPTED message_id=${result.results[0]?.messageId}`);
          console.log(`[UNAVAILABLE-E2E:08] FCM_SERVER_ACCEPTED`);
        } else {
          console.log(`[CUSTOMER-PROD-E2E:08] FCM_SERVER_ACCEPTED id=${r.id} message_id=${result.results[0]?.messageId}`);
        }

        await sb.from("customer_notifications").update({ pushed_at: new Date().toISOString() }).eq("id", r.id);
        sentCount++;
      } else if (result.failed === 0) {
        await sb.from("customer_notifications").update({ pushed_at: new Date().toISOString() }).eq("id", r.id);
      } else {
        console.error(`[CUSTOMER-PROD-E2E:FAILURE] NOTIFICATION_SEND_FAILED id=${r.id} failed=${result.failed}`);
      }

      if (isUnavailable) {
        console.log(`[UNAVAILABLE-PUSH:08] DISPATCH_COMPLETE id=${r.id}`);
        console.log(`[UNAVAILABLE-E2E:09] ANDROID_RECEIVED (pending receipt)`);
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
  const ts_event = Date.now();
  console.log(`[PUSH-LATENCY:01] EVENT_CREATED ts=${ts_event}`);
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
    console.log(`[PUSH-LATENCY:02] NOTIFICATION_CREATED ts=${Date.now()}`);
    const type = String(r.type ?? "");

    // Canonical mapping for P0-B Reliability
    const canonicalTypeMap: Record<string, string> = {
      "new_assignments": "new_booking",
      "assignment_created": "new_booking",
      "partner_assigned": "new_booking",
    };
    const mappedType = canonicalTypeMap[type] || type;
    
    const isAssignment = PARTNER_ASSIGNMENT_TYPES.has(mappedType);
    
    try {
      const ts_dispatch = Date.now();
      console.log(`[PUSH-LATENCY:03] DISPATCH_TRIGGERED ts=${ts_dispatch}`);
      console.log(`[PARTNER-BOOKING-E2E:07] FCM_BATCH_DISPATCH_STARTED id=${r.id} type=${mappedType}`);
      console.log(`[PUSH-LATENCY:04] TOKEN_RESOLVED ts=${Date.now()}`);

      const result = await sendOfferPush({
        userId: r.partner_id,
        title: r.title,
        body: r.body ?? "",
        data: {
          type: mappedType,
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

/**
 * [RELEASED-WORK-PUSH] 
 * Specialized dispatcher for assignment cancellation/release.
 * Fans out to all eligible partners except the cancelling one.
 */
export async function dispatchAssignmentReleased(pAssignmentId: string, pCancellingPartnerId: string): Promise<number> {
  console.log(`[RELEASED-WORK-PUSH:01] BROADCAST_CREATED assignment_id=${pAssignmentId}`);
  const sb = await admin();
  const sendOfferPush = await sender();
  const { resolvePartnerBookingDistance, resolvePartnerMonthlyEarning } = await resolvers();

  // 1. Resolve released work details
  const { data: bcast } = await sb
    .from("marketplace_broadcasts")
    .select("id, status, service_area_id, coverage_zones(name), marketplace_offers(id, partner_id)")
    .eq("assignment_id", pAssignmentId)
    .maybeSingle();

  if (!bcast || bcast.status !== "open") {
    console.warn("[RELEASED-WORK-PUSH:CANCELLED] No open broadcast for assignment", pAssignmentId);
    return 0;
  }

  // 2. Find eligible recipients (all partners in the broadcast who aren't the canceller)
  const offers = (bcast.marketplace_offers ?? []).filter((o: any) => o.partner_id !== pCancellingPartnerId);
  const totalEligible = offers.length;
  console.log(`[RELEASED-WORK-PUSH:02] ELIGIBLE_PARTNERS count=${totalEligible} (excluded ${pCancellingPartnerId})`);

  if (totalEligible === 0) return 0;

  // 3. Resolve common work metadata (customer count, area)
  const { data: services } = await sb
    .from("services")
    .select("id, rate_per_car, subscription:subscriptions(start_date, renewal_date), customer:customer_profiles(latitude, longitude)")
    .eq("assignment_id", pAssignmentId)
    .eq("status", "pending"); // Only unstarted work is released

  const customerCount = services.length;
  const areaName = bcast.coverage_zones?.name ?? "Nearby Area";

  console.log(`[RELEASED-WORK-PUSH:03] PAYLOAD_RESOLVED customers=${customerCount} area=${areaName}`);
  console.log(`[RELEASED-WORK-PUSH:04] FANOUT_STARTED count=${totalEligible}`);

  let sentCount = 0;
  const fanout = offers.map(async (o: any) => {
    try {
      // 4. Resolve partner-specific monthly earning (sum of all released services)
      const monthlyRes = await Promise.all(services.map((s: any) => 
        resolvePartnerMonthlyEarning({
          sb,
          partnerId: o.partner_id,
          incentive: Number(s.rate_per_car || 17),
          startDate: s.subscription?.start_date,
          renewalDate: s.subscription?.renewal_date
        })
      ));
      const totalMonthly = monthlyRes.reduce((sum: number, m: any) => sum + m.monthlyAmount, 0);
      const monthlyDisplay = `+₹${totalMonthly}/month`;

      // 5. Resolve partner-specific distance (from first customer as representative)
      const firstCust = services[0]?.customer;
      const distance = await resolvePartnerBookingDistance({
        sb,
        partnerId: o.partner_id,
        customerLat: firstCust?.latitude ?? null,
        customerLng: firstCust?.longitude ?? null,
      });

      const title = `🚗 ${customerCount} Customers Available`;
      const body = `Earn up to ${monthlyDisplay} · ${distance.display}`;

      const dataPayload: Record<string, string> = {
        type: "assignment_released",
        broadcast_id: String(bcast.id),
        assignment_id: String(pAssignmentId),
        customer_count: String(customerCount),
        monthly_earnings: monthlyDisplay,
        area: areaName,
        distance_km: distance.km ? String(distance.km) : "",
        title,
        body,
        action_token: String(o.id),
      };

      const result = await sendOfferPush({
        userId: o.partner_id,
        title,
        body,
        data: dataPayload,
        channelId: "assignments_v4",
        dataOnly: true, // Native Kotlin heads-up path
        tag: `release:${bcast.id}`
      });

      if (result.sent > 0) {
        console.log(`[RELEASED-WORK-PUSH:05] FCM_SENT partner=${o.partner_id} message_id=${result.results[0]?.messageId}`);
        sentCount++;
      }
    } catch (e) {
      console.warn(`[RELEASED-WORK-PUSH:ERROR] Failed to send to partner ${o.partner_id}`, e);
    }
  });

  await Promise.all(fanout);
  console.log(`[RELEASED-WORK-PUSH:06] MARKETPLACE_VISIBLE dispatched=${sentCount}`);
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
