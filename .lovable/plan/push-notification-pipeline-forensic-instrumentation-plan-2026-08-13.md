# Push Notification Pipeline Forensic Instrumentation Plan

This plan instruments the entire push notification lifecycle from Partner App service completion to Customer App reception with the requested `[CUSTOMER-E2E]` and `[CUSTOMER-PUSH-NATIVE]` markers.

## Checkpoints

### 1. Partner Completion (Partner App)
Instrument `src/routes/_authenticated/app.service.$id.tsx` and `src/components/partner/service/GuidedReport.tsx`.
- `[CUSTOMER-E2E:01-COMPLETE]`: Partner taps completion.
- `[CUSTOMER-E2E:02-COMPLETE]`: Service RPC success.
- `[CUSTOMER-E2E:03-CUSTOMER]`: Resolve and log the customer ID.
- `[CUSTOMER-E2E:06-FLUSH]`: Call `flushNotificationPush()`.
- `[CUSTOMER-E2E:07-FLUSH]`: Log flush result.

### 2. Notification Dispatcher (Server)
Instrument `src/lib/push/dispatch.server.ts`.
- `[CUSTOMER-E2E:04-NOTIFICATION]`: Log the newly created notification row found by the dispatcher.
- `[CUSTOMER-E2E:05-TYPE]`: Verify type normalization.
- `[CUSTOMER-E2E:08-DISPATCH]`: Log when the row is picked up.

### 3. FCM Sender (Server)
Instrument `src/lib/push/send.server.ts`.
- `[CUSTOMER-E2E:09-TOKEN]`: Log active token count for the user.
- `[CUSTOMER-E2E:10-FCM]`: Log FCM send start.
- `[CUSTOMER-E2E:11-FCM]`: Log actual FCM API response (success/failure count).

### 4. Android Receiver (Kotlin)
Verify and refine markers in `android/app/src/main/java/com/urbanwash/push/UrbanwashMessagingService.kt`.
- `[CUSTOMER-PUSH-NATIVE:01]`: Message received.
- `[CUSTOMER-PUSH-NATIVE:02]`: Type recognized.
- `[CUSTOMER-PUSH-NATIVE:03]`: Notification posted.

## Technical Details

- Use standard `console.log` for server-side and browser-side instrumentation.
- Use `Log.d` for Kotlin instrumentation.
- Standardize all notification types on `service_completed`.
- Ensure `customer_id` is derived from the service/booking record, not fallbacks.
- Verify `pushed_at` behavior in the dispatcher to ensure retries work.

## Verification Steps
1. The user will perform a service completion in the Partner App.
2. I will inspect the logs for the chronological trace of markers.
3. If a checkpoint is missing, that identifies the failure location.
