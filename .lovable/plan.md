# Plan: P0 Marketplace Fan-out & All-Partner Eligibility Fix

Restore true area-wide fan-out for marketplace broadcasts. Ensure every eligible partner (new, old, logged out, or just logged in) receives and can recover open bookings if they cover the customer's area.

## User Review Required

> [!IMPORTANT]
> The fix transitions from a "recipient list at creation" model to a "dynamic eligibility per tick" model. Idempotency is handled by the `broadcast_id + partner_id` unique constraint on `marketplace_offers`.

- **Database Changes**: Update `mp_reconcile_all_partners_for_broadcast` and `get_partner_open_offers` to ensure no stale filters exclude eligible partners.
- **Push Pipeline**: Enhance `dispatchBookingPushes` with forensic logging and strictly parallel fan-out.
- **Partner Home**: Verify missed-work recovery on login/mount.

## Technical Details

### 1. Database (Supabase)
- **`mp_reconcile_all_partners_for_broadcast`**: 
    - Ensure it recalculates eligibility for ALL partners in the area on every 30s tick.
    - Validate `partner_profiles.home_zone_id` matches `marketplace_broadcasts.service_area_id`.
    - Ensure it handles `ON CONFLICT (broadcast_id, partner_id, round) DO NOTHING` correctly to avoid duplicates while allowing new partners to join the broadcast mid-flight.
- **`get_partner_open_offers`**:
    - Ensure it doesn't filter by `account_age`, `last_login`, or previous notification status.
    - Authoritative source for Partner Home and Available Work recovery.

### 2. Backend Logic (Server Functions)
- **`src/lib/push/dispatch.server.ts`**:
    - Implement the 12 requested forensic markers `[BOOKING-PUSH:AREA:01-12]`.
    - Log partner_id, partner_area, and customer_area for every recipient.
    - Ensure `dispatchBookingPushes` uses `Promise.all` for true parallel fan-out.
- **`src/lib/push/dispatch-trigger.functions.ts`**:
    - Ensure it triggers reconciliation *before* fetching offers to send.

### 3. Forensic Logging & Verification
- Verify `pg_cron` or the external scheduler is hitting `/api/public/cron/marketplace-rebroadcast-tick`.
- Use the new markers to trace the Kalyanpur example (Deepak vs Partner B).

## E2E Test Scenarios
1. **Late Login Recovery**: Partner B logs in 15 mins after booking creation; recovers offer immediately.
2. **New Partner Entry**: Create a new partner account mid-broadcast; confirm they receive the next 30s tick.
3. **Parallel Dispatch**: FCM failure for one partner must not block others.
4. **Atomic Acceptance**: Race condition test for multiple partners claiming the same batch.
