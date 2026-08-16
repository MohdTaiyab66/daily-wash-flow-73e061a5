# Plan - Daily Route Overhaul

Restore map functionality, implement interactive customer detail flow, and clean up duplicate UI while maintaining mobile-responsive layout.

## Design
- **Map:** Fixed 260px height, rounded corners, numbered interactive markers.
- **Header:** Clean single-line branding, remove duplicate "Partner" logo block.
- **Interactions:** Marker tap selects customer; row tap opens Sheet with detailed view.
- **Rules:** Preserve "Start Service" eligibility logic (time-based).

## Technical
- **State:** Add `selectedStopId` to `RoutePage` state.
- **UI:** 
  - Use `Sheet` for customer details (premium bottom-up view).
  - Use `Google Maps` `Marker` click listeners.
  - Refactor `CompactQueueRow` to be a clickable `button`.
- **Security:** Ensure `+₹17` remains absent; overall earnings pulled from live assignment state.
- **Responsive:** Hard `box-border` and `w-full` on all new elements.

## Steps
1. **Audit Map:** Fix `LiveMap.tsx` initialization to ensure script loads and markers are interactive.
2. **Detail View:** Implement `CustomerDetailSheet` component within `app.live.tsx`.
3. **Header/Layout:** Remove duplicate branding, adjust map height, and remove white gaps.
4. **Interactions:** Link map markers and list rows to open the detail sheet.
5. **Validation:** Verify mobile widths and timing rules.
