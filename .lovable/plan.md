# Plan: P0 — RESTORE LOST PARTNER ASSIGNMENT + FIX STATE INCONSISTENCY

Fix the state inconsistency where a partner has an active assignment in the database (verified by the Assignment Builder/Summary) but the Home, Route, and Earnings screens report "No active assignment".

## User Review Required
> [!IMPORTANT]
> This fix synchronizes the visual state across all partner screens by ensuring they all consume the same authoritative database record. No data will be deleted.

- **Current State**: `assignments` table has active rows, but `useTodayAssignment` or specific screen queries are likely filtering them out due to strict date or status checks.
- **Goal**: Unified visibility of the active assignment across all operational screens.

## Proposed Changes

### Database & Logic Audit
- Trace `resolve_partner_id` to ensure it returns the correct canonical ID for the logged-in user.
- Audit `get_partner_work` RPC to see if it excludes active assignments that don't have services for "today".

### Hooks
#### `src/hooks/use-today-assignment.ts`
- Ensure it fetches the active assignment record even if no services are assigned for today.
- Use `maybeSingle()` instead of `single()` to prevent crashes.
- Derive metrics like `assignmentTotalCustomers` from the assignment record directly if the service join is empty.

### Components / Routes
#### `src/routes/_authenticated/app.index.tsx` (Home)
- Update the "Hero Summary Card" to prioritize the active assignment record found by `useTodayAssignment`.
- Fix the logic that shows "Build Your Plan" to only trigger when *truly* no active assignment exists in the database.

#### `src/routes/_authenticated/app.assignments.tsx`
- Ensure the "You already have an active assignment" guard matches the criteria used by the Home page.

## Technical Details
- **Failing Table**: `public.assignments` (exists but hidden).
- **Identity Resolver**: `public.resolve_partner_id(u_id uuid)`.
- **Date Check**: Ensure `Asia/Kolkata` (IST) date boundaries are used for all active-status checks.

## Verification Plan
1. **Database Proof**: Verify active assignment `d505f9fa-...` (Vikram) and `6fe8ee94-...` (Taiyab) exist.
2. **Home Check**: Log in as Taiyab (9696987987) and verify Home shows "ACTIVE ASSIGNMENT" instead of "Build Your Plan".
3. **Route Check**: Verify Daily Route is accessible for active assignments.
4. **Summary Check**: Verify Assignment Summary displays 24 customers / ₹10,200 (or respective targets).
