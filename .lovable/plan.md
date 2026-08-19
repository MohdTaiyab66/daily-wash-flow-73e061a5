# Plan: E2E Push Notification Forensic Fix & Project Split Support

Refactor the push notification pipeline to support separate Firebase projects for Partner and Customer apps while expanding the allowed notification types for the Customer app.

## Proposed Changes

### 1. Infrastructure: Multi-Project FCM Support
- Modify `src/lib/push/send.server.ts` to support app-specific credentials.
- Implement `getCredentials(appType: string)` that checks for `CUSTOMER_FIREBASE_PROJECT_ID`, `CUSTOMER_FIREBASE_CLIENT_EMAIL`, and `CUSTOMER_FIREBASE_PRIVATE_KEY`.
- Fall back to default `FIREBASE_*` credentials if app-specific ones are missing.
- Ensure the OAuth token cache is keyed by `projectId` to prevent cross-project token reuse.

### 2. Backend Logic: Expanded Customer Notifications
- Update `src/lib/push/dispatch.server.ts` to include more notification types in `CUSTOMER_ALLOWED_TYPES`:
    - `booking_confirmed`, `payment_success`, `payment_failed`, `entitlement_exhausted`.
    - `unavailable_report`, `dirty_vehicle_report` (mapping to `vehicle_unavailable` and `vehicle_dirty`).
- Add these types to `CUSTOMER_HEADSUP_TYPES` to ensure they use the `dataOnly: true` (High Priority) path.
- Pass the `app` type from `push_tokens` to `sendOne` to ensure the correct credentials are used for each token.

### 3. Native Android: Unified Heads-up for all types
- Update `android/app/src/main/java/com/urbanwash/push/UrbanwashMessagingService.kt` to include the new types in the `ASSIGNMENT_TYPES` set.
- This ensures all customer-facing service updates are rendered using the premium heads-up path with custom sounds and deep-links.

### 4. Forensics & Diagnostics
- Retain the newly added forensic logs in `send.server.ts` and `dispatch.server.ts` but clean up the noise (e.g., elide less useful ones).
- Verify the fix using a test notification against the existing `uw-partner-app` token to ensure zero regression.

## Technical Details
- The OAuth cache in `send.server.ts` will move from a single `cachedToken` to a `Map<string, AccessToken>`.
- `sendOfferPush` will be updated to fetch the `app` column from `push_tokens` and pass it to `sendOne`.
- Mapping logic in `dispatch.server.ts` will be consolidated to ensure consistency between DB types and Native recognized types.
