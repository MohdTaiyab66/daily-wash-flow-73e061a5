# Authentication & Startup Audit Plan

## 1. Authentication Debugging & Fixes (P0)
- **Root Cause Investigation**: Add comprehensive logging in `src/routes/c/auth.tsx` to trace the entire lifecycle: `sendOtp` -> `verifyOtp` -> `signInWithPassword` -> `getUser` -> `CustomerProfile` -> `goAfterAuth`.
- **OTP Verification Logic**: 
  - Fix the hardcoded "1234" check (if intended for production/SMS). 
  - If using Supabase OTP, switch to `signInWithOtp`. If using shadow credentials, ensure the backend triggers real SMS.
  - Fix the empty red error area by implementing a robust error parser that maps technical errors to user-friendly messages.
- **Race Condition Prevention**: Ensure `verifyingRef` correctly blocks all concurrent attempts and that the "Verify" button shows a loading state.
- **UX Improvements**: Mask the phone number in the OTP screen (e.g., `+91 ••••••7987`).

## 2. Startup Performance Optimization (P0)
- **Parallelize Auth/Profile/Vehicle Fetching**: 
  - Current state: `_authed` route gate blocks on `getUser()`. 
  - Optimization: Use a `loader` in `_authed` route to fire off `getUser`, `profile`, and `vehicles` in parallel using `Promise.all` or TanStack Query prefetching.
- **Home Page Hero/Carousel**: 
  - Ensure the carousel image is preloaded (`fetchpriority="high"`).
  - Confirm `UWHeader` and `PromoCarousel` layout stability to prevent the "carousel hiding behind header" bug.
- **Lazy Loading**: Ensure non-critical data (service history, catalog) is fetched via `useQuery` within components, not blocking the initial route mount.

## 3. UI/UX Refinement (P1)
- **OTP Screen Cleanup**: Simplify the visual hierarchy (Logo -> Lucknow -> Verification -> Boxes -> Button -> Resend).
- **Session Restoration**: Verify `onAuthStateChange` correctly handles background session refresh and prevents unnecessary login prompts.

## Technical Details
- Files to modify: `src/routes/c/auth.tsx`, `src/routes/c/_authed/route.tsx`, `src/components/customer/ui/OtpInput.tsx`, `src/routes/c/_authed/home.tsx`.
- Tools: Adding `console.group('[AUTH]')` for diagnostic traces.
