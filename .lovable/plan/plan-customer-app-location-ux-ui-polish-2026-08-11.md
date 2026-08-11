# Plan: Customer App Location UX/UI Polish

Refine the location flow for Screen 1 (Onboarding/Map) and Screen 2 (Details/Search) to achieve a premium, production-ready aesthetic for the Samsung Galaxy A04e while maintaining existing functionality.

## User Review Required

> [!IMPORTANT]
> - The map will use standard Google Maps colors (no brand orange tint).
> - GPS marker will be standard blue.
> - UI components (buttons, icons) will use Urban Wash orange.

## Proposed Changes

### Location Flow UI Refinement

#### [SCREEN 1] "What's your location?"
- **Map Styling Overhaul**: Remove all custom orange map styling (`mapStyles` in `src/routes/c/location.search.tsx`). Switch to a natural, high-quality map look (standard gray/white roads, green parks, blue water).
- **Blue GPS Marker**: Change the user's location marker from orange to a conventional blue circular marker with a subtle translucent accuracy radius.
- **Interactive Map**: Ensure the map allows pan/zoom and displays standard POIs/labels, avoiding a static graphic feel.
- **Header & Typography**: Refine "What's your location?" heading and subtitle for strong hierarchy and consistent spacing.
- **Primary CTA**: Polish the "Use current location" button with a premium rounded shape, subtle shadow, and white navigation icon.
- **Loading State**: Implement a "Locating you..." state with a polished indicator rather than a blank transition.

#### [SCREEN 2] "Location Details"
- **Premium Header**: Add a clean, compact header with a circular white back button (subtle shadow).
- **Compact Success Card**: Redesign the "LOCATION SET" banner to be a soft green, compact status component with a check icon and a green "Continue" button.
- **Refined Search Field**: Update the search input to a premium white field with a soft shadow, orange search icon, and consistent rounded corners (56-60px height).
- **Compact Action Card**: Shrink the "Use current location" card on Screen 2, using orange only for the icon and a "FASTEST WAY" accent.
- **Subtle Divider**: Replace the prominent divider with a subtle "── OR ──" line.
- **Modern Empty State**: Replace the large empty-state card with a compact, informational prompt ("Find your service area").
- **Clean Results List**: Style search results as clean cards with clear serviceability indicators (green for available, muted for unavailable).

### Technical Details
- **Responsive Layout**: Adjust container padding and flex properties to ensure no clipping or overlap on Samsung Galaxy A04e (respecting safe areas).
- **State Persistence**: Maintain current `useLocationFlowStore` logic for view transitions and location storage.
- **No Side Effects**: Strictly avoid modifying `paymentBridge.ts`, Razorpay SDK integration, or any backend RPCs/booking logic.

## Verification Plan

### Automated Tests
- **Playwright Visual Check**: Run a test script to capture screenshots of both screens on a simulated Galaxy A04e viewport.
- **Interaction Check**: Verify "Use current location" triggers the locating state and transitions to Screen 2.
- **Search Logic**: Verify typing in the search box displays the results area and subtle divider correctly.

### Manual Verification
- Verify map marker is blue and roads are not orange.
- Check "Continue" button visibility and functionality on Screen 2.
- Ensure back button on Screen 2 returns to Screen 1.
