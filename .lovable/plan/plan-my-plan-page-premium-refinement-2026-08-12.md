# Plan: My Plan Page Premium Refinement

Refine the **My Plan** section of the Urban Wash customer app to match the new compact, premium, and lightweight visual language of the Home page, while overhauling the service photo proof experience.

## Technical Details

### 1. Global Visual Direction
- **Typography**: Shift towards 400 (secondary), 500 (UI text), and 600 (headings) weights. Avoid 700+ unless necessary.
- **Hierarchy**: Use subtle gray tones for secondary information and tighter spacing (8, 12, 16, 20, 24px).
- **Cards**: Standardize on 16–18px radius, white/subtle warm white bg, 1px light gray border, and minimal shadows.

### 2. Component Refinements
- **UWHeader**: Update `subscriptions.tsx` usage to ensure 17–19px medium/semibold title and compact vehicle selector (36px height).
- **Vehicle Information**: Refine the vehicle block in `subscriptions.tsx` to use 22px semibold titles and 13px muted registration text.
- **AwaitingPartnerBanner.tsx**:
  - Compact vertical height by ~15%.
  - Update typography: Headline 18px (600), Partner metadata 13px (400).
  - Clarify states: "Waiting for partner assignment", "Today's service completed ✓".
- **Subscription Card (`subscriptions.tsx`)**:
  - Plan name: 22px (600).
  - Pricing/Status: 16px (600) for price, 15px (400) for "days left".
  - Usage: 11px uppercase "MONTHLY USAGE", 14px (600) for day counts, 7–8px orange meter.
  - Renewal: 11px "NEXT RENEWAL", 18px (600) date, 13px (red) "Scheduled to end".
- **PlanInclusionsCard.tsx**:
  - Heading: 12px (600) muted uppercase.
  - Collapsed state: Show 3 benefits with green checkmarks + orange "+X more benefits" link.
  - Expandable list: 15px font size, smoother transition.
- **Action Buttons (`subscriptions.tsx`)**:
  - Height: 76px.
  - "Book Wash": Dark charcoal bg, 16px (600) title, 11px "Included" subtitle.
  - "Modify": White bg, 16px (600) title, 11px "Adjust plan" subtitle.
- **Secondary Actions**: Muted 14px (500) gray links for Pause/Cancel.
- **Detailed Usage**: Refine to 17px (600) heading, 14px labels/counters, and 6px progress bars.

### 3. Recent Service & Photo Proof Overhaul
- **RecentServiceFeed.tsx**:
  - Rename section to "RECENT SERVICE" (12px muted uppercase).
  - Redesign card hierarchy: Status -> Date/Time -> Vehicle/Service -> Photo Gallery -> View All -> Report Issue.
  - **Photo Gallery**:
    - Thumbnails: 72–82px square, 16px radius, object-fit cover.
    - Labels: Small "BEFORE" / "AFTER" / "SERVICE PHOTO" overlays with translucent bg.
    - "+X" tile: Show next photo as background with dark translucent overlay.
  - "View all photos →" link (13px).
  - "Report Issue" (13px orange) as a clear secondary link below gallery.
- **ServicePhotoViewer.tsx**:
  - Redesign as a premium full-screen viewer.
  - Header: Service name (17px bold), Date/Time (12px muted).
  - Footer: Before/After pill (white text, translucent bg), swipe counter (1/5), dots indicator.
  - Logic: Ensure smooth swipe and navigation.

### 4. Empty & Status States
- **NoSubscriptionState.tsx**: Compact centered card with 20px heading and black button.
- **Status Mapping**: Ensure clear transitions (SCHEDULED -> PARTNER ASSIGNED -> COMPLETED).

## User Review Required
> [!IMPORTANT]
> - Do you have any specific "Before/After" photo categories we should map, or should we default to "SERVICE PHOTO" for all unless specifically tagged by the partner? (Assuming default to "SERVICE PHOTO" if unknown).
> - The "Report Issue" window is currently 2 hours. Should we add a specific visual timer or keep the simple text countdown? (Will keep simple text as requested).
