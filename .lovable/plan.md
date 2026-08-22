# Plan: Universal Partner Identity Fix - Verification & Finalization

Validate and finalize the universal partner identity resolution system to ensure all partners (Real, Trial, Old, New) receive assignments, notifications, and real-time updates without identity fragmentation.

## User Review Required
> [!IMPORTANT]
> This plan focuses on ensuring the universal fixes already implemented are robustly verified and the landing page is cleaned as requested.

## Technical Details

### 1. Verification of Identity Resolution
- Verify the identity resolution logic in `src/lib/push/dispatch.server.ts` across all 4 major dispatchers:
  - `dispatchPendingOffers`
  - `dispatchPartnerNotifications`
  - `dispatchAssignmentReleased`
  - `dispatchBookingPushes`
- Ensure phone-based resolution correctly finds active tokens on duplicate profiles.
- Verify `src/lib/push/reminders.server.ts` has the same phone-based resolution.
- Verify `src/routes/api/public/cron/marketplace-push-dispatch.ts` has the same phone-based resolution.

### 2. Verification of UI Synchronization
- Confirm `useRealtimeInvalidation` is integrated into all critical partner screens:
  - Home (`src/routes/_authenticated/app.index.tsx`)
  - Live Route (`src/routes/_authenticated/app.live.tsx`)
  - History (`src/routes/_authenticated/app.history.tsx`)
  - Notifications (`src/routes/_authenticated/app.notifications.tsx`)
  - Assignments (`src/routes/_authenticated/app.assignments.tsx`)
  - Earnings (`src/routes/_authenticated/app.earnings.tsx`)
- Ensure the global notification listener in `src/routes/_authenticated/app.tsx` exhaustively invalidates all relevant queries upon receipt of any assignment-related event.

### 3. Landing Page Cleanup
- Remove the mono-spaced debug text from the footer in `src/routes/index.tsx`.
- Ensure no internal developer instructions or P0 verification text remains on any customer-facing route.

### 4. Regression Check
- Confirm that no partner-specific logic (Deepak, phone numbers) has been reintroduced.
- Verify that `is_trial` or other type-based bypasses are not active in the core lifecycle.
- Confirm database remains the source of truth for offline recovery.
