# Plan - Fix Service Detail Auth Coupling

Investigated the issue where tapping a service card caused a hang and subsequent "Verification FAILED" on the OTP screen. Identified that the likely root cause is a race condition or a failing session check in `service.$slug.tsx` (specifically `supabase.auth.getUser()`) which might be incorrectly triggering an unauthenticated state in the `AuthProvider`.

## Proposed Changes

### 1. Robust Auth Gating
- Update `AuthProvider` and the `_authed` layout to include detailed logging of session transitions.
- Ensure unauthenticated redirects only happen when a session is explicitly confirmed to be missing, not just during network delays or transient query errors.

### 2. Service Detail Query Optimization
- Replace `supabase.auth.getUser()` (which triggers network requests) with `supabase.auth.getSession()` in `service.$slug.tsx` for profile fetching.
- Add explicit 8s timeouts and better error handling to all queries in the service detail page.
- Decouple service data failures from authentication state: if a service fails to load, the user stays logged in and sees a "Try Again" screen instead of being kicked to the OTP screen.

### 3. OTP Flow Resilience
- Update the OTP screen to provide clearer feedback when a timeout occurs (distinguishing it from an actual "wrong code" or "unauthenticated" state).
- Increased the internal verification timeout to 12s to better handle slow network conditions.

### 4. Diagnostic Logging
- Added `[SERVICE]`, `[AUTH]`, and `[GATE]` tags to console logs for precise tracing of the session state during navigation.

## Technical Details

- **File**: `src/routes/c/_authed/service.$slug.tsx`
  - Refactored `serviceQ`, `vehiclesQ`, `addressesQ`, `addonsQ`, and `profileQ` with enhanced logging and error states.
  - Added dedicated Loading and Error UI components that allow for retrying without affecting the user's login session.
- **File**: `src/components/customer/AuthProvider.tsx`
  - Added logging to `onAuthStateChange` to capture exactly when and why `unauthenticated` status is emitted.
- **File**: `src/routes/c/_authed/route.tsx`
  - Added logs to the navigation gate.
- **File**: `src/routes/c/auth.tsx`
  - Refined the OTP verification catch block to provide more context for "Verification timed out" errors.
