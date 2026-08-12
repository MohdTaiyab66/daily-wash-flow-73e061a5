# Urban Wash Customer App Architectural Restoration Plan

Establish a stable, production-grade architecture by consolidating authentication state, unifying Supabase client usage, and decoupling data failures from auth state.

## User Review Required

> [!IMPORTANT]
> This plan implements a "Forensic Audit & Fix" as requested. It removes multiple redundant auth layers and replaces them with a single source of truth.

- **One Client**: Every screen will use the same Supabase client instance.
- **Stable Auth**: Tapping a service or a network timeout will *never* log you out.
- **Clean Startup**: The splash screen will resolve auth and route only once.

## Technical Details

### 1. Supabase Client Unification
- Audit all `import { createClient } from '@supabase/supabase-js'` and replace with `import { supabase } from '@/integrations/supabase/client'`.
- Ensure `src/integrations/supabase/client.ts` remains the single point of initialization.
- Log client ID in dev mode to verify singleton status.

### 2. Auth State Consolidation
- **AuthProvider**: Refine `src/components/customer/AuthProvider.tsx` to handle session restoration and `onAuthStateChange` correctly.
- **Session Manager**: Deprecate `src/lib/customer-auth-session.ts` if redundant, or wrap it to use the canonical client.
- **Route Gate**: Update `src/routes/c/_authed/route.tsx` to rely strictly on `useAuth()`.

### 3. Decoupling Auth from Data
- Remove `redirect` or `navigate` calls from `useQuery` error handlers or component logic in Home and Service Detail.
- Standardize Error UI for data failures (e.g., "Unable to load services. Try Again") while remaining on the same page.
- Fix `service.$slug.tsx` to stop checking `getUser()` (network-intensive) and use `getSession()` or `AuthProvider` state.

### 4. OTP and Session Flow
- Standardize `verifyOtp` in `src/routes/c/auth.tsx` to ensure `getSession()` is checked immediately after login to confirm persistence.
- Remove redundant "Verifying Access" diagnostics from the route gate.

### 5. Cleanup
- Remove obsolete diagnostics, build labels, and test buttons as requested.
- Remove `beforeLoad` redirects that use private/separate Supabase client instances.

## Audit Summary (Pre-Fix)
- **Root Cause**: Conflicting auth states between `AuthProvider` (listener-based) and individual `getSession` calls in route gates/loaders using different client wrappers or timings.
- **Why it happened**: Incremental fixes for timeouts and hydration errors introduced redundant checks that competed for control.
- **Reproduction Fix**: The "Service Click -> OTP" bug is caused by `getUser()` calling the network, failing/timing out, and a component-level redirect responding to that failure as an auth failure.
