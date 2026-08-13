# Plan - Real-time Notification SLA, Vehicle Unavailable Push, and Monthly Earnings

Fixing P0 production notification latency, implementing vehicle-specific unavailable notifications, and upgrading partner push to show monthly earnings.

## 1. Latency Forensic Audit and Optimization
- Add `[PUSH-LATENCY:01-08]` forensic markers with millisecond timestamps to `src/lib/push/send.server.ts` and `src/lib/push/dispatch.server.ts`.
- Identify the source of the 30-second delay (likely the 15-30s pg_cron sweep being the primary path).
- Ensure every service action (Start, Complete, Unavailable, Accept) calls `flushNotificationPush` or equivalent immediately.
- Optimize `dispatchPendingOffers` to minimize token resolution overhead.

## 2. Vehicle Unavailable Push
- Trace the Partner action for "unavailable" and "dirty" in `GuidedReport.tsx`.
- Ensure `sendDirectCompletionPush` uses the proven FCM path for these events.
- Standardize event types: `vehicle_unavailable`, `vehicle_dirty`, `service_unavailable`.
- Verify the `customer_notifications` row is created immediately in the DB by the RPC and dispatched without waiting for other events.

## 3. Monthly Earnings for Partner Push
- Create `resolvePartnerMonthlyEarning` in `src/lib/push/resolvers.server.ts`.
- Use the canonical Partner earning (e.g., ₹17/day) and multiply by actual service days in the cycle (default 26 or 30).
- Update `marketplace-push-dispatch.ts` and `dispatchPendingOffers` to use `earning_monthly` and `earning_display` ("+₹510/month").
- Update Partner heads-up notification title to lead with earnings: `🚗 New Booking • +₹510/month`.

## 4. Technical Details
- **Resolvers**: `resolvePartnerMonthlyEarning` will determine applicable days using `subscription.start_date` and `renewal_date`.
- **Latency**: Remove any `setTimeout` or artificial delays in the dispatch chain.
- **Payload**: Enrichment of FCM data with `earning_monthly`, `distance_km`, `distance_display`, `vehicle_model`, `service_name`.
- **Consistency**: Update `MarketplaceOfferCard.tsx` to use the same monthly earning display logic.

## 5. Acceptance Tests
- **Latency**: Trigger assignment -> physical notification (Target: ≤ 2–3s).
- **Fan-out**: Customer books -> Multiple eligible partners receive +₹XXX/month push.
- **Unavailable**: Partner marks unavailable -> Customer receives push immediately (≤ 2–3s).
- **Service Feed**: All service lifecycle events (start, complete, dirty) arrive within SLA.
