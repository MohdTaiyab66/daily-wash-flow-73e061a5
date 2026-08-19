# Plan: Urban Wash Partner App Cleanup - Service Condition & Earnings

Refactor the Partner Service Module and Earnings logic to ensure visual consistency, outcome-aware calculations, and accurate data across all screens.

## User Review Required

> [!IMPORTANT]
> The earning rates for "Unavailable Vehicle" and "Need Wash" are currently hardcoded at ₹12 in the app's history/earnings views, while the standard "Ready to Clean" rate is ₹17 (or as per assignment). I will maintain this ₹12 vs ₹17 distinction unless a different authoritative rate is found in the database.

## Proposed Changes

### 1. Service Condition UI Overhaul
- **Rename Labels**: Change "Very Dirty" to "NEED WASH" everywhere in the Partner UI.
- **Enforce Order**: Fix the order of condition cards to:
    1. READY TO CLEAN
    2. UNAVAILABLE VEHICLE
    3. NEED WASH
- **Visual Polish**:
    - Update selected state with orange borders, soft orange backgrounds, and "✓ SELECTED" labels.
    - Conditionally show photo sections: "Before Photo" for Ready, "Evidence Photo" for Unavailable, and "4-Angle Grid" for Need Wash.
    - Dynamic CTA: "COMPLETE SERVICE", "MARK UNAVAILABLE", or "REPORT NEED WASH" (aligned with backend logic).
- **Error Handling**: Replace technical codes like `P04PHOTO` with human-readable guidance (e.g., "Please add 4 photos to report a dirty vehicle").

### 2. Authoritative Earnings & Progress Logic
- **Outcome-Aware Calculations**: Update `useTodayAssignment` hook to include `unavailable` and `need_wash` in "Today's Earned" using the configured rates (₹12 fallback for exceptions).
- **Unified Formulas**: Synchronize calculations across:
    - **Home**: Show sum of earnings from all resolved outcomes.
    - **Daily Route**: Reflect "Resolved" status (Completed/Unavailable/Need Wash) in progress bars and counts.
    - **Earnings Page**: Break down today's earnings by outcome type.
    - **Service History**: Include all three outcomes with their respective details (reasons, photos).
- **Persistence**: Ensure the 16 vs 18 customer bug remains fixed by deriving "Total Assigned" strictly from unique vehicle IDs scheduled for today.

### 3. Real-Time Consistency
- **Invalidation**: Update mutations in `app.service.$id.tsx` to invalidate all relevant query keys: `today-assignment`, `route-today`, `earnings-v3`, `service-history`, and `service-summary`.
- **UI State Recovery**: Ensure customer cards on the Daily Route reflect their final state (✓ COMPLETED, ⚠ UNAVAILABLE, ✓ NEED WASH) after resolution.

## Technical Details
- **Frontend**: Update `src/routes/_authenticated/app.service.$id.tsx` component logic and UI.
- **Hooks**: Refactor `src/hooks/use-today-assignment.ts` to return granular counts (`completedCount`, `unavailableCount`, `needWashCount`) and use them for earnings.
- **History/Earnings**: Update `src/routes/_authenticated/app.history.tsx` and `app.earnings.tsx` to fetch and display non-completed resolution states.
- **Database**: No schema changes required; internal enums (`dirty_vehicle`) will be mapped to "NEED WASH" in the UI.

## Verification Plan
- **Automated Tests**: Run Playwright scripts to simulate:
    1. Successful "Ready to Clean" flow.
    2. "Unavailable Vehicle" flow with 1 photo and reason.
    3. "Need Wash" flow with 4 photos.
- **Manual Verification**: Check all 4 key screens (Home, Route, Earnings, History) after each test to ensure counts and earnings match exactly.
