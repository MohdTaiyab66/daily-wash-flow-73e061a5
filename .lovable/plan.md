# Home Page Premium Refinement Plan

Refine the Home page to be more compact, premium, and visually restrained, following the "Black + Orange + White" palette. Fix the carousel loading flash and layout shift.

## User Review Required

> [!IMPORTANT]
> - The service cards will be approximately 20% smaller.
> - The typography weights will be reduced to semibold/medium.
> - The "Daily Shine" carousel will show a skeleton loader instead of stale images to prevent flashing.

## Proposed Changes

### 1. Carousel Loading & Stability (P0)
- **DailyShineCarousel.tsx**:
    - Implement a skeleton loader state.
    - Reserve a fixed aspect-ratio container (e.g., `aspect-[16/7]`) to prevent layout shift.
    - Ensure new images are only shown when fully loaded.
    - Remove any stale image caching flash by checking for active loading state.
    - Fix potential clipping/shifting by ensuring overflow-hidden and proper object-fit.

### 2. Service Cards Compactness (P1)
- **UWServiceCard.tsx**:
    - Reduce overall card height and internal padding (12px).
    - Shrink image height (approx. 15-20% reduction).
    - Set a fixed height for the title area (2 lines) to ensure alignment.
    - Reduce typography: Title (15-16px), Duration (13px), Price (18-19px).
    - Scale down the "Add" (+) button to 36-38px with a subtle light-orange background.
    - Align all elements (image, title, price, button) across the row.

### 3. Typography & Hierarchy (P1)
- **home.tsx**:
    - Reduce "Our Services" heading size to 20-22px semibold.
    - Tighten vertical margins between sections (Header -> Carousel -> Heading -> Tabs -> Cards).
    - Update category tabs: height (44-48px), font (15-16px), reduced padding.
    - Implement the Black + Orange selected state for tabs.

### 4. Vehicle & Location Selectors (P2)
- **VehicleSelector.tsx**:
    - Redesign to match the "Black + Orange" premium look.
    - White background, dark text, orange vehicle icon, subtle border.
    - Reduce overall scale to not compete with the location selector.
- **UWHeader.tsx**:
    - Refine location selector weight: medium text, orange icon, minimal dropdown indicator.

### 5. Layout & Spacing (P2)
- **CustomerShell.tsx**:
    - Ensure the 70px footer remains compact and premium.
    - Refine the active "Home" pill (subtle orange background).
- **Global CSS/Kit**:
    - Ensure color system consistency: strictly Black, Orange, White, and Muted Gray.

## Technical Details
- Use Tailwind's `aspect-ratio` for carousel stability.
- Use `line-clamp-2` and fixed `min-h` for service titles.
- Implement `transition-opacity` for smooth image appearances in the carousel.
- Use `@tanstack/react-query` loading states to manage carousel skeleton visibility.
