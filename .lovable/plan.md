# Push Notification Pipeline Forensic Fix Plan

Fixing P0 production issue where push notifications are failing on real Android devices. The audit revealed a mismatch between the server-side payload and the native Kotlin receiver's requirements, and missing immediate dispatch calls for standard notifications.

## User Review Required

> [!IMPORTANT]
> This fix adjusts the native delivery contract. Ensure the latest Android APK (Build 1.0.60+) is used for testing once these changes land.

## Proposed Changes

### Push Dispatch & Payload Logic
- **Align Server Payload with Kotlin Contract**: Update `src/lib/push/dispatch.server.ts` to include `broadcast_id` and `action_token` for all partner-side heads-up types, not just Daily Shine offers. The native `UrbanwashMessagingService.kt` drops notifications if these are missing in the data-only path.
- **Add missing Partner heads-up types**: Add `marketplace_offer` and `marketplace_offer_update` to `PARTNER_ASSIGNMENT_TYPES` in `dispatch.server.ts`.
- **Align Customer heads-up types**: Add `subscription_activated` and `booking_confirmed` to `CUSTOMER_HEADSUP_TYPES` so they trigger high-importance alerts.
- **Fix Data Key Names**: Ensure `assignment_id` and `service_id` are consistently passed to Kotlin for deep-linking.

### Native Android Bridge
- **Sync Kotlin Types**: Update `UrbanwashMessagingService.kt` (via `code--exec sed` if possible, or complete rewrite) to include all `PARTNER_ASSIGNMENT_TYPES` defined in the backend.

### Infrastructure & Cleanup
- **Immediate Dispatch**: Wire `dispatchCustomerNotifications` and `dispatchPartnerNotifications` into `verifyRazorpayPayment` and `razorpay-webhook.ts` so standard notifications don't wait for the cron tick.
- **Enhanced Logging**: Add `[PUSH-FORENSIC]` logs to `send.server.ts` to capture full FCM raw responses for better debugging.

## Technical Details

### Server Payload Alignment
Kotlin's `postOffer` and `postAssignment` require:
```json
{
  "type": "daily_shine_offer",
  "broadcast_id": "...", 
  "action_token": "...",
  "offer_id": "..."
}
```
Standard notifications were missing `broadcast_id` and `action_token`, causing them to be dropped by the native service in background/killed states.

### SQL Migration
No schema changes required. RLS and tables are already correct.

## Verification Plan

### Automated Verification
- **Audit Script**: Run a mock dispatch script in the sandbox to verify the generated JSON payload matches the Kotlin expectations.
- **Log Verification**: Check server logs during simulated payment to confirm `dispatch` functions are called.

### Manual Verification (User)
1. Register a real Android device.
2. Perform a test Daily Shine booking.
3. Verify that a heads-up notification appears on the partner device immediately after payment.
4. Verify deep-linking works by tapping the notification.
