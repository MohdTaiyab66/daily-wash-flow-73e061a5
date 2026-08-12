# Plan: End-to-End Authentication and Data Lifecycle Fix

Restore the Urban Wash customer app to a stable production architecture by unifying authentication state, removing diagnostic workarounds, and ensuring a robust data loading pipeline.

## User Review Required

> [!IMPORTANT]
> This plan removes all "demo" and "diagnostic" UI elements (test buttons, build labels, hardcoded fallback data) to restore a production-ready application. OTP will remain 6 digits, but the "123456" shortcut will be removed for security in production environments.

## Proposed Changes

### 1. Authentication Architecture Unification
- Enforce the **Canonical Singleton Client** in `src/integrations/supabase/client.ts`.
- Standardize `AuthProvider.tsx` as the **Single Source of Truth** for auth state.
- Refactor `src/lib/customer-auth-session.ts` to use only the canonical client.

### 2. OTP Verification Overhaul
- Update `src/routes/c/auth.tsx` to:
    - Remove `SHOW_DEMO_OTP` and "123456" shortcut (if requested, otherwise keep for sandbox but ensure production readiness).
    - Ensure `verifyOtp` confirms session persistence via `getSession()` before navigating.
    - Synchronize state with `AuthProvider` before entering protected routes.

### 3. Protected Route & Data Decoupling
- Simplify `src/routes/c/_authed/route.tsx` to depend strictly on `AuthProvider` status.
- Refactor `src/routes/c/_authed/home.tsx`:
    - Remove `fetchWithTimeout` wrappers that mask underlying issues.
    - Remove hardcoded fallback service data.
    - Implement independent loading/error states for each data section (Carousel, Services, Vehicles) so one failure doesn't block the shell or cause logouts.

### 4. Cleanup & Professionalization
- Remove obsolete diagnostic logs, labels, and "TEST AUTH" / "RETRY ALL" buttons.
- Ensure `src/components/customer/ui/UWFeaturedCarousel.tsx` handles empty/error states gracefully without diagnostic text.
- Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are correctly configured.

## Technical Details

### Auth Flow State Machine
```text
[Splash] -> sessionManager.getSession() -> if session -> [/c/home] else -> [/c/auth]
[Auth] -> verifyOtp() -> if success -> sessionManager.getSession() -> synchronize AuthProvider -> [/c/home]
[Gate] -> useAuth() -> if 'initializing' -> [Splash UI] -> if 'unauthenticated' -> [/c/auth]
```

### Data Pipeline
- `profileQ`: `maybeSingle()` + error handling (return null).
- `servicesQ`: Direct query, no hardcoded fallbacks, `isError` UI with Retry.
- `vehiclesQ`: Direct query, independent state.

## Verification Plan

### Automated Tests
- Run Playwright E2E script: `Splash -> Login -> OTP (6 digits) -> Home -> Service Detail -> Kill/Restore Session`.
- Verify singleton client persistence: `window.__SUPABASE_CLIENT_ID` must remain consistent.

### Manual Verification
- Check Home screen for "production look" (no debug buttons/labels).
- Confirm failed service requests show "Unable to load services" instead of redirecting to login.
- Confirm Android build uses correct environment variables.
