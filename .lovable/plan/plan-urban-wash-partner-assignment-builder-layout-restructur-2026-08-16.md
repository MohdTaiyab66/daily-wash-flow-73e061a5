# Plan: Urban Wash Partner — Assignment Builder Layout Restructure

Restructure the Assignment Builder layout to improve information hierarchy and information accessibility on mobile screens.

## Proposed Changes

### 1. Layout & Header
- Reduce "BUILD YOUR ASSIGNMENT" header size to ~30-34px, single-line, bold, black.
- Remove the standalone "CUSTOMERS AVAILABLE NOW" card from the top.
- Tighten margins and eliminate excessive white space.

### 2. Hours Section
- Standardize "HOW MANY HOURS PER DAY?" slider label and current value.
- Keep the two side-by-side black cards (WORKING HOURS, CUSTOMER TARGET) directly below the slider.
- Ensure values update live.

### 3. Days Section
- Move "HOW MANY DAYS TO COMMIT?" slider directly after the hours section.
- Simplify information under the slider: "7 DAYS | 30 DAYS" and "X SERVICE DAYS • MONDAYS OFF".

### 4. Earning Section (New Location)
- Move the premium black Earning Card directly below the days slider.
- Simplify design:
  - Daily Earning (₹X / DAY)
  - Horizontal separator
  - Assignment Earning (₹X)
  - Service Days count
- Remove "MONTHLY PROJECTION" and redundant text.

### 5. Sticky CTA (Bottom)
- Maintain sticky behavior above the bottom navigation.
- Update button content to a two-line layout:
  - Line 1: START MY ASSIGNMENT →
  - Line 2: X CUSTOMERS AVAILABLE
- Ensure proper safe-area-bottom padding and scrolling clearance.

### 6. Bottom Navigation
- Standardize "AVAILABLE" label to fit on a single line.

## Technical Details

### UI Components
- **Typography**: Adjusting `h1` and `label` classes in `app.assignments.tsx`.
- **Spacing**: Reducing `space-y-X` values and manual margins.
- **CTA**: Modifying `Button` children to include the dynamic availability count.
- **Layout**: Reordering JSX sections in `app.assignments.tsx`.

### Business Logic
- **No changes**: Preserving existing `serviceDays`, `dailyEarn`, and `assignmentEarn` calculations.
- **Availability**: Continuing to use the logic (currently 0) for the CTA display.

### Responsiveness
- Testing on narrow viewports (360px+) to ensure the grid of black cards and slider labels don't wrap or clip.
