# Plan - Fix Customer App Hydration/500 Crash

The customer app is suffering from a runtime hydration/SSR crash caused by server-side attempts to access browser-only APIs (localStorage, window) or executing server functions that rely on these during the initial render. We will overhaul the architecture to be strictly client-first for the customer route tree.

## User Review Required

> [!IMPORTANT]
> This will remove all diagnostic overlays (TEST AUTH, TEST REQ, etc.) and strictly enforce a 6-digit OTP flow. The splash screen will handle the session restoration with a clean fallback.

- Are there any specific diagnostic logs you need to keep in the console? (I will remove all UI overlays).

## Proposed Changes

### 1. Remove Server-Side Context & Audit SSR
- Disable SSR for all routes in the `/c/` subtree.
- Remove `getInitialCustomerContext` calls from loaders and server-side logic.
- Ensure all Supabase auth checks happen in the browser.

### 3. Simplify Auth & Routing Architecture
- **AuthProvider**: Refactor to be a clean client-side observer of the Supabase session.
- **Auth Gate**: Move the redirect logic into the `CustomerAuthedLayout` and `beforeLoad` (client-only).
- **Home Route**: Decouple data fetching from the initial render. Each section (Hero, Vehicles, Services) will load independently with its own skeletons.

### 3. Cleanup & UI Refinement
- Remove all "TEST" buttons, diagnostic overlays, and debug labels.
- Standardize the `OtpInput` to exactly 6 digits.
- Ensure the Splash screen (`index.tsx`) is the single entry point for session resolution.

## Technical Details

### Auth Flow
1. **App Launch**: `src/routes/c/index.tsx` (Splash) mounts.
2. **Session Check**: `supabase.auth.getSession()` runs in a client-side `useEffect`.
3. **Decision**:
   - If session exists -> `navigate('/c/home')`.
   - If no session -> `navigate('/c/auth')`.
4. **Gate**: `src/routes/c/_authed/route.tsx` verifies state and blocks rendering until `authenticated`.

### Data Fetching
- `src/routes/c/_authed/home.tsx` will use `useQuery` for all data.
- `enabled: authStatus === 'authenticated'` will ensure requests only fire when safe.
- Remove `getInitialCustomerContext` server function call.

## Verification Plan

### Automated Tests
- Run `npm run build` to verify no SSR/bundling issues.

### Manual Verification
- **Test A (Fresh)**: Clear storage -> Open `/c/` -> Splash -> Login.
- **Test B (Auth)**: Enter phone -> OTP (6 digits) -> Home.
- **Test C (Session)**: Refresh Home -> Splash (brief) -> Home (no login flash).
- **Test D (Failure)**: Simulate network error -> Check for controlled error state, not 500 crash.
