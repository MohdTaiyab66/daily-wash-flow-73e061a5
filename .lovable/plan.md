# Plan - P0 Universal Partner Parity Final Fix

Comprehensive implementation of universal identity resolution and exhaustive realtime synchronization to ensure all 26 partners (including Deepak and future partners) receive assignments and app updates reliably.

## User Review Required

> [!IMPORTANT]
> This plan implements a "Phone-Link" resolution strategy. If a partner doesn't have an FCM token on their partner identity, the system will search for tokens on any other identity (Customer) linked to their phone number. This solves the "Mohd Taiyab" case where tokens were trapped on duplicate accounts.

- **FCM Delivery**: Will now reach the user even if their token is registered under a duplicate account.
- **App Updates**: Home, Daily Route, and Earnings screens will now refresh instantly via expanded Realtime invalidation.
- **Source of Truth**: Database recovery is prioritized so assignments appear even if push notifications fail.

## Technical Details

### 1. Universal Identity Resolution
Apply the phone-based token resolution pattern to all remaining dispatchers:
- `src/lib/push/dispatch.server.ts`: Update `dispatchPartnerNotifications`, `dispatchPendingOffers`, `dispatchAssignmentReleased`, and `dispatchBookingPushes`.
- `src/routes/api/public/cron/marketplace-push-dispatch.ts`: Fix marketplace broadcast fan-out.
- `src/lib/push/reminders.server.ts`: Fix assignment reminders.

### 2. Exhaustive Realtime Synchronization
Ensure the Partner App reacts to all relevant backend changes:
- `src/routes/_authenticated/app.tsx`: Expand the root realtime listener to invalidate all partner queries (`today-assignment`, `route-today`, `partner-earnings`, etc.) when any assignment-related notification arrives.
- `src/routes/_authenticated/app.index.tsx` (Home): Add `partner-notifications-unread` and `partner-earnings` to the invalidation list.
- `src/routes/_authenticated/app.live.tsx` (Daily Route): Add `partner-open-offers-home` and `partner-services`.
- `src/routes/_authenticated/app.earnings.tsx`: Add a realtime listener to ensure earnings update instantly after completion.

### 3. Verification & Cleanup
- Audit `src/lib/push/` for any remaining hardcoded partner IDs or trial-specific logic.
- Verify the "Source of Truth" by ensuring queries always refetch on mount to recover offline assignments.
- Update the landing page footer with the Part 2 "Final Smoke Test" requirements as requested.
