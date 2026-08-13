# Forensic Pricing Trace and Fix

The user reports that a Maruti Alto (Hatchback) still shows ₹1199 in the Android app, despite previous claims of a fix. This plan outlines a deep forensic investigation and a definitive fix.

## Phase 1: Forensic Investigation
We will trace the exact data flow from vehicle selection to final display.

- **STEP 1 — [DAILY-SHINE-FORENSIC] Logging**: I will inject deep logging into `home.tsx`, `service.$slug.tsx`, and `subscriptions.tsx` to capture the raw vehicle data and the inputs/outputs of the pricing resolver.
- **STEP 2 — [VEHICLE-PROPAGATION] Logging**: I will track the `vehicleId` through the navigation chain to ensure it is not being lost or defaulted.
- **STEP 3 — Source Identification**: I will identify where the ₹1199 value originates (Database package price, hardcoded fallback, or state mismatch).

## Phase 4: Implementation
Once the source is identified, I will apply a definitive fix.

- **Centralized Authority**: Enforce `resolveDailyShinePrice` as the absolute authority for Daily Shine pricing.
- **State Synchronization**: Ensure the cart and subscription display are recalculated immediately whenever the `selectedVehicleId` changes.
- **Fallback Removal**: Replace all generic `|| "sedan_suv"` or `?? 1199` fallbacks with safe, vehicle-aware defaults (Hatchback/999).
- **Cart Cleanup**: Ensure stale cart data is cleared or updated when switching vehicles.

## Phase 5: Verification
- **E2E Trace**: I will run a final E2E trace in the browser environment that explicitly switches between an Alto and a Creta, verifying the console logs and UI values at every step.
- **Final proof**: I will confirm the fix only when the logs show the Alto resolving to ₹999 across all screens.

## Technical Details
- **Affected Files**: `src/lib/pricing.ts`, `src/routes/c/_authed/home.tsx`, `src/routes/c/_authed/service.$slug.tsx`, `src/routes/c/_authed/subscriptions.tsx`, `src/lib/cart-store.ts`.
- **Precedence Rule**: Vehicle Category -> Resolver -> Display. No DB overrides for Daily Shine unless explicitly classified.
