# Plan: FCM Native Layer Forensic Audit and Fix

Audit and fix the Android native FCM pipeline for `com.urbanwash.customer` to resolve the "UNAVAILABLE (CHECK PLUGIN)" state and verify physical notification receipt.

## User Review Required

> [!IMPORTANT]
> This plan modifies native Android code (Java/Kotlin) and the React diagnostic panel. A new APK build will be required to verify these changes on a physical device.

- **Checkpoints**: Are there any specific native log markers you want to see beyond the ones requested?
- **Android Versions**: We are targeting Android 11+ (API 30+) as per the manifest and Razorpay requirements.

## Proposed Changes

### Native Android (Java/Kotlin)

#### [NATIVE] `UrbanwashNativeDiagnosticsPlugin.java`
- Upgrade to provide exhaustive native info: `nativeToken`, `tokenTail`, `senderId`, `projectId`, `packageName`, `googleAppId`, `buildId`.
- Add defensive logging for every bridge call.

#### [NATIVE] `UrbanwashMessagingService.kt`
- Add explicit `[CUSTOMER-PUSH-NATIVE:...]` markers for `onNewToken`, `onMessageReceived`, `PAYLOAD_PARSED`, `CHANNEL_SELECTED`, `NOTIFICATION_POST_ATTEMPT`, and `SUCCESS`.
- Ensure the FCM token is persisted to both `fcm_diagnostics` and `CapacitorStorage`.
- Verify the `assignments_v4` channel has `IMPORTANCE_HIGH`.

#### [NATIVE] `MainActivity.java`
- Add `[CUSTOMER-PUSH-NATIVE:BOOT]` log to verify activity initialization.
- Ensure `UrbanwashNativeDiagnosticsPlugin` is registered before `super.onCreate`.

#### [MANIFEST] `AndroidManifest.xml`
- Audit `FirebaseMessagingService` declaration to ensure it's not conflicting with other plugins.
- Verify `POST_NOTIFICATIONS` and `USE_FULL_SCREEN_INTENT` permissions.

### Frontend (React)

#### [UI] `PushDiagnosticsPanel.tsx`
- Replace global `Plugins` access with explicit `registerPlugin` from `@capacitor/core`.
- Add "NATIVE: ... ✅ MATCH" logic with exhaustive token tail verification.
- Improve error transparency: show the exact reason (e.g., `PLUGIN_NOT_FOUND`, `BRIDGE_ERROR`) instead of a generic `UNAVAILABLE`.
- Update build marker to `FCM-P0-NATIVE-FCM-RECEIPT-05`.

#### [LIB] `fcm.ts`
- Add extra logging for the Capacitor token generation flow.
- Ensure `startFcm` logs the exact Sender ID and Project ID being used.

## Technical Details

- **Bridge**: Capacitor 3+ `registerPlugin` mechanism.
- **Handshake**: Native writes to `SharedPreferences` -> JS reads via custom plugin.
- **Verification**: `adb logcat | grep CUSTOMER-PUSH-NATIVE`.
- **Token Tail**: Comparing the last 8 characters of the native-generated token vs. the backend `push_tokens` table.

## Acceptance Criteria

1. Diagnostic panel shows `ANDROID FCM: REGISTERED` (or `WAITING` for message).
2. Native token tail matches backend token tail.
3. `onMessageReceived()` log marker appears in Logcat when a test push is sent.
4. Physical notification is received and displayed on the Android device.
