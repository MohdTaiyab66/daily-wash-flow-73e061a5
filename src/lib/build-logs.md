# Auth Session Fix - Build 1.0.38

## Diagnostics
- **Auth Build ID**: 1.0.38-auth-session-fix
- **Diagnostic Panel**: Enhanced with real-time Auth, Session, and User presence checks.
- **Trace Logs**: Instrumented with `[AUTH][OTP]`, `[AUTH][POST-OTP]`, `[AUTH][STARTUP]`, and `[AUTH][SHELL]` prefixes for tracing in Android Logcat.

## Core Changes
1. **Strict Session Verification**: Added post-OTP verification check using `supabase.auth.getSession()` to ensure persistence before navigating Home.
2. **Splash Auth Hard-Stop**: Verified `resolveAuth` in splash uses `getSession()` and correctly handles the `AUTHENTICATED` / `UNAUTHENTICATED` state machine.
3. **Shell Protection**: Instrumented `_authed/route.tsx` to log and enforce session presence in both `loader` and `beforeLoad`.
4. **Network Diagnostics**: Added "TEST AUTH" and "TEST SIGNED-IN REQ" buttons to the Home diagnostic overlay to isolate session issues from network issues.
5. **Unified Logging**: Standardized auth logging to avoid leaking sensitive data while providing full visibility into the lifecycle.

## Testing Steps (APK)
1. Open App -> Splash should show Build 38.
2. Login with 123456 -> Logs should show `[AUTH][POST-OTP] session present = true`.
3. Home opens -> Diagnostic Panel should show `AUTH: AUTHENTICATED` and `SESSION: PRESENT`.
4. Tap `TEST AUTH` -> Should confirm session and user presence.
5. Tap `TEST SIGNED-IN REQ` -> Should confirm database access via RLS.
6. Restart App -> Splash should restore session and open Home directly.
