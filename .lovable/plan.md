# Plan: Fix Direct FCM Push and Implement Native Receipt Handshake

We need to prove whether FCM messages are reaching the Android native layer. Currently, "FCM Server: Accepted" only means Google received the request, not that the device received the message.

## User Review Required

> [!IMPORTANT]
> This plan implements a **Native Handshake**. The diagnostic panel will now only say "Pass" if the Android code confirms it received the exact Message ID sent by the server.

- **Direct Test Result**: UI updated to show "WAITING" until native receipt.
- **Native Logs**: Added `[CUSTOMER-PUSH-NATIVE:01]` to log Message IDs for Logcat correlation.
- **SharedPreferences Bridge**: The Kotlin service now writes receipt state that the JS panel polls via Capacitor.

## Proposed Changes

### Android Native (Kotlin)
- **`UrbanwashMessagingService.kt`**:
    - Log `[CUSTOMER-PUSH-NATIVE:01]` with exact `messageId`.
    - Persist receipt (ID, type, time) to `SharedPreferences` named `fcm_diagnostics`.
    - Persist post-success state (notif ID, time) after `NotificationManager.notify()`.

### Customer App (Frontend)
- **`PushDiagnosticsPanel.tsx`**:
    - Implement polling (2s) of `Preferences` (Capacitor wrapper for SharedPreferences).
    - Compare `nativeState.fcm.id` with `lastTestResult.messageId`.
    - Show `BUILD: FCM-P0-ANDROID-RECEIPT-01` for APK verification.
    - Display "FINAL STATUS: PASS" only when native receipt matches server ID.

### Infrastructure & Config
- **`google-services.json`**: Verified project is `uw-partner-app`.
- **`diagnostics.functions.ts`**: Standardized test payload to match native receiver expectations.

## Verification Plan

1. **Build APK** with version `FCM-P0-ANDROID-RECEIPT-01`.
2. **Foreground Test**: Open app -> Click "Send Direct Test Push".
    - Observe `FCM SERVER: ✅ ACCEPTED`.
    - Observe `ANDROID FCM: ⏳ WAITING` -> `✅ RECEIVED` (Target: < 5s).
    - Verify `SERVER MSG ID` matches `NATIVE MSG ID` in panel.
3. **Logcat Audit**: `adb logcat | grep CUSTOMER-PUSH-NATIVE`.
    - If `01 MESSAGE_RECEIVED` appears but UI stays `WAITING`, the bridge is broken.
    - If `01 MESSAGE_RECEIVED` never appears, the message never reached the phone.
