# Plan: Fix Authentication Session Persistence (Build 1.0.39)

The application is experiencing a critical failure where authentication succeeds (OTP verified) but the session is lost or not recognized immediately after. This plan implements deep instrumentation of the complete OTP-to-Session flow to identify the exact point of failure.

## User Review Required

> [!IMPORTANT]
> This build (1.0.39-auth-real-session) replaces generic "Auth: WAITING" logs with explicit `[AUTH-P0]` lifecycle traces. Please provide the logs from the browser console or Android Logcat after trying Build 39.

## Proposed Changes

### Authentication & OTP
- **Standardized Logging**: Implement `[AUTH-P0]` traces for every step: `OTP VERIFY START`, `OTP VERIFY RESPONSE`, `USER PRESENT`, `SESSION PRESENT`, `GET SESSION START/RESULT`.
- **Session Verification**: Explicitly call `supabase.auth.getSession()` immediately after `signInWithPassword` in `src/routes/c/auth.tsx`.
- **Signup Flow Security**: Ensure `signUp` is followed by a successful `signInWithPassword` and session confirmation before navigation.

### Startup & Routing
- **Splash Screen (CustomerSplash)**: Update `src/routes/c/index.tsx` to use `[AUTH-P0]` labels and a 2.5s hard timeout for session restoration.
- **Protected Shell**: Instrument `src/routes/c/_authed/route.tsx` to log auth events and handle session loss without aggressive `queryClient.clear()` (switched to `invalidateQueries`).
- **Global Auth Listener**: Update `src/routes/__root.tsx` to log global auth events and invalidate instead of clearing, preventing data race issues.

### Diagnostic Tools
- **Build Identification**: Sync versioning to `1.0.39-auth-real-session`.
- **Home Diagnostic Overlay**: Add specific trackers for `OTP VERIFY`, `POST OTP SESSION`, and `GET SESSION` to the debug panel in `src/routes/c/_authed/home.tsx`.
- **Raw Connectivity**: Maintain `testSupabaseRaw()` and `testAuth()` for manual verification.

## Technical Details

### Auth Trace Points
```text
[AUTH-P0] OTP VERIFY START -> verifyOtp() called
[AUTH-P0] OTP VERIFY RESPONSE -> signInWithPassword returned
[AUTH-P0] SESSION PRESENT -> session exists in response
[AUTH-P0] GET SESSION START -> Manual check of persistent storage
[AUTH-P0] GET SESSION RESULT -> Result of persistent storage check
[AUTH-P0] NAVIGATING HOME -> Navigation triggered
```

### Files to Modify
- `src/lib/buildInfo.ts` (Sync version)
- `src/routes/c/auth.tsx` (OTP flow & logs)
- `src/routes/c/index.tsx` (Startup logs)
- `src/routes/c/_authed/route.tsx` (Shell protection & logs)
- `src/routes/c/_authed/home.tsx` (Diagnostic labels)
- `src/routes/__root.tsx` (Global auth listener)
- `src/lib/auth-debug.ts` (Clean logging utility)
