# My Plan Premium Customization Refinement

Final refinement of the "My Plan" dashboard to align with the marketplace-compact design system, emphasizing service proof as a core trust feature, calibrating typography for a premium feel, and optimizing section hierarchy.

## Design Goals
- **Premium Compactness:** Reduce visual weight while maintaining comfortable readability.
- **Trust Focus:** Elevate "Service Proof" (photos) as the primary indicator of value.
- **Hierarchy:** Status -> Plan -> Inclusions -> Actions -> Service Proof -> Usage.
- **Typography:** 600 weight max for headings, 500 for UI labels, 400 for descriptions.

## Proposed Changes

### 1. Header & Vehicle Context (`subscriptions.tsx`, `UWHeader.tsx`)
- Adjust `UWHeader` to be more compact (72–78px target).
- Calibrate Vehicle Info: Title 20px (600), Reg 13.5px (400). Reduce vertical gap.
- Ensure the header title "My Plan" is 18–20px (500-600).

### 2. Today's Service Card (`AwaitingPartnerBanner.tsx`)
- Reduce height by 10–15% (Target: 260–290px depending on state).
- Hierarchy: Window title (11px uppercase) -> Time/Service (17px semibold) -> Status chip.
- Implement explicit state-based UI:
  - **Scheduled:** "Today's service" + Partner + Rating.
  - **In Progress:** "Service in progress" + Partner.
  - **Completed:** "Service completed ✓" + Completion time.
  - **Searching:** "Waiting for area assignment" + Descriptive text.

### 3. Active Plan Card (`subscriptions.tsx`)
- Refine typography: Plan name 20px (600), Price 16px (600), Remaining days 14px (400 muted).
- Standardize labels: 12-13px semibold uppercase, muted gray.
- **Renewal Status:** Compact presentation.
  - *Auto-renew:* "25 Aug Auto-renews" (Subtle green).
  - *Scheduled-to-end:* "25 Aug Scheduled to end" (Muted red).

### 4. What's Included (`PlanInclusionsCard.tsx`)
- Standardize heading: 13px (600), uppercase, tracking.
- Benefit items: 14.5px (400-500). Use consistent green check icons.
- **View All:** Interactive expansion with smooth height animation.
  - "+X more benefits" (muted gray) · "View all →" (orange).

### 5. Actions & Secondary Links (`subscriptions.tsx`)
- **Book Wash:** 90–100px height, charcoal bg. Title 16px (600), Subtitle 11px (600 uppercase "INCLUDED").
- **Modify:** White bg, subtle border. Subtitle "ADJUST PLAN".
- **Pause/Cancel:** Reduce weight to 14px (500) muted gray links. Remove primary CTA feel.

### 6. Recent Service & Photo Proof (`RecentServiceFeed.tsx`)
- Rename to "RECENT SERVICE" (13px 600 uppercase).
- **Hierarchy:** Service Name (15.5px 600) -> Status/Date (13.5px 500 green) -> Meta (13.5px 400 muted).
- **Photo Proof:** 4 thumbnails (76px square, 16px radius, gap 8px).
  - Labels: "BEFORE" / "AFTER" / "SERVICE PHOTO" on translucent dark overlay.
  - "+X Overlay": Dark overlay on the actual next photo.
- **Issue Reporting:** "Report an issue · 118 min left" (Dynamic countdown) vs "Issue reporting closed".

### 7. Full Photo Viewer (`ServicePhotoViewer.tsx`)
- Refine for minimalist focus.
- Metadata in viewer: Service, Vehicle, Completed Time, Partner.
- Clear photo count (e.g., "1 / 5") and stage labels.

### 8. Plan Usage (`subscriptions.tsx`)
- Consistent heading: "PLAN USAGE" (13px 600 uppercase).
- Labels: 14px. Progress bars: 6px height.
- Ensure terminology consistency (Service Days vs Wash Entitlements).

## Verification Plan
- [ ] Toggle vehicle switching to verify isolation of all data points.
- [ ] Inspect responsive layout on mobile viewports.
- [ ] Verify "View all" inclusions expansion animation.
- [ ] Check photo viewer swipe and metadata accuracy.
