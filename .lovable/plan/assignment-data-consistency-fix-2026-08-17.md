# Assignment Data Consistency Fix

This plan establishes a single source of truth for all assignment-related data across Home, Assignment Builder, and Daily Route screens. It addresses the "30 / 18 Done" bug by ensuring progress and customer counts are derived from the canonical assignment record and current day's services only.

## User Review Required

> [!IMPORTANT]
> The fix centralizes all data resolution into `useTodayAssignment`. This hook will be the authoritative source for customer counts, earnings, and progress.

## Proposed Changes

### 1. Unified Data Source (`src/hooks/use-today-assignment.ts`)
- **Fix Customer Count Logic:** Define `assignmentTotalCustomers` as the distinct count of `vehicle_id` (or `id` as fallback) across all services linked to the assignment.
- **Fix Progress Logic:**
  - `assignmentCompleted`: Total unique vehicles ever completed for this assignment (all time).
  - `completedToday`: Only services completed *today*.
  - `remainingToday`: Today's scheduled services that are not yet done.
- **Derived Metrics:**
  - `totalExpectedDailyEarnings`: `targetCars * ratePerCar`.
  - `totalExpectedMonthlyEarnings`: `totalExpectedDailyEarnings * 26`.
- **Validation:** Add `Math.min(completed, total)` guards to prevent UI errors like "30 / 18".

### 2. Home Page Alignment (`src/routes/_authenticated/app.index.tsx`)
- Remove local `earnedSoFar`, `total`, `done`, `remaining` recalculations.
- Use `todayData.assignmentTotalCustomers` for "Total Customers".
- Use `todayData.completedToday` / `todayData.todaysCustomers` for progress display.
- Ensure "WAITING FOR CUSTOMERS" only shows if `assignmentTotalCustomers === 0`.
- Display committed earnings (`expectedDailyEarnings` / `expectedMonthlyEarnings`) consistently.

### 3. Assignment Builder Alignment (`src/routes/_authenticated/app.assignments.tsx`)
- Replace duplicate calculations for active assignments with `todayData` values.
- Ensure `totalCustomers` and progress match exactly what is shown on Home.
- Change "START ASSIGNMENT" to "VIEW DAILY ROUTE" for already active assignments to prevent double-activation.

### 4. Daily Route Alignment (`src/routes/_authenticated/app.live.tsx`)
- Synchronize `total` count with `todayData.todaysCustomers`.
- Synchronize `done` count with `todayData.completedToday`.
- Use `todayData.expectedDailyEarnings` for the "Today's Progress" card's earnings display.
- Ensure the map and list derived from `services` query match the `todayData` counts.

### 5. Technical Improvements
- **Query Cache:** Ensure `invalidateQueries(['today-assignment'])` is called after any service completion or assignment change.
- **Single Identity:** Use `partner_id + active_assignment_id` as the global filter for all derived metrics.

## Technical Details

- **Ambiguity Fix:** The "30 / 18" bug likely stems from counting every historical service record in a 30-day assignment as "done" but comparing it against a different filter's total. We will standardize `completedToday` to only count `scheduled_date = current_date`.
- **Earnings Correction:** Centralize the `26 service days` rule in the hook so Home and Assignments never disagree on the monthly projected total.

