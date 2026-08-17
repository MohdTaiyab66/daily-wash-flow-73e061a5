# Plan: Fix Partner Home Page Active Assignment State

Resolve the bug where the Partner Home page incorrectly displays ₹0 earnings and a "Waiting for Leads" state when an active assignment already exists with defined targets.

## User Review Required
> [!IMPORTANT]
> This plan ensures that partners with active assignments see their committed targets and earnings, even if no customers have been assigned to them yet today.

## Technical Details

### 1. Data Source Refactor
- Update `src/hooks/use-today-assignment.ts` to ensure it always returns full assignment metadata (target cars, rates, working days) regardless of current `services` availability.
- Ensure `assignmentTotalCustomers` reflects `assignment.target_cars` as the primary target, while tracking actual assigned vehicles separately.

### 2. UI State Logic in `app.index.tsx`
- Refactor `getExplicitStatus` to strictly follow the state model:
    - **NO ASSIGNMENT**: No record in `assignments` table.
    - **ACTIVE — WAITING FOR CUSTOMERS**: Status is `active` but `today` services count is 0.
    - **ACTIVE — CUSTOMERS AVAILABLE**: Status is `active` and `today` services count > 0.
- Update earning calculations:
    - `expectedEarningsToday`: Use `assignment.target_cars * assignment.rate_per_car`.
    - `expectedEarningsMonthly`: Use `expectedEarningsToday * 26` (or actual `working_days` if available).
    - Keep `earnedSoFar` as the actual progress today.

### 3. Hero Card Redesign
- Redesign the black summary card to show:
    - Committed daily and monthly/assignment earnings.
    - Service days and duration.
    - Status-specific messaging (e.g., "Waiting for customers" vs "XX customers today").
    - Action button linking to "VIEW ROUTE" (`/app/live`).

### 4. Real-time Sync
- Ensure the `today-assignment` query correctly invalidates when an assignment is created or updated, ensuring immediate Home page updates.
