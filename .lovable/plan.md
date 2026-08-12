# Home Page Premium Refinement Plan

Refine the Home page to be more compact, premium, and visually restrained, following the "Black + Orange + White" palette. Fix the carousel loading flash and layout shift.

## User Review Required

> [!IMPORTANT]
> - The service cards will be approximately 20% smaller.
> - The typography weights will be reduced to semibold/medium.
> - The "Daily Shine" carousel will show a skeleton loader instead of stale images to prevent flashing.
> - Card images will be slightly smaller with a consistent aspect ratio.

## Proposed Changes

### 1. Carousel Loading & Stability (P0)
- **src/components/customer/ui/UWFeaturedCarousel.tsx**:
    - Add an `isLoading` state.
    - Implement a skeleton loader (shimmering block) within a reserved `aspect-[21/9]` or similar container.
    - Ensure images only fade in once fully loaded (`onLoad`).
    - Standardize the aspect ratio to prevent top-shifting.

### 2. Service Cards Compactness (P1)
- **src/components/customer/ui/UWServiceCard.tsx**:
    - Reduce overall card height and internal padding from `px-2.5` to `px-2`.
    - Reduce image container height from `115px` to approx `96px`.
    - Adjust fixed title height for 2 lines (`line-clamp-2`) to ensure row alignment.
    - Reduce typography: Title (`14px`), Duration (`12px`), Price (`17-18px`).
    - Scale down the "Add" button to `34-36px`.
    - Switch background to a very light neutral (e.g. `bg-white` or `bg-slate-50`).

### 3. Typography & Hierarchy (P1)
- **src/routes/c/_authed/home.tsx**:
    - Reduce "Our Services" heading to `text-[19px]` semibold.
    - Tighten category tab height from `46px` to `42px`.
    - Reduce vertical margins (`mt-8` -> `mt-6` for sections).
    - Refine the category selection pills: narrower padding, cleaner border.

### 4. Vehicle & Location Selectors (P2)
- **src/components/customer/VehicleSelector.tsx**:
    - Redesign to follow the premium "Black + Orange" aesthetic.
    - Use a clean white background with a subtle black/gray border.
    - Update the vehicle icon to orange or black with orange accent.
- **src/components/customer/ui/UWHeader.tsx**:
    - Refine the location selector to be less bold (`font-medium`).
    - Update the right-side vehicle selector (inline version) to match the dropdown style.

### 5. Layout & Spacing (P2)
- **src/components/customer/CustomerShell.tsx**:
    - Ensure the 70px footer active state is a subtle peach/orange pill, not oversized.
- **src/components/customer/ui/kit.tsx**:
    - Update `SectionTitle` to be less heavy (`font-semibold` instead of `font-black`).

## Technical Details
- Use `aspect-ratio` for image containers.
- Use `object-cover` and fixed heights for card components to enforce alignment.
- Implement CSS transitions for opacity when images load to prevent "flash".
