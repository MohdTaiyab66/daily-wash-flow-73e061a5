# Location Flow Redesign Plan

Finalize the Location flow UI/UX to match Urban Wash's premium production standards, ensuring visual consistency with the Service and Payment screens.

## User Review Required

> [!IMPORTANT]
> - The "Use current location" button on the first screen will be reverted to **Urban Wash Orange**.
> - A dedicated **Location Search** screen will be implemented for manual entry to fix keyboard-related layout issues.
> - The map styling will remain natural (natural colors, no orange) to ensure readability and professionalism.

## Proposed Changes

### UI/UX Refinements
- **Screen 1 (Onboarding)**:
  - Revert primary CTA to brand orange with white text/icon.
  - Set secondary CTA ("Enter location manually") to plain bold black text.
- **Screen 2 (Confirmation)**:
  - Polished circular white back button.
  - Unified location confirmation card (white/off-white) with green success indicators.
  - Compact "OR" divider and informational panels to reduce vertical gaps.
- **Manual Search (Fix)**:
  - Implement a dedicated search view that replaces the map-dominant layout.
  - Ensure the search results panel stays above the Android keyboard.
  - Auto-focus the search field on entry.

### Interaction & Feedback
- Short "Finding your location..." loading pulse during GPS resolution.
- Smooth transitions between onboarding, locating, and confirmation states.
- Support for "Not Serviceable" state with clear but non-aggressive feedback.

### Technical Tasks
- **Zustand Store**: Update `location-flow-store.ts` to include a dedicated search state if needed, or manage it via route navigation.
- **Keyboard Handling**: Apply layout adjustments in `location.search.tsx` to handle viewport resizing on mobile devices (e.g., Samsung Galaxy A04e).
- **Map Behavior**: Ensure map updates correctly when a manual location is selected and persists during back navigation.

## Technical Details
- Using `google-maps-loader` for Map initialization.
- Google Places Autocomplete API for manual search.
- Tailwind CSS for premium MD3-style spacing and components.
- Capacitor `Geolocation` (via `getCurrentGps` helper) for position tracking.
