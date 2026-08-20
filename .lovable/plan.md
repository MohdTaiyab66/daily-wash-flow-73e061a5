# Plan - Customer Push & Partner Reminder Fix

Audit and repair the E2E push notification pipeline for customers and implement a server-side reminder system for unaccepted partner assignments.

## User Review Required

> [!IMPORTANT]
> - Ensure `CUSTOMER_FIREBASE_PROJECT_ID`, `CUSTOMER_FIREBASE_CLIENT_EMAIL`, and `CUSTOMER_FIREBASE_PRIVATE_KEY` are correctly set in the backend environment.
> - The reminder system will run every 5 minutes via a new cron endpoint.

## Proposed Changes

### Push Notification Logic

#### [FCM Routing & Logging]
- Update `src/lib/push/send.server.ts` to include granular logging for the actual FCM response body when a push fails.
- Verify `CUSTOMER_ALLOWED_TYPES` in `src/lib/push/dispatch.server.ts` includes all relevant service lifecycle events.

#### [Immediate Dispatch Fix]
- Audit `src/lib/push/immediate.functions.ts` to ensure `sendDirectCompletionPush` correctly resolves all active tokens for the customer account, regardless of the vehicle context.

### Partner Assignment Reminders

#### [Backend Logic]
- Create `src/lib/push/reminders.server.ts` to handle logic for finding unaccepted assignments and sending reminder pushes.
- Implement a 15-minute interval check (initial + subsequent reminders every 15m if still pending).

#### [Cron Endpoint]
- Create `src/routes/api/public/cron/assignment-reminders.ts` to trigger the reminder logic.

### UI Improvements

#### [Partner App Service Start]
- Ensure `src/routes/_authenticated/app.live.tsx` navigates immediately on START button click to prevent intermediate "IN PROGRESS" state.

## Technical Details

### Database / Backend
- **push_tokens table**: Already has an `app` column (customer/partner) which is used for project routing.
- **FCM Responses**: Logging will now capture the specific error string from Google (e.g., `UNREGISTERED`, `SENDER_ID_MISMATCH`) to distinguish between dead tokens and config errors.

### Notification Flow
1. Event (e.g., `service_completed`) -> Trigger `sendDirectCompletionPush`.
2. Lookup `customer_id` via `vehicle_id`.
3. Fetch ALL `push_tokens` where `user_id = customer_id` and `invalid_at IS NULL`.
4. `sendOne` uses token's `app` column to select correct Firebase credentials.
5. Capture and log FCM response.
