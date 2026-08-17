# Plan: Urban Wash Partner App — UI Polish & Final Next Stop Action Bar

Redesign the Daily Route page components in `app.live.tsx` to match the requested premium action bar, improved information hierarchy, and mobile fit.

## User Review Required

> [!IMPORTANT]
> - The **START** action will open the unified service page as requested.
> - **Monday Off** state will still be respected on the START button.
> - **Timestamps** will be converted to human-readable format (e.g., "7:40 PM").

## Proposed Changes

### Partner App (Daily Route)

#### 1. Next Stop Action Bar Redesign
- Change action row order to: `[ NAVIGATION ] [ START ] [ CALL ]`.
- **Navigation**: Compact circular icon-only button (22% width).
- **START**: Large primary orange CTA with play icon (56% width).
- **CALL**: Compact circular icon-only button (22% width).
- Update `MaskedCallButton` to support a circular icon-only variant.

#### 2. Information Hierarchy & Hierarchy Polish
- **Next Stop Card**: 
    - Fix raw ISO timestamp: `formatTime12(new Date(stop.started_at).toLocaleTimeString())` or equivalent.
    - Update status labels: `UPCOMING`, `READY`, `IN PROGRESS`, `COMPLETED`.
    - Ensure clear separation of vehicle info and status.
- **Up Next Cards**:
    - Tighter card height.
    - Larger customer name, smaller vehicle text.
    - Move time underneath.
    - Move route number to the left, arrow to the right.
    - Ensure no earnings/money display.

#### 3. General UI & Layout
- **Daily Progress**: Ensure progress bar accurately reflects `(done / total) * 100`.
- **Map**: Maintain position above Next Stop, ensure it doesn't exceed 280px height.
- **Mobile Fit**: Use responsive flex layouts; add bottom safe-area padding to prevent footer overlap.
- **Navigation Labels**: Ensure bottom nav labels (Available, Earnings, Rewards, Profile) fit without overflow.

## Technical Details

### Component Updates in `src/routes/_authenticated/app.live.tsx`

#### `MaskedCallButton`
- Add `variant="icon"` support.
- When `variant="icon"`, render a `h-12 w-12 rounded-full` button.
- Ensure it handles "no phone number" via a disabled state (though `initiateMaskedCall` usually handles the lookup, we'll check `stop.customers.phone` if available).

#### `NextCustomerHero`
- Implement the new 3-button flex layout.
- Bind all actions to the `stop` object passed to the component.
- Add time formatting helper for `started_at`.

#### `CompactQueueRow`
- Restructure JSX to put sequence number on the left and chevron on the right.
- Adjust font sizes for name vs vehicle.

#### `RoutePage`
- Ensure `total` and `done` are derived from the same source as the progress bar.
- Audit container padding and margins for 360px width compatibility.
