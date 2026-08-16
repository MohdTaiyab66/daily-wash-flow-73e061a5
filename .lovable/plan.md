# Plan - Fix Daily Route Page (Map, Customer List, Mobile UI)

Restore the interactive map, improve the customer list interaction, and refine the mobile UI on the Daily Route page.

## User Review Required

> [!IMPORTANT]
> - The map will be restored between "Today's Progress" and "Next Stop".
> - Every customer card in the "Up Next" list will be fully clickable to open the detail sheet.
> - "Up Next" cards will be updated to show vehicle information and have a more compact layout.

## Proposed Changes

### Daily Route Page (`src/routes/_authenticated/app.live.tsx`)

#### Map Restoration & Design
- Restore the `LiveMap` component.
- Set map height to **280px** (responsive) with **24px rounded corners**.
- Ensure the map fits all customer markers and the partner's location automatically.
- Fix the issue where a blank white box appeared instead of the map.

#### Customer List Enhancements
- Update `CompactQueueRow` to:
    - Include vehicle information (Make/Model).
    - Be more compact vertically.
    - Make the entire row tappable (using a `button` or `Link`).
- Ensure all 16 (or however many) customers can be opened in the detail sheet.

#### Mobile UI & Spacing
- Adjust layout spacing to remove excessive gaps.
- Enforce consistent horizontal padding (16-20px).
- Add safe bottom padding to prevent the last card from being covered by the bottom navigation.
- Ensure no horizontal overflow.

#### Interaction Logic
- Connect map markers and list items: tapping a marker opens the same detail sheet as tapping a list item.
- Ensure marker numbers match the route sequence (1, 2, 3...).

### Map Component (`src/components/LiveMap.tsx`)
- Audit the `fitBounds` logic to ensure it reliably zooms to show all points.
- Ensure road-route polyline is visible and updated correctly.
- Add numbered labels to markers matching the `sequence_no`.

## Technical Details
- Use the existing `LiveMap` component which integrates with Google Maps.
- Utilize `TappableVehicleImage` where appropriate or just text for the compact list.
- Use `box-sizing: border-box` and `overflow-x-hidden` to prevent layout breaks.
- Ensure the `stops` data passed to `LiveMap` is sorted and filtered correctly.
