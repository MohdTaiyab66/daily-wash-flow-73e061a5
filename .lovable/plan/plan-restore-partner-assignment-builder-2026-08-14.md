# Plan - Restore Partner Assignment Builder

Restore the comprehensive "Build Your Assignment" functionality for new partners, including sliders for hours per day and assignment duration, dynamic plan calculation, and a motivated earnings display, while maintaining the new premium design language.

## User Review Required

> [!IMPORTANT]
> - The plan uses existing `preview_assignment` and `accept_assignment_v2` logic to ensure consistency with backend business rules.
> - Monthly earnings will strictly follow the `daily * 26` rule as requested.
> - The UI will be restructured for better hierarchy (Area -> Inputs -> Plan -> Earnings -> CTA).

## Proposed Changes

### Database & Backend Functions
- No changes to `preview_assignment` or `accept_assignment_v2` are expected, but they will be verified for compatibility with the restored inputs.

### Partner Application

#### Assignment Builder Redesign (`src/routes/_authenticated/app.assignments.tsx`)
- **Area Header**: Keep the current Indira Nagar area selector at the top.
- **Interactive Inputs**:
  - Add a "Hours Per Day" slider (2-6 hours).
  - Add an "Assignment Duration" slider (7-30 days).
- **Today's Plan Section**:
  - Dynamic display of Working Hours, Customer Count, Start Time, and Finish Time.
- **Your Earnings Section**:
  - Prominent display of:
    - Estimated Today (Gross)
    - Estimated Fuel (using existing logic)
    - Estimated Net Today
    - Estimated Over Commitment (Monthly Net)
- **Dynamic Capacity Logic**:
  - Ensure `acceptableCars` calculation correctly distinguishes between partner capacity and actual area availability.
  - Show "X customers currently available" text when availability is low.
- **Premium Styling**:
  - Use Urban Wash orange (`primary`) for active states and CTAs.
  - Use clean cards with consistent spacing and typography.

#### Logic Restoration
- Reconnect `computeStartTime` and `addHours` helpers to the new UI.
- Ensure the `accept.mutate` call passes both `cars` and `duration` correctly.

## Verification Plan

### Automated Tests
- Use Playwright to simulate:
  - Moving the hours slider and verifying plan/earnings updates.
  - Moving the duration slider and verifying the monthly projection.
  - Changing the area and verifying availability updates.
  - Clicking "Build Route" and verifying navigation to the live route.

### Manual Verification
- Verify the "Monthly Earnings" follows the `daily * 26` rule.
- Verify fuel costs are subtracted correctly based on `fuel_cost_per_car` or mileage settings.
- Check the "Low Availability" UX when selected hours exceed area customers.
