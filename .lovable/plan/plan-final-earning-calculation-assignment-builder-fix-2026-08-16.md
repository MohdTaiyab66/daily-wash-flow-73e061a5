# Plan - Final Earning Calculation + Assignment Builder Fix

Correct the earning calculation logic to be dynamic based on the actual number of service days (excluding Mondays) within the selected commitment period, and overhaul the Assignment Builder UI to be more minimalist and clear.

## User Review Required

> [!IMPORTANT]
> The earning calculation now uses the actual calendar dates starting from today. Mondays are automatically excluded from the "Service Days" count.

- **Dynamic Earning**: Instead of a fixed 26-day projection, the app now calculates earnings based on the specific days selected (7-30 days).
- **Service Days Logic**: Calendar Days - Mondays = Service Days.
- **UI Labels**: Replaced "Monthly Earning" with "For your [X]-day assignment" to avoid confusion for short-term commitments.

## Proposed Changes

### Logic & Helpers
- Add `countServiceDays(days: number)` helper to `app.assignments.tsx` that:
    - Starts from `new Date()` (today).
    - Iterates for the number of calendar days.
    - Skips Mondays (day index 1).
    - Returns the count of service days.

### Assignment Builder UI (`src/routes/_authenticated/app.assignments.tsx`)
- **State Changes**: Remove `SERVICE_DAYS_PER_MONTH = 26` constant in favor of dynamic calculation.
- **Sliders & Labels**:
    - Update the "Commitment" slider section to show "X calendar days" and "Y service days (Mondays off)" immediately below it.
    - Ensure the earning card updates instantly as the slider moves.
- **Earning Card**:
    - Header: "YOUR EARNING".
    - Daily section: "₹408 / DAY".
    - Period section: "FOR YOUR [X]-DAY ASSIGNMENT" followed by the total for those specific service days.
    - Footer: "XX SERVICE DAYS • MONDAYS OFF".
- **Cleanup**: Remove projection text like "Monthly projection uses 26 service days".
- **Confirmation Dialog**: Update to show the actual duration and calculated earning instead of fixed monthly values.

### Shell & Navigation (`src/components/partner/PartnerShell.tsx`)
- Verify "Available" label fits on one line (already seems to use `whitespace-nowrap`).
- Ensure safe area padding prevents clipping.

## Technical Details
- The logic will use `new Date()` as the reference point for the assignment start.
- `dailyEarn = cars * rate`.
- `assignmentEarn = dailyEarn * countServiceDays(duration)`.
- Tailwind classes will be used to ensure the sticky CTA is positioned correctly above the 70px bottom nav.
