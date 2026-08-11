# Location Flow Final UI/UX Redesign

Polish the location flow to match the Urban Wash premium aesthetic (Black + Orange + White) while preserving all existing backend logic and functionality.

## User Review Required

> [!IMPORTANT]
> - The redesign focuses on visual consistency with the Booking and Payment screens.
> - The map remains interactive but visually neutral (standard colors).
> - Green is reserved strictly for success/confirmation states.

- **Primary Action Buttons**: Switching from bright orange to dark charcoal with orange accents for a more premium look.
- **Selected Location Card**: Redesigning the current green card to a neutral/off-white compact component with a green status indicator.
- **Empty States**: Making dividers and instructional panels more compact to reduce vertical whitespace, optimized for the Samsung Galaxy A04e.

## Proposed Changes

### 1. Global Visual System
- Standardize colors: `BLACK` (#1A1A1A) for primary actions and headings, `URBAN WASH ORANGE` (#FF6B00) for accents and icons, `OFF-WHITE` (#FDFDFD) for surfaces.
- Use consistent typography and corner radius (18px-24px) to match the rest of the customer app.

### 2. Screen 1: "What's your location?"
- **Header**: Refine typography for a strong black heading and medium gray subtitle.
- **Map**: Maintain standard neutral colors (remove any brand-specific tints). Standard blue GPS dot.
- **Primary CTA**: Change to a dark charcoal button with white text and a navigation icon.
- **Secondary CTA**: Change "Enter location manually" to a clean text action with a subtle interaction.
- **Loading/Error States**: Implement subtle, non-disruptive feedback (locating... or inline error text).

### 3. Screen 2: Location Details & Search
- **Header**: Compact header with a circular back button (white bg, shadow, black arrow).
- **Selected Location**: Replace the large green card with a compact off-white component featuring a "✓ LOCATION SET" green status and a dark charcoal "Continue" button.
- **Search Field**: Refine with a subtle border, orange search icon, and premium shadow.
- **Current Location Card**: Make it more compact with a white background and orange icon.
- **Empty State & Divider**: Reduce vertical spacing and simplify the divider to a clean "── OR ──". Replace large empty state cards with compact informational panels.
- **Search Results**: Replace large cards with clean, serviceable rows.

## Technical Details

- **Component Refactoring**: Update `src/routes/c/location.search.tsx` to reflect the new MD3/Premium design hierarchy.
- **State Preservation**: All interactions with `useLocationFlowStore`, `google-maps-loader`, and `supabase` will remain unchanged.
- **Responsive Layout**: Use flexbox and relative heights to ensure all elements fit comfortably on the Samsung Galaxy A04e screen without unnecessary scrolling.
