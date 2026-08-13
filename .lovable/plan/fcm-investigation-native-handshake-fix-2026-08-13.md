# FCM Investigation & Native Handshake Fix

The Firebase project merge (Customer + Partner into `uw-partner-app`) may have invalidated tokens or configuration. We will perform a full forensic audit and fix the native handshake.

## User Review Required

> [!IMPORTANT]
> This plan modifies native Android files. A new APK build and installation on the physical device are required to verify these changes.

- **Firebase Config**: Both `com.urbanwash.customer` and `com.urbanwash.partner` are confirmed to be in `uw-partner-app`.
- **google-services.json**: Confirmed it contains both client entries correctly.

## Proposed Changes

### 1. Enhanced Native Handshake (Android)
- Update `UrbanwashNativeDiagnosticsPlugin.java` to return more detailed failure reasons (e.g., `PLUGIN_NOT_REGISTERED`).
- Update `UrbanwashMessagingService.kt` to include explicit `[CUSTOMER-PUSH-NATIVE:BUILD]` markers with the build ID `FCM-P0-FIREBASE-MERGE-05`.
- Add native logging for `FirebaseMessaging.getInstance().token` to compare against backend.

### 2. Frontend Diagnostic Overhaul
- Update `PushDiagnosticsPanel.tsx` to:
    - Show real failure reasons for `UNAVAILABLE`.
    - Compare native-reported token suffix with backend-reported token suffix.
    - Display `BUILD: FCM-P0-FIREBASE-MERGE-05`.
- Update `fcm.ts` to force fresh token registration on every startup to clear stale tokens from the old Firebase project.

### 3. Backend Verification
- Update `getPushDiagnostics` server function to report the exact Firebase project ID being used by the server.
- Ensure `sendDirectTestPush` continues using `dataOnly: true` for deterministic native service testing.

## Technical Details

### Android Native
- `UrbanwashMessagingService.kt`: Add `[CUSTOMER-PUSH-NATIVE:TOKEN]` logging with the token suffix.
- `UrbanwashNativeDiagnosticsPlugin.java`: Add logic to detect if the bridge is failing or if the service hasn't received anything yet.

### Frontend
- `src/lib/push/fcm.ts`: Remove `started` check if `userId` is present but token registration hasn't succeeded in the current session.
- `src/components/customer/PushDiagnosticsPanel.tsx`: Add a "Token Match" status indicator.

### Build Marker
- **BUILD: FCM-P0-FIREBASE-MERGE-05**
