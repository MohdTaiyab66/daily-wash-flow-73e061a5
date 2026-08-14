# Plan: Partner Assignment Builder — Final UI + Earnings Correction

Final UI and calculation correction for the Partner Assignment Builder. This plan focuses on aligning the monthly earning projections with the 26-day business rule, improving the information hierarchy, and fixing the bottom navigation layout.

## User Review Required

> [!IMPORTANT]
> - Monthly earnings will now explicitly use **26 service days** (Mondays off).
> - Estimated fuel costs will be **removed** from the builder.
> - The Bottom Navigation and CTA layout will be fixed to prevent overlap and clipping.

## Proposed Changes

### 1. Calculation Adjustments
- Update `AssignmentsPage` to use a constant 26 days for monthly projections.
- Remove fuel cost logic and display from the builder.
- Update "YOUR EARNINGS" to show Today, Monthly (per customer), and Plan total based on selected customers.

### 2. Information Hierarchy
- Explicitly state "Monday is a weekly off day" near the work plan.
- Redesign "TODAY'S PLAN" to show: Working Hours, Customers (available/target), Start, and Finish.
- Simplify "YOUR EARNINGS" section with a clear white-on-black or premium card style.
- Clarify customer availability warnings (e.g., "Only 1 customer is available right now").

### 3. Layout & Navigation Fixes
- Create a dedicated `PartnerShell` or update the layout to match the Customer app's premium, compact bottom navigation.
- Fix bottom navigation labels to prevent wrapping (Home, Available, Earnings, Rewards, Profile).
- Ensure the sticky "Start" CTA sits correctly above the navigation with proper safe-area padding.
- Apply `pb-[calc(70px+env(safe-area-inset-bottom))]` (or similar) to the page container.

### 4. Component Refactoring
- Split `AssignmentsPage` into smaller sub-components for better readability:
  - `AssignmentHeader`
  - `PlanBuilder` (Sliders)
  - `PlanSummary` (Card)
  - `EarningsCard`
  - `StickyCTA`

## Technical Details
- **File**: `src/routes/_authenticated/app.assignments.tsx`
- **File**: `src/components/partner/PartnerShell.tsx` (to be created or updated if existing)
- **Business Rule**: `monthly_earning = daily_earning * 26`.
- **UI Framework**: Tailwind CSS with Radix UI (shadcn) components.
- **Responsiveness**: Ensure layout stability across 360px - 412px widths.
