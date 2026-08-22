# Plan: Authoritative Partner Work Source Implementation

Implement a single source of truth for all partner operational work (Home, Route, Map, Earnings) to resolve data propagation failures.

## User Review Required

> [!IMPORTANT]
> This plan will consolidate all partner data fetching into a single database function. This will replace existing fragmented queries in the Home, Route, and Earnings screens to ensure they always reflect the latest assignments.

## Proposed Changes

### Database (Lovable Cloud)

- Create a new PostgreSQL function `public.get_partner_work(p_partner_id uuid)` that returns a comprehensive set of data for a partner's assigned work for the current day.
- Output includes: customer details, vehicle info, booking/service status, location, and earning potential.

### Identity Resolution

- Ensure all operational queries use the canonical `partners.id` resolved via the `resolve_partner_id` function.

### Frontend Hooks

- Refactor `src/hooks/use-today-assignment.ts` to become the primary consumer of `get_partner_work`.
- Consolidate logic for "TOTAL CUSTOMERS", "DAILY POTENTIAL", "DONE", etc., to derive strictly from this single source.

### Partner Screens

- Update `Partner Home`, `Daily Route`, `Map`, and `Earnings` screens to consume data from the unified hook.
- Ensure realtime invalidation and the 10-second safety refresh both target this single authoritative source.

## Technical Details

- **Function**: `public.get_partner_work` will join `assignments`, `services`, `bookings`, `vehicles`, and `customers`.
- **Date Handling**: Will use `CURRENT_DATE` at the time of query, ensuring alignment with the backend's view of "today".
- **Realtime**: `src/routes/_authenticated/app.tsx` will continue to trigger invalidations on `assignments` changes.
- **Cache**: TanStack Query cache will be cleared on logout to prevent cross-account data leakage.

## Verification Plan

### Automated Tests
- None specified; focus on manual verification of the end-to-end flow.

### Manual Verification
1. Create a fresh booking and assign it to a partner (e.g., Vikram).
2. Verify that the Partner App Home updates automatically.
3. Verify that Daily Route and Map reflect the new assignment.
4. Verify that Daily Potential in Earnings reflects the new potential work.
5. Repeat for multiple partners (Deepak, Imran, Aarav) to ensure no special cases exist.
