# FINAL LOCATION FLOW CLEANUP — REMOVE UNNECESSARY INTERMEDIATE PAGE

Correcting the location flow navigation to ensure a one-tap experience for "Use current location" and removing the redundant confirmation step.

## User-facing changes
- **One-Tap Current Location**: Tapping "Use current location" will now fetch GPS, reverse geocode, and navigate directly to the Home page upon success, skipping the "Location Set" confirmation screen.
- **Improved Loading State**: The "Finding location..." spinner remains on the initial screen or a dedicated loading view, preventing unnecessary intermediate screen transitions.
- **Manual Flow Preserved**: The manual search flow ("Enter location manually") will still show the confirmation screen, as manual selection requires an explicit "Continue" to confirm the chosen area.
- **Error Handling**: If GPS fails or permissions are denied, clear and actionable error messages will be displayed on the original screen.

## Technical details
- **Navigation Logic**: Update `src/routes/c/location.search.tsx` to call `handleContinue` automatically after successful GPS resolution in the `handleUseCurrentLocation` function.
- **State Management**: Ensure `useLocationFlowStore` is updated atomically and the `view` state transitions correctly.
- **Redundant Screen Removal**: Modify the `LocationFlow` component to only show the `search` view (confirmation screen) when explicitly coming from a manual entry selection.
- **Route Handling**: Verify `src/routes/c/index.tsx` (Splash) correctly redirects users with a saved area to `/c/home`.
- **Atomic Operations**: Persist location data (localStorage and database) before navigating to ensure Home renders with correct data immediately.
