# Plan: My Plan Final UI Refinement

Refine the "My Plan" page to be more premium, compact, and professional (Black + Orange focused). Merge redundant cards, redesign status containers, and overhaul the service photo experience into a high-trust verification system.

## Proposed Changes

### 1. Unified Plan Card
- Merge "Daily Shine Subscription" and "Plan Usage" into a single, compact "Active Plan" card.
- **Visuals**: White background, thin neutral border, minimal shadow.
- **Content**:
  - Top: "DAILY SHINE" (Black) | "ACTIVE" (Green badge).
  - Middle: Price (₹999/month) | Days left (13 days left).
  - Usage: "SERVICE DAYS" (15/25 used) with a thin orange progress bar.
  - Usage: "INTERIOR WASH" (0/1 used) with a thin gray progress bar.
  - Bottom: "Next Renewal" date | Renewal status ("Auto-renews" vs "Scheduled to end").
- **Actions**: Smaller, premium "Book Wash" (Black) and "Modify" (White w/ border) buttons side-by-side. Muted "Pause subscription" and "Cancel plan" links below.

### 2. Service Window & Today's Service
- Redesign the "Today's Service" card to be 60-70% of its current height.
- **Visuals**: Remove large green background. Use white background with subtle status pills.
- **Typography**: Reduce font weights (Semibold max) and padding.
- **Content**: "TODAY'S SERVICE" | "SCHEDULED" badge. Compact partner info (Name, Rating, Status).

### 3. Service Photo Overhaul
- **Component**: Update `RecentServiceFeed.tsx` and `ServicePhotoViewer.tsx`.
- **Carousel**: Replace the static grid with a horizontally swipeable photo slider (Aspect ratio ~3:2).
- **Metadata**: Preserve and display actual capture metadata (BEFORE, AFTER, DIRTY VEHICLE).
- **Empty State**: Show a trust-building message: "Your service photos will appear here after the partner completes the service." Remove demo/fake images.
- **Viewer**: Professional full-screen gallery with swiping, service details, and metadata.

### 4. Visual Cleanup & Consistency
- **Audit**: Replace all "24 service days" references with "25" in both UI and data logic.
- **Colors**: Shift from pastel greens/creams to Black/White/Orange. Use green/red only for status.
- **Typography**: Standardize Semibold (600) for titles, Regular for body, Muted for labels.
- **Hierarchy**:
  1. Header/Vehicle Selector
  2. Today's Service (if any)
  3. Active Plan Card (merged)
  4. What's Included (compact)
  5. Recent Service (swipeable photos)

## Technical Details

- **File Modifications**:
  - `src/routes/c/_authed/subscriptions.tsx`: Main page overhaul and card merging.
  - `src/components/customer/RecentServiceFeed.tsx`: Slider implementation and photo card cleanup.
  - `src/components/customer/ServicePhotoViewer.tsx`: Metadata support and gallery UI polish.
  - `src/components/customer/PlanInclusionsCard.tsx`: Compact view refinement.
  - `src/components/customer/AwaitingPartnerBanner.tsx`: Today's service card compactness.
- **Data Integrity**: Ensure vehicle switching (`selectedVehicleId`) correctly filters all plan, history, and photo data. Verify all entitlements use `25` as the base for Daily Shine.
