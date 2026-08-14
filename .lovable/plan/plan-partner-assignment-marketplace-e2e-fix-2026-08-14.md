# Plan - Partner Assignment & Marketplace E2E Fix

Fix the partner assignment lifecycle: cancellation availability, marketplace broadcast reliability (30s retries), partner decline/retry rules (5m cooldown), and atomic released-assignment transfers with dynamic earnings recalculation.

## User Review Required

> [!IMPORTANT]
> - **Cancellation Policy**: Partners can cancel unstarted assignments. If cancelled, all customers in that assignment are released back to the marketplace as a single batch.
> - **Rebroadcast Timing**: 30-second ticks for unaccepted bookings; 5-minute cooldown for partners who explicitly decline.
> - **Earnings Formula**: `daily_earning * customer_count * 26` (Monthly).

## Proposed Changes

### 1. Database & Security
- **Atomic Acceptance**: Implement `mark_booking_accepted` RPC (if missing/incomplete) to ensure one-winner-only for released batches.
- **Decline Logic**: Update `mp_decline_offer` to set a `next_retry_at` timestamp (now + 5m) for the partner.
- **Broadcast Eligibility**: Update `mp_reconcile_all_partners_for_broadcast` to exclude partners who declined within the last 5 minutes.
- **Cancellation**: Update `cancel_assignment` to status-gate by `started_at` and trigger `assignment_released` logic.

### 2. Marketplace & Push Logic
- **Fan-out**: Ensure `dispatchBookingPushes` in `dispatch.server.ts` uses parallel FCM sends.
- **Marketplace Loop**: Update `marketplace-rebroadcast-tick.ts` to recalculate eligibility every 30s, including newly online partners.
- **Assignment Release**: Implement `flushReleasedWorkPush` to immediately notify partners when an assignment is cancelled.
- **Earnings Resolution**: Update `resolvePartnerMonthlyEarning` to use the dynamic `* 26` formula based on active assignment settings.

### 3. Partner App UI
- **Active Assignment**: In `app.index.tsx` (Home) and `app.my-assignment.tsx`, add a clearly visible **Cancel Assignment** button for unstarted routes.
- **Confirmation**: Implement a premium confirmation sheet explaining the release of all customers in the batch.
- **Recovery**: Ensure `getPartnerOpenOffers` remains the source of truth for "Available Work" counts on the Home screen.

## Technical Details

- **Structured Logs**:
    - `[BOOKING-PUSH:01-09]` for booking lifecycle.
    - `[ASSIGNMENT-RELEASE:01-08]` for batch release/transfer.
- **Atomic Transfer**: The `accept_marketplace_offer` server function will call an RPC that moves all `services` in a released assignment to the new partner and updates the `assignment` record atomically.
- **No Duplicates**: Broadcast attempts update a `last_attempt_at` counter on a single `marketplace_broadcasts` row rather than creating new rows.
