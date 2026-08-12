# Plan: Fix Customer App Startup and Authentication

## Phase 1: Fix Startup Performance & Splash Screen (Priority 1)
- **Problem:** App stays too long on splash screen; waits for sequential auth/data calls.
- **Fix:** 
    - Implement a 3-second timeout for the initial session check in `CustomerSplash` (`src/routes/c/index.tsx`).
    - Fall back to login if the timeout triggers or if session retrieval fails.
    - Reduce the minimum splash duration to 300ms for a snappier feel.

## Phase 2: Fix Authentication Flow & OTP (Priority 2)
- **Problem:** OTP verification fails with "Could not sign in" despite correct code; UI is limited to 4 boxes.
- **Fix:**
    - **OTP Length:** Update `OTP_LENGTH` to 6 digits to match industry standards and Supabase defaults, and update the `OtpInput` to handle 6 digits.
    - **Normalization:** Normalize phone numbers (strip +91, whitespace) to ensure consistency between OTP request and sign-in.
    - **Debugging:** Add detailed `authLog` entries for every state transition in `auth.tsx` to identify the exact failure layer (Case A-J).
    - **Safety:** Ensure the Verify button is strictly disabled and shows "Verifying..." to prevent double-taps.

## Phase 3: Optimize Data Loading & Session Persistence (Priority 3)
- **Problem:** App waterfalls through profile/vehicle data before showing the UI.
- **Fix:**
    - Refactor `src/routes/c/_authed/route.tsx` to ensure the loader only blocks on critical auth state, letting profile and vehicle data load progressively.
    - Add a session persistence check immediately after login and on app restart.

## Phase 4: Fix Carousel & Layout Architecture (Priority 4)
- **Problem:** Carousel flashes old images or overlaps with the header.
- **Fix:**
    - Reserve carousel height using `aspect-ratio` to eliminate layout shift.
    - Enforce correct document flow for `UWHeader` (sticky) to prevent it from covering content.

## User-Facing Changes
- Faster app launch.
- Improved login reliability with better error messages.
- 6-digit OTP support for better security and compatibility.
- Consistent header and carousel positioning.
