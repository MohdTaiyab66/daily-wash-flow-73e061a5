# E2E Push Notification Forensic Audit Plan

Implement a strict, step-by-step forensic logging chain across the entire service completion push notification pipeline to identify the exact point of failure on real devices.

## User Review Required

> [!IMPORTANT]
> This plan does not "fix" the notification delivery yet; it installs the diagnostic instruments required to prove where it fails on your physical device. Once these logs are in place, a single test run will reveal the root cause.

## Proposed Changes

### 1. Partner App Instrumented Completion (Frontend)
- **File**: `src/routes/_authenticated/app.service.$id.tsx`
- **Action**: Add `[CUSTOMER-SERVICE-PUSH:E1]` and `[CUSTOMER-SERVICE-PUSH:E2]` logs to the `complete` mutation handler.
- **Verification**: If these don't appear in the console when you press "Complete", the partner app isn't successfully finishing the RPC or calling the flush trigger.

### 2. Immediate Dispatch Chain (Backend Functions)
- **File**: `src/lib/push/immediate.functions.ts`
- **Action**: Add `[CUSTOMER-SERVICE-PUSH:E4]` and `[CUSTOMER-SERVICE-PUSH:E5]` to trace the execution of the manual flush trigger.
- **File**: `src/lib/push/dispatch.server.ts`
- **Action**: Add `[CUSTOMER-SERVICE-PUSH:E3]` (Event Processing) and `[CUSTOMER-SERVICE-PUSH:E4]` (Dispatch Start) logs.
- **File**: `src/lib/push/send.server.ts`
- **Action**: Add `[CUSTOMER-SERVICE-PUSH:TOKEN]` to log exactly how many active tokens were found and their partial IDs.

### 3. FCM Response Forensic (Backend FCM)
- **File**: `src/lib/push/send.server.ts`
- **Action**: Ensure every FCM attempt (success or failure) logs the raw response status and error codes under `[PUSH-FORENSIC]`.

### 4. Native Android Receive & Render (Kotlin)
- **File**: `android/app/src/main/java/com/urbanwash/push/UrbanwashMessagingService.kt`
- **Action**: Add Logcat markers:
    - `[CUSTOMER-PUSH-NATIVE:E1]` when `onMessageReceived` fires.
    - `[CUSTOMER-PUSH-NATIVE:E2]` when the `service_completed` type is recognized.
    - `[CUSTOMER-PUSH-NATIVE:E3]` when the notification post starts.
    - `[CUSTOMER-PUSH-NATIVE:E4]` after `notify()` is called.

## Technical Details
- **Architecture**: The chain follows: Partner UI -> RPC -> `customer_notifications` (DB) -> `flushNotificationPush` (ServerFn) -> `dispatch.server.ts` -> `send.server.ts` -> FCM -> Android Kotlin Service.
- **Event Mapping**: Standardizing on `service_completed` as the canonical type across all layers.
- **Token Check**: Specifically logging `token_count` to detect if the Customer app is failing to register its FCM token during login.

## How to Verify
1. I will deploy these changes.
2. You will perform a real test: Partner completes a service for a customer booking.
3. We will inspect logs:
    - **Backend Logs**: (Visible in Lovable) check for E1-E8 and TOKEN logs.
    - **Native Logs**: (via `adb logcat -s CUSTOMER-PUSH-NATIVE`) check for E1-E4.
