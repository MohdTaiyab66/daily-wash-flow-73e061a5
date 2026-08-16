# Plan: Final Assignment Confirmation UI + CTA Polish

Refine the Partner Assignment Builder's primary action button and redesign the confirmation modal for a premium, production-ready Urban Wash experience on Android.

## User Review Required

> [!IMPORTANT]
> - The confirmation modal will be overhauled to focus on "Review your assignment" with clear icons and a premium black summary card.
> - The "START MY ASSIGNMENT" button will receive enhanced typography, height, and safe-area positioning.

- No business logic or calculation changes.
- No new database migrations.

## Proposed Changes

### UI & Styling

#### `src/routes/_authenticated/app.assignments.tsx`
- **Primary CTA**: Enhance the "START MY ASSIGNMENT" button with 64px height, bold typography, specific orange background, and premium shadow. Add a clear "CREATING ASSIGNMENT..." loading state.
- **Confirmation Modal (AlertDialog)**:
  - Redesign header with "CREATE ASSIGNMENT" and supporting text.
  - Implement a premium black summary card with white/orange highlights for Customer Target, Assignment Earning, and Service Days.
  - Use icon-based indicators (📍 MapPin) for location and duration.
  - Style buttons for clear visual hierarchy: Secondary "BACK" (white/border) and Primary "CONFIRM" (Urban Wash orange).
  - Ensure double-tap protection and loading states.

#### `src/components/partner/PartnerShell.tsx`
- Verify bottom nav height and safe-area interactions (already polished, but will ensure `z-index` and overlays are clean).

### Logic & Refinement
- Ensure `disabled` state on confirmation prevents multiple RPC calls.
- Optimize modal for small Android screens (360px+) by tightening spacing while maintaining readability.

## Technical Details

- Use standard Urban Wash orange: `#FF6B00`.
- Implement `AlertDialog` customizations to match the bottom-sheet feel described.
- Use `framer-motion` (already in dependencies) for subtle button press effects if applicable, otherwise standard CSS `active:scale`.
- Safe area handled via `env(safe-area-inset-bottom)` and standard tailwind utilities.
