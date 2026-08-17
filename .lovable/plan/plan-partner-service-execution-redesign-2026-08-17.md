# Plan - Partner Service Execution Redesign

Redesign the partner service execution flow into a single, unified page to eliminate multi-step confusion and improve operational efficiency.

## User Review Required

> [!IMPORTANT]
> - The "After Photos" (4 angles) are currently a mandatory requirement in the backend `partner_complete_service` RPC. The new one-page flow focuses on the "Before Photo" and "Condition" but the backend still expects 5 photos total (1 before + 4 after) for a standard cleaning. I will keep the 4 after photos as the final step on the same page before completion.
> - "Unavailable Vehicle" will use the `submit_service_unavailable` RPC, which typically requires a note and proof photos.

- Do you want to keep the "4 After Photos" requirement as part of the unified page, or should "Complete Service" only require the "Before Photo"? (Current backend enforces all 5 for full credit).

## Proposed Changes

### Partner App

#### [Unified Service Page] `src/routes/_authenticated/app.service.$id.tsx`
- Remove the orange "CUSTOMER DETAILS" header; start with Customer Name.
- Eliminate internal `Step` navigation logic (arrival, found, notfound, dirty, etc.).
- Implement inline state management:
  - `status === "pending"`: Show compact summary + "START SERVICE" button.
  - `status === "in_progress"`:
    - Show numbered Vehicle Condition cards (Ready to clean, Very dirty, Unavailable).
    - Upon selection, expand the "Before Photo" slot and any specific requirements (Notes for unavailable) directly beneath the selected card.
    - If "Ready to clean" or "Very dirty" is selected, show the "After Photos" slots after the before photo is taken.
    - Enable "COMPLETE SERVICE" (orange CTA) only when requirements are met.
- Ensure the "Resume Service" state is automatic; reopening an `in_progress` service renders the active state immediately.
- Update the page header to show "IN PROGRESS" status clearly with a pulse indicator.

#### [Daily Route & Home Updates]
- Verify that `partner_complete_service` and `submit_service_unavailable` triggers correctly invalidate `route-today` and `today-assignment` queries.

## Technical Details

- **State Persistence**: Leverage existing `status` and `unavailable_reason` from the database. Use local component state for the "selected condition" during the session, with fallback to `service.unavailable_reason` for persistence.
- **RPC Usage**: 
  - `partner_complete_service` for Ready/Dirty paths.
  - `submit_service_unavailable` for Unavailable path.
- **UI Components**: 
  - Reuse `PhotoSlot` with updated `variant="hero"` or similar for inline display.
  - Remove `GuidedReport` and `Question` components in favor of inline conditional rendering.

## Constraints & Considerations
- Maintain Android 360px fit with `flex-1` side-by-side buttons for Navigate/Call.
- Ensure `MaskedCallButton` and `Navigation` buttons are always accessible at the top right.
