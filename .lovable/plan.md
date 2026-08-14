# Plan: Marketplace Broadcast Reliability & Re-broadcast Loop

Improve marketplace reliability by ensuring unaccepted customer bookings continue broadcasting until a partner accepts, and implementing a 30-second server-side re-broadcast sweep.

## User Review Required

> [!IMPORTANT]
> - The 30-second re-broadcast loop will be managed by a new `marketplace-rebroadcast-tick` cron job.
> - Partners who log in later will automatically receive available offers via the existing `mp_reconcile_partner_offers` mechanism, which will be integrated into the Home screen initialization.

## Proposed Changes

### Database & Backend (PostgreSQL)

- **Migration: Re-broadcast Logic & Eligibility Recovery**
    - Create/Update `mp_tick`:
        - Identify `OPEN` bookings without an active `marketplace_broadcast`.
        - Create a new broadcast if missing.
        - Trigger a sweep of eligible partners for all `OPEN` broadcasts.
    - Create/Update `sweep_subscription_offers`:
        - Recalculate eligible partners for all `OPEN` broadcasts.
        - Insert new `subscription_offers` for newly eligible partners who don't have one for that broadcast yet.
    - Ensure `respond_subscription_offer` (acceptance) is atomic:
        - When a partner accepts, mark the booking as `ACCEPTED`.
        - Close the broadcast.
        - Deactivate all other pending offers for that booking.

### Server-side Logic (TypeScript)

- **`src/lib/push/dispatch.server.ts`**
    - Add `dispatchBookingPushes`: A high-priority fan-out for `new_booking` events.
    - Implement re-broadcast logging with markers `[BOOKING-PUSH:01-09]`.
    - Recalculate eligible partners on every retry to include partners who just came online.
    - Update `dispatchAssignmentReleased` to use the 26-day monthly earning formula.

- **`src/routes/api/public/cron/marketplace-rebroadcast-tick.ts` (New)**
    - New cron endpoint to be called every 30 seconds.
    - Triggers the re-broadcast logic: `sweep_subscription_offers` followed by `dispatchBookingPushes`.

### Partner App UI

- **`src/routes/_authenticated/app.index.tsx` (Partner Home)**
    - On mount/refresh, call a server function that runs `mp_reconcile_partner_offers` to recover missed work.
    - Display "NEW WORK AVAILABLE" banner if the partner has unclaimed eligible offers.

### Forensic Tracking & Verification

- Inject logs `[BOOKING-PUSH:01]` through `[BOOKING-PUSH:09]` for observability.
- Verify through E2E tests:
    - Booking activation starts the loop.
    - Loop continues every 30s if unaccepted.
    - New partners joining the area receive the push on the next tick.
    - Acceptance immediately kills the loop for that booking.

## Technical Details

- **Atomic Acceptance**: Uses `UPDATE bookings SET partner_id = ... WHERE id = ... AND partner_id IS NULL` to ensure exactly one winner.
- **Monthly Earnings Formula**: `Daily Earning * Customer Count * 26`.
- **Infrastructure**: The re-broadcast loop depends on an external scheduler (e.g. `pg_cron` or a GitHub Action) hitting the `/api/public/cron/marketplace-rebroadcast-tick` endpoint.
