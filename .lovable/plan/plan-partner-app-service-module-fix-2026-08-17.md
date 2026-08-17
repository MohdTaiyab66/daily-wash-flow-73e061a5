# Plan - Partner App Service Module Fix

Fix the E2E service lifecycle in the Partner App to ensure data consistency across all screens (Home, Live Route, Map, Earnings).

## User Review Required

> [!IMPORTANT]
> - This overhaul strictly enforces that "Assigned" customers do not count as "Completed" until a partner actually finishes the service.
> - "Daily Potential" (₹306) will be clearly separated from "Actual Earned" (₹0 at start of day).
> - Navigation and service start will be streamlined to a single-tap process.

## Proposed Changes

### 1. Database & RPC Audit (Internal)
- Verify `partner_complete_service` and `list_partner_booking_requests` logic.
- Ensure `status` transitions are atomic.

### 2. Canonical Hook Refactor (`src/hooks/use-today-assignment.ts`)
- **Fix Progress Logic**: Standardize `completedToday` to strictly count `status = 'completed'` for the current date.
- **Separate Earnings**: Introduce `actualEarnedToday` (based on completions) vs `potentialDailyEarnings` (based on assignments).
- **Unique Vehicle Guard**: Ensure `assignmentTotalCustomers` accurately reflects unique vehicles attached to the assignment.
- **Monday Logic**: Explicitly handle Mondays to show "OFF" rather than 100% completion.

### 3. Home Page Sync (`src/routes/_authenticated/app.index.tsx`)
- Read ALL metrics from `useTodayAssignment`.
- Remove local `filter/reduce` calculations that drift from the hook.
- Update Hero Card to distinguish "Daily Earning" (Potential) from "Today's Earned" (Actual).

### 4. Live Route & Map Polish (`src/routes/_authenticated/app.live.tsx`)
- **Progress Card**: Use hook-derived `completedToday` and `actualEarnedToday`.
- **Route Logic**: Ensure `visibleServices` accurately reflects today's stops only.
- **Start Service**: Ensure `started_at` is only set for the specific customer being started.
- **Map Interaction**: Ensure markers and cards correctly identify customers via `id`/`route_stop_id`, not array index.

### 5. Service Completion Flow (`src/routes/_authenticated/app.service.$id.tsx`)
- Ensure completion invalidates the `today-assignment` query key immediately.
- Prevent duplicate completions via idempotent logic.

### 6. Earnings & End-of-Day (`src/routes/_authenticated/app.earnings.tsx`, `src/components/EndOfDayCard.tsx`)
- Standardize on the same completion metrics.
- Fix the "0/0" bug by ensuring they use the canonical hook data.

## Technical Details

- **Query Invalidation**: Add broad invalidation on all service mutations to ensure UI reactivity.
- **Idempotency**: Use database-level `status` checks to prevent double-counting.
- **State Preservation**: Ensure `in_progress` state persists correctly across app restarts by relying on `started_at` in the DB.

## Verification Plan

### Automated Tests
- Run Playwright E2E: Create Assignment -> Check Home (0/18) -> Start Service (1/18 In Progress) -> Complete Service (1/18 Done) -> Check Earnings (₹17).

### Manual Verification
- Verify "Monday Off" state doesn't show 18/18 completed.
- Verify "START ASSIGNMENT" button doesn't reappear once active.
- Verify Map markers open the correct customer detail sheet.
